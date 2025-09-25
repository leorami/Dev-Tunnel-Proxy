#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { probe } = require('../utils/assetProbe');
const { fetchRaw, extractApiCandidatesFromHtml, extractApiCandidatesFromJs, testApiSet, tryWsUpgrade } = require('../utils/apiProbe');
const { discoverNgrokUrl, discoverNgrokUrlSync } = require('../utils/ngrokDiscovery');
const { parseAppsDirectory } = require('../utils/nginxParser');

function ensureDirs() {
  const artifactsDir = path.join(__dirname, '..', '.artifacts');
  const reportsDir = path.join(artifactsDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  return { artifactsDir, reportsDir };
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

function isLikelyHtmlContentType(ct) {
  return (ct || '').toLowerCase().includes('text/html');
}

function inferTypeFromUrl(u) {
  const q = u.split('?')[0];
  if (q.endsWith('.js')) return 'js';
  if (q.endsWith('.css')) return 'css';
  if (q.endsWith('.ico')) return 'ico';
  if (q.endsWith('.png')) return 'png';
  if (q.endsWith('.jpg') || q.endsWith('.jpeg')) return 'jpg';
  return 'other';
}

async function scanApiCandidates(pageUrl, pageHtml, assets) {
  const candidates = new Set();
  // from HTML
  extractApiCandidatesFromHtml(pageHtml).forEach((c) => candidates.add(c));
  // from JS assets by re-fetching with body
  const jsAssets = assets.filter((a) => a.ok && (/(javascript)/i.test(a.type || '') || inferTypeFromUrl(a.url) === 'js'));
  const origin = originOf(pageUrl);
  const jsBodies = await Promise.all(jsAssets.map((a) => fetchRaw(new URL(a.key || a.url, origin).toString())));
  for (const res of jsBodies) {
    if (res && res.ok && res.body) {
      extractApiCandidatesFromJs(res.body).forEach((c) => candidates.add(c));
    }
  }
  // Always include common health endpoint
  candidates.add('/api/health');
  return Array.from(candidates);
}

function analyzeAssetFailures(assets) {
  const failures = [];
  for (const a of assets) {
    const kind = inferTypeFromUrl(a.url);
    const suspicious = (kind === 'js' || kind === 'css') && isLikelyHtmlContentType(a.type);
    if (!a.ok || a.size === 0 || suspicious) {
      failures.push({
        url: a.url,
        status: a.status,
        size: a.size,
        type: a.type,
        reason: !a.ok ? 'http_error' : a.size === 0 ? 'empty' : 'html_instead_of_asset',
      });
    }
  }
  return failures;
}

async function runHealthFor(pageUrl, _unused_apiOwner) {
  const { base, page, assets } = await probe(pageUrl);
  const origin = originOf(pageUrl);
  const pageRes = await fetchRaw(pageUrl);
  const apiCandidates = await scanApiCandidates(pageUrl, pageRes.body || '', assets);
  // Test as-is
  const apiChecks = await testApiSet(origin, apiCandidates);
  // Test prefixed API variants based on discovered routes
  const prefixedChecks = []; // Will be populated if we discover route prefixes from nginx config
  const ws = await tryWsUpgrade(origin);
  const assetFailures = analyzeAssetFailures(assets);
  // Note: Apps referencing /api in their code is NORMAL, not a conflict
  // Real conflicts are nginx config route declarations, handled by nginxParser
  const conflict = null; // Removed flawed API usage conflict detection
  return {
    page: { ok: page.ok, status: page.status },
    origin,
    counts: { assets: assets.length, assetFailures: assetFailures.length, apiCandidates: apiCandidates.length },
    assetFailures,
    api: { asIs: apiChecks, prefixed: prefixedChecks },
    websocket: ws,
    apiConflict: null, // Removed flawed conflict detection
  };
}

function renderSummary(name, result) {
  const lines = [];
  lines.push(`## ${name}`);
  lines.push(`- page: ${result.page.ok ? 'OK' : 'FAIL'} (${result.page.status})`);
  lines.push(`- assets: ${result.counts.assets} (failures: ${result.counts.assetFailures})`);
  lines.push(`- api candidates: ${result.counts.apiCandidates}`);
  lines.push(`- ws upgrade: ${result.websocket.ok ? 'OK' : `FAIL (${result.websocket.status || result.websocket.error || ''})`}`);
  const badApis = result.api.asIs.filter((c) => !c.ok || c.status >= 300);
  const badApisPref = result.api.prefixed.filter((c) => !c.ok || c.status >= 300);
  if (badApis.length) lines.push(`- api errors (as-is): ${badApis.length}`);
  if (badApisPref.length) lines.push(`- api errors (prefixed): ${badApisPref.length}`);
  return lines.join('\n');
}

async function main() {
  const { reportsDir } = ensureDirs();
  const ngrok = discoverNgrokUrlSync(); // Use sync version for backward compatibility
  // Discover routes from nginx config and check for conflicts
  const appsDir = path.join(__dirname, '..', 'apps');
  let routes = [];
  try {
    routes = parseAppsDirectory(appsDir);
    
    // Display nginx config conflicts (route declaration conflicts)
    if (routes.conflictWarnings && routes.conflictWarnings.length > 0) {
      console.log('\n⚠️  Nginx Configuration Conflicts:');
      routes.conflictWarnings.forEach(warning => console.log(`   ${warning}`));
    }
  } catch {}
  
  // Find a suitable test route (prefer non-API routes)
  const testRoute = routes.find(r => r.route && r.route !== '/api/' && !r.route.startsWith('/api/')) 
    || routes.find(r => r.route && r.route !== '/')
    || { route: '/health.json' }; // fallback
  
  const base = process.env.LOCAL_PROXY_BASE || 'http://localhost:8080';
  const targets = [
    { name: 'local-proxy', url: `${base.replace(/\/$/, '')}${testRoute.route}` },
    ...(ngrok ? [{ name: 'ngrok', url: `${ngrok.replace(/\/$/, '')}${testRoute.route}` }] : []),
  ];

  const results = {};
  for (const t of targets) {
    try {
      results[t.name] = await runHealthFor(t.url, null); // No longer need apiOwner
    } catch (e) {
      results[t.name] = { error: e.message };
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(reportsDir, `health-${stamp}.json`);
  const mdPath = path.join(reportsDir, `health-${stamp}.md`);

  const md = [
    `# Dev Proxy Health Report`,
    `Generated: ${new Date().toISOString()}`,
    `Proxy: ${ngrok || 'not discovered'}`,
    '',
    results['local-proxy'] ? renderSummary('local-proxy', results['local-proxy']) : 'local-proxy: failed to run',
    '',
    ngrok && results['ngrok'] ? renderSummary('ngrok', results['ngrok']) : '',
    '',
    '### Notes',
    '- Asset failures include empty responses, non-2xx, or HTML returned for JS/CSS.',
    '- API candidates are extracted from page HTML and JS assets.',
  ].filter(Boolean).join('\n');

  const out = { generatedAt: new Date().toISOString(), ngrok, results };
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  fs.writeFileSync(mdPath, md);
  // Also quick links
  fs.writeFileSync(path.join(reportsDir, 'health-latest.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'health-latest.md'), md);

  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
