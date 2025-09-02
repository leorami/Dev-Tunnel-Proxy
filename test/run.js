#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { probe } = require('../utils/assetProbe');
const { fetchRaw, extractApiCandidatesFromHtml, extractApiCandidatesFromJs, testApiSet, tryWsUpgrade } = require('../utils/apiProbe');
const { discoverNgrokUrl } = require('../utils/ngrokDiscovery');
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
  // Always include health endpoints
  candidates.add('/api/health');
  candidates.add('/mxtk/api/health');
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

async function runHealthFor(pageUrl, apiOwner) {
  const { base, page, assets } = await probe(pageUrl);
  const origin = originOf(pageUrl);
  const pageRes = await fetchRaw(pageUrl);
  const apiCandidates = await scanApiCandidates(pageUrl, pageRes.body || '', assets);
  // Test as-is
  const apiChecks = await testApiSet(origin, apiCandidates);
  // If a candidate starts with /api, also test /mxtk variant
  const prefixed = Array.from(new Set(apiCandidates
    .filter((p) => p.startsWith('/api/'))
    .map((p) => `/mxtk${p}`)));
  const prefixedChecks = prefixed.length ? await testApiSet(origin, prefixed) : [];
  const ws = await tryWsUpgrade(origin);
  const assetFailures = analyzeAssetFailures(assets);
  const usesBareApi = apiCandidates.some((p) => p.startsWith('/api/'));
  const conflict = usesBareApi && apiOwner && !pageUrl.includes('/encast');
  return {
    page: { ok: page.ok, status: page.status },
    origin,
    counts: { assets: assets.length, assetFailures: assetFailures.length, apiCandidates: apiCandidates.length },
    assetFailures,
    api: { asIs: apiChecks, prefixed: prefixedChecks },
    websocket: ws,
    apiConflict: conflict ? `Page references /api while owned by ${apiOwner}` : null,
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
  const ngrok = discoverNgrokUrl();
  // Discover who owns /api/
  const appsDir = path.join(__dirname, '..', 'apps');
  let apiOwner = null;
  try {
    const routes = parseAppsDirectory(appsDir);
    const apiRoute = routes.find((r) => r.route === '/api/');
    if (apiRoute) apiOwner = apiRoute.sourceFile || 'unknown';
  } catch {}
  const targets = [
    { name: 'local-dev', url: 'http://localhost:2000/institutions' },
    { name: 'local-proxy', url: 'http://localhost:8080/mxtk/institutions' },
    ...(ngrok ? [{ name: 'ngrok', url: `${ngrok.replace(/\/$/, '')}/mxtk/institutions` }] : []),
  ];

  const results = {};
  for (const t of targets) {
    try {
      results[t.name] = await runHealthFor(t.url, apiOwner);
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
    `Ngrok: ${ngrok || 'not discovered'}`,
    `API owner: ${apiOwner || 'unknown'}`,
    '',
    renderSummary('local-dev', results['local-dev']),
    '',
    renderSummary('local-proxy', results['local-proxy']),
    '',
    ngrok ? renderSummary('ngrok', results['ngrok']) : '',
    '',
    '### Notes',
    '- Asset failures include empty responses, non-2xx, or HTML returned for JS/CSS.',
    '- API candidates are extracted from page HTML and JS assets; both /api and /mxtk/api are tested.',
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
