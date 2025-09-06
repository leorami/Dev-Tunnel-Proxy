#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { parseAppsDirectory } = require('../utils/nginxParser');
const { probe } = require('../utils/assetProbe');
const { fetchRaw, extractApiCandidatesFromHtml, extractApiCandidatesFromJs, testApiSet, tryWsUpgrade } = require('../utils/apiProbe');
const { discoverNgrokUrl } = require('../utils/ngrokDiscovery');

function ensureDirs() {
  const artifactsDir = path.join(__dirname, '..', '.artifacts');
  const reportsDir = path.join(artifactsDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  return { artifactsDir, reportsDir };
}

function isAssetBucket(route) {
  const buckets = ['/art/', '/icons/', '/organizations/', '/minerals/', '/media/'];
  return buckets.some((b) => route.startsWith(b));
}

function likelyHtmlRoute(route) {
  if (route === '/api/') return false;
  if (isAssetBucket(route)) return false;
  return true;
}

function originOf(url) { try { return new URL(url).origin; } catch { return null; } }

async function scanApiCandidates(pageUrl, pageHtml, assets) {
  const candidates = new Set();
  extractApiCandidatesFromHtml(pageHtml || '').forEach((c) => candidates.add(c));
  const origin = originOf(pageUrl);
  const jsAssets = assets.filter((a) => a.ok && ((a.type||'').includes('javascript') || (a.url||'').endsWith('.js')));
  const jsBodies = await Promise.all(jsAssets.map((a) => fetchRaw(new URL(a.key || a.url, origin).toString())));
  for (const res of jsBodies) {
    if (res && res.ok && res.body) extractApiCandidatesFromJs(res.body).forEach((c) => candidates.add(c));
  }
  // Always include common health endpoint
  candidates.add('/api/health');
  return Array.from(candidates);
}

async function runForTarget(base, route, _unused_apiOwner) {
  const url = `${base.replace(/\/$/, '')}${route}`;
  const pageRes = await fetchRaw(url);
  const htmlLike = pageRes.ok && /text\/html/i.test(pageRes.headers && pageRes.headers['content-type'] || '');
  let assets = [];
  let api = { asIs: [], prefixed: [] };
  if (htmlLike) {
    const pr = await probe(url);
    assets = pr.assets || [];
    const candidates = await scanApiCandidates(url, pageRes.body || '', assets);
    api.asIs = await testApiSet(base, candidates);
    // Note: Prefixed API testing could be added here if specific route prefixes are detected from nginx config
    api.prefixed = [];
  }
  const wsCandidates = ['/\n_ext/webpack-hmr', '/_next/webpack-hmr', '/sockjs-node', '/socket.io/?EIO=4&transport=websocket'];
  // Try a couple of ws endpoints; success on any is considered OK
  const wsAttempts = [];
  for (const p of wsCandidates) {
    const o = await tryWsUpgrade(base);
    wsAttempts.push({ path: p, ok: o.ok, status: o.status || 0, error: o.error || null });
    if (o.ok) break;
  }
  const ws = wsAttempts.find((a) => a.ok) || wsAttempts[wsAttempts.length - 1] || { ok: false };
  // Note: Apps referencing /api in their code is NORMAL behavior, not a conflict
  // Real conflicts are when multiple nginx configs declare the same route
  const apiConflict = null; // No longer flag apps for using /api endpoints
  return {
    url,
    status: pageRes.status || 0,
    htmlLike,
    assetsSummary: { count: assets.length },
    apiSummary: { asIsFails: (api.asIs || []).filter((x) => !x.ok).length, prefixedFails: (api.prefixed || []).filter((x) => !x.ok).length },
    apiConflict,
    websocket: ws,
  };
}

async function main() {
  const { reportsDir } = ensureDirs();
  const routes = parseAppsDirectory(path.join(__dirname, '..', 'apps'));
  const ngrok = discoverNgrokUrl();
  
  // Check for nginx config conflicts (multiple .conf files declaring same route)
  const nginxConflicts = routes.conflictWarnings || [];
  if (nginxConflicts.length > 0) {
    console.log('⚠️  Nginx Configuration Conflicts:');
    nginxConflicts.forEach(warning => console.log(`   ${warning}`));
    console.log('');
  }
  const metadata = {};
  for (const r of routes) {
    metadata[r.route] = { sourceFile: r.sourceFile, upstream: r.upstream };
  }
  const localBase = process.env.LOCAL_PROXY_BASE || 'http://localhost:8080';
  const targets = [
    { name: 'local-proxy', base: localBase },
    ...(ngrok ? [{ name: 'ngrok', base: ngrok }] : []),
  ];

  const summary = {};
  for (const t of targets) {
    summary[t.name] = {};
    for (const r of routes) {
      // Only probe likely HTML routes deeply; still record simple status for others
      try {
        summary[t.name][r.route] = await runForTarget(t.base, r.route, null); // No longer need apiOwner
      } catch (e) {
        summary[t.name][r.route] = { error: e.message };
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(reportsDir, `scan-apps-${stamp}.json`);
  const body = { 
    generatedAt: new Date().toISOString(), 
    ngrok, 
    metadata, 
    summary,
    nginxConflicts: routes.conflictSummary || {},
    nginxWarnings: routes.conflictWarnings || []
  };
  fs.writeFileSync(jsonPath, JSON.stringify(body, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'scan-apps-latest.json'), JSON.stringify(body, null, 2));
  console.log(`Scanned ${routes.length} route(s). Report: ${jsonPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });


