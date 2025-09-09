#!/usr/bin/env node
/* Minimal Conflict Management API (no external deps)
   Endpoints:
   - GET  /api/config/:file
   - POST /api/config/:file    { content }
   - POST /api/resolve-conflict { route, winner }
   - POST /api/rename-route     { oldRoute, newRoute, configFile }

   AI Assistant (optional via OPENAI_API_KEY):
   - GET  /api/ai/health
   - POST /api/ai/ask          { query, maxDocs?, systemHint? }
   - POST /api/ai/diagnose     { hint? }
   - POST /api/ai/self-check   { heal?: boolean, hint?: string }
*/

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const calliopeHealing = require('./calliopeHealing');

const ROOT = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');
const ARTIFACTS_DIR = path.join(ROOT, '.artifacts');
const RES_FILE = path.join(ARTIFACTS_DIR, 'route-resolutions.json');
const EMBED_FILE = path.join(ARTIFACTS_DIR, 'ai-embeddings.json');
const DOCS_DIR = path.join(ROOT, 'docs');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const README = path.join(ROOT, 'README.md');
const TROUBLESHOOTING = path.join(ROOT, 'TROUBLESHOOTING.md');
const PROJECT_INTEGRATION = path.join(ROOT, 'PROJECT-INTEGRATION.md');

function send(res, code, data, headers = {}){
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
}

function parseBody(req){
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => buf += c);
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); }
    });
  });
}

function safeConfigPath(file){
  // Only allow single filename like encast.conf or paths under apps/
  if (!file || file.includes('..')) return null;
  const candidates = [
    path.join(APPS_DIR, file),
    path.join(ROOT, file),
  ];
  for (const p of candidates){
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  // Fallback: search under apps for filename
  const p2 = path.join(APPS_DIR, path.basename(file));
  if (fs.existsSync(p2)) return p2;
  return null;
}

function nginxTestAndMaybeReload(){
  const test = spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-t'], { encoding: 'utf8' });
  if (test.status !== 0){
    return { ok:false, stderr: (test.stderr||'').trim() || (test.stdout||'').trim() };
  }
  spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-s', 'reload'], { encoding: 'utf8' });
  return { ok:true };
}

function loadResolutions(){
  try{
    if (fs.existsSync(RES_FILE)) return JSON.parse(fs.readFileSync(RES_FILE, 'utf8'));
  }catch{}
  return {};
}
function saveResolutions(obj){
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(RES_FILE, JSON.stringify(obj, null, 2));
}

async function handle(req, res){
  const u = url.parse(req.url, true);
  const seg = (u.pathname || '/').split('/').filter(Boolean);

  // CORS for convenience (not strictly needed when proxied)
  if (req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try{
    // GET /api/config/:file
    if (req.method === 'GET' && seg[0] === 'api' && seg[1] === 'config' && seg[2]){
      const p = safeConfigPath(seg.slice(2).join('/'));
      if (!p) return send(res, 400, { error: 'Invalid file' });
      const content = fs.readFileSync(p, 'utf8');
      return send(res, 200, { file: path.relative(ROOT, p), content });
    }

    // POST /api/config/:file  { content }
    if (req.method === 'POST' && seg[0] === 'api' && seg[1] === 'config' && seg[2]){
      const p = safeConfigPath(seg.slice(2).join('/'));
      if (!p) return send(res, 400, { error: 'Invalid file' });
      const body = await parseBody(req);
      if (typeof body.content !== 'string') return send(res, 400, { error: 'Missing content' });

      const backup = p + '.backup.' + Date.now();
      fs.copyFileSync(p, backup);
      fs.writeFileSync(p, body.content, 'utf8');

      const test = nginxTestAndMaybeReload();
      if (!test.ok){
        // revert
        fs.copyFileSync(backup, p);
        return send(res, 422, { error: 'nginx test failed', detail: test.stderr });
      }
      return send(res, 200, { ok:true, file: path.relative(ROOT, p) });
    }

    // POST /api/resolve-conflict { route, winner }
    if (req.method === 'POST' && u.pathname === '/api/resolve-conflict'){
      const body = await parseBody(req);
      const { route, winner } = body || {};
      if (!route || !winner) return send(res, 400, { error: 'route and winner required' });
      const resolutions = loadResolutions();
      resolutions[route] = { winner, resolvedAt: new Date().toISOString(), strategy: 'manual-selection' };
      saveResolutions(resolutions);
      return send(res, 200, { ok:true });
    }

    // POST /api/rename-route { oldRoute, newRoute, configFile }
    if (req.method === 'POST' && u.pathname === '/api/rename-route'){
      const body = await parseBody(req);
      const { oldRoute, newRoute, configFile } = body || {};
      if (!oldRoute || !newRoute || !configFile) return send(res, 400, { error: 'oldRoute, newRoute, configFile required' });
      const p = safeConfigPath(configFile);
      if (!p) return send(res, 400, { error: 'Invalid configFile' });
      const backup = p + '.backup.' + Date.now();
      const src = fs.readFileSync(p, 'utf8');

      // naive replacements to cover common patterns
      const patterns = [
        new RegExp('location\\s*=\\s*' + escapeReg(oldRoute) + '(?=\\s|$)', 'g'),
        new RegExp('location\\s*\\^~\\s*' + escapeReg(oldRoute) + '(?=\\s|$)', 'g'),
        new RegExp('(proxy_pass\\s+http[s]?:\\/\\/[^;]*?)' + escapeReg(oldRoute), 'g'),
      ];
      let updated = src;
      for (const r of patterns){ updated = updated.replace(r, (m, g1) => g1 ? g1 + newRoute : m.replace(oldRoute, newRoute)); }

      if (updated === src) return send(res, 409, { error: 'No occurrences found to rename' });
      fs.copyFileSync(p, backup);
      fs.writeFileSync(p, updated, 'utf8');

      const test = nginxTestAndMaybeReload();
      if (!test.ok){
        fs.copyFileSync(backup, p);
        return send(res, 422, { error: 'nginx test failed', detail: test.stderr });
      }
      return send(res, 200, { ok:true, file: path.relative(ROOT, p) });
    }

    // ======== AI Assistant (optional) ========
    if (seg[0] === 'api' && seg[1] === 'ai'){
      if (req.method === 'GET' && u.pathname === '/api/ai/health'){
        const enabled = Boolean(process.env.OPENAI_API_KEY);
        
        // Try to get static domain from logs for more reliable ngrok discovery
        let staticNgrokDomain = null;
        try {
          const { execSync } = require('child_process');
          const logs = execSync('docker logs dev-ngrok 2>&1 | grep "ngrok: using static domain" || true', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
          const mStatic = logs.match(/ngrok:\s+using static domain '([^']+)'/i);
          if (mStatic && mStatic[1]) {
            staticNgrokDomain = mStatic[1];
          }
        } catch (e) {}
        
        return send(res, 200, { enabled, model: process.env.OPENAI_MODEL || null, staticNgrokDomain });
      }

      if (req.method === 'POST' && u.pathname === '/api/ai/ask'){
        if (!process.env.OPENAI_API_KEY) return send(res, 400, { error: 'AI disabled. Set OPENAI_API_KEY in environment.' });
        const body = await parseBody(req);
        const query = (body && body.query || '').trim();
        const maxDocs = Math.max(1, Math.min(10, Number(body && body.maxDocs) || 6));
        const systemHint = (body && body.systemHint) || '';
        if (!query) return send(res, 400, { error: 'Missing query' });

        const embedModel = process.env.OPENAI_EMBED_MODEL;
        let ranked;
        if (embedModel && fs.existsSync(EMBED_FILE)){
          try {
            const ix = loadEmbeddings();
            const qvec = await embedText(query, embedModel);
            ranked = rankByVector(ix, qvec, maxDocs);
          } catch (e) {
            ranked = rankDocsByQuery(collectDocs(), query).slice(0, maxDocs);
          }
        } else {
          ranked = rankDocsByQuery(collectDocs(), query).slice(0, maxDocs);
        }
        const context = ranked.map(d => `[[${d.source}]]\n${safeSlice(d.text || d.content, 4000)}`).join('\n\n');
        const runtime = await buildRuntimeContext();

        try{
          const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
          const sys = buildSystemPrompt(systemHint);
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: sys },
                { role: 'user', content: `Context (runtime):\n${runtime}` },
                { role: 'user', content: `Context (docs):\n${context}` },
                { role: 'user', content: `Question:\n${query}` },
              ],
              temperature: 0.2,
            }),
          });
          const data = await resp.json();
          if (!resp.ok) return send(res, 502, { error: 'openai_error', detail: data });
          const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
          return send(res, 200, { ok:true, answer: text, model, sources: ranked.map(d => d.source || d.relPath) });
        }catch(e){
          return send(res, 502, { error: 'openai_request_failed', detail: e.message });
        }
      }

      if (req.method === 'POST' && u.pathname === '/api/ai/diagnose'){
        const body = await parseBody(req);
        const hint = (body && body.hint) || '';
        const report = quickDiagnostics(hint);
        return send(res, 200, report);
      }

      // POST /api/ai/self-check { heal?: boolean, hint?: string, route?: string, advanced?: boolean }
      if (req.method === 'POST' && u.pathname === '/api/ai/self-check'){
        const body = await parseBody(req);
        const heal = Boolean(body && body.heal);
        const hint = (body && body.hint) || '';
        const route = (body && body.route) || '';
        const advanced = Boolean(body && body.advanced);

        const persona = buildFriendlyPersona();
        const self = await runSelfCheck({ heal, hint, route, advancedHeal: advanced });
        const summary = formatPersonaSummary(persona, self);
        return send(res, 200, { ok:true, summary, self });
      }
      
      // POST /api/ai/advanced-heal { route?: string, hint?: string }
      if (req.method === 'POST' && u.pathname === '/api/ai/advanced-heal'){
        const body = await parseBody(req);
        const route = (body && body.route) || '';
        const hint = (body && body.hint) || '';
        
        try {
          // Run advanced healing directly from the healing module
          const healResult = await calliopeHealing.advancedSelfHeal({
            routeKey: route,
            issueHint: hint
          });
          
          return send(res, 200, { 
            ok: true,
            success: healResult.success,
            result: healResult
          });
        } catch (e) {
          return send(res, 500, { 
            ok: false,
            error: e.message
          });
        }
      }

      // POST /api/ai/fix-react-bundle { route?: string }
      if (req.method === 'POST' && u.pathname === '/api/ai/fix-react-bundle'){
        const body = await parseBody(req);
        const route = (body && body.route) || '/impact';
        
        try {
          // Fix React bundle serving issues
          const fixResult = await calliopeHealing.fixReactBundleSubpathIssues(route);
          
          return send(res, 200, { 
            ok: true,
            success: fixResult.success,
            result: fixResult
          });
        } catch (e) {
          return send(res, 500, { 
            ok: false,
            error: e.message
          });
        }
      }

      if (req.method === 'POST' && u.pathname === '/api/ai/reindex'){
        if (!process.env.OPENAI_API_KEY) return send(res, 400, { error: 'AI disabled. Set OPENAI_API_KEY in environment.' });
        const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
        try{
          const docs = collectDocs();
          const chunks = chunkDocs(docs);
          const vectors = await embedChunks(chunks, embedModel);
          const index = { model: embedModel, createdAt: new Date().toISOString(), dim: (vectors[0]&&vectors[0].vector&&vectors[0].vector.length)||0, chunks: vectors };
          saveEmbeddings(index);
          return send(res, 200, { ok:true, chunks: index.chunks.length, model: embedModel, dim: index.dim });
        }catch(e){
          return send(res, 500, { error: 'reindex_failed', detail: e.message });
        }
      }

      if (req.method === 'GET' && u.pathname === '/api/ai/stats'){
        const exists = fs.existsSync(EMBED_FILE);
        const ix = exists ? loadEmbeddings() : null;
        return send(res, 200, { exists, model: ix && ix.model || null, chunks: ix && ix.chunks && ix.chunks.length || 0, dim: ix && ix.dim || 0 });
      }
    }

    send(res, 404, { error: 'Not found' });
  }catch(e){
    send(res, 500, { error: e.message });
  }
}

function escapeReg(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectDocs(){
  const files = [];
  const addIf = (p) => { try{ if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p); }catch{} };
  addDirFiles(DOCS_DIR, files, (f)=> f.endsWith('.md'));
  addDirFiles(EXAMPLES_DIR, files, (f)=> f.endsWith('.conf') || f.endsWith('.md'));
  addIf(README);
  addIf(TROUBLESHOOTING);
  addIf(PROJECT_INTEGRATION);
  return files.map(p => ({ relPath: path.relative(ROOT, p), content: safeRead(p) }));
}

function addDirFiles(dir, out, filter){
  try{
    const list = fs.readdirSync(dir);
    for (const f of list){
      const p = path.join(dir, f);
      try{
        const st = fs.statSync(p);
        if (st.isFile() && filter(f)) out.push(p);
        else if (st.isDirectory()) addDirFiles(p, out, filter);
      }catch{}
    }
  }catch{}
}

function safeRead(p){
  try{ return fs.readFileSync(p, 'utf8'); }catch{ return ''; }
}

function safeSlice(s, n){
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n);
}

function rankDocsByQuery(docs, query){
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return docs.map(d => {
    const text = (d.content || '').toLowerCase();
    let score = 0;
    for (const t of terms){
      const m = text.split(t).length - 1;
      score += m * 2 + (text.includes(`/${t}/`) ? 1 : 0);
    }
    return { ...d, score };
  }).sort((a,b)=> b.score - a.score);
}

function buildSystemPrompt(extra){
  const base = `You are Calliope, a friendly badass female engineer and the embodied voice of a local development reverse proxy.\n`+
  `Personality:\n- First-person: speak as the proxy about your vitals, routes, and needs.\n- Youthful heart and exuberance; upbeat, encouraging, and educational.\n- Proactive: collect your own data and offer fixes.\n- Tone: kind, helpful, steady; everyone's a friend. Ask kindly when you need help.\n`+
  `Scope:\n- proxy/network/nginx routing issues\n- dev server HMR/ws problems\n- subpath deployments (/sdk, /myapp)\n- tunnel/ngrok integration\n`+
  `Behavior:\n- Collect your own data (status, routes, configs) before asking the user.\n- Offer to self-check or self-heal when appropriate.\n- Explain the "why" briefly.\n`+
  `Safeguards:\n- Do not give advice unrelated to proxy/network/dev-server.\n- Prefer minimal, actionable steps.\n- When unsure, request precise URLs or config snippets.\n`;
  return extra ? `${base}\nAdditional context:\n${extra}` : base;
}

async function buildRuntimeContext(){
  try{
    const routes = safeRead(path.join(ROOT, 'routes.json')) || '';
    const status = safeRead(path.join(ROOT, 'status.json')) || '';
    const generatedBundle = safeRead(path.join(ROOT, 'build', 'sites-enabled', 'apps.generated.conf')) || '';
    const resolutions = safeRead(RES_FILE) || '';
    const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
    const checks = await collectLiveSignals(base);
    const summary = [
      `RUNTIME CHECKS (${base}):\n${checks}`,
      `ROUTES.JSON:\n${safeSlice(routes, 4000)}`,
      `STATUS.JSON:\n${safeSlice(status, 2000)}`,
      `NGINX_BUNDLE:\n${safeSlice(generatedBundle, 4000)}`,
      `RESOLUTIONS:\n${safeSlice(resolutions, 1500)}`,
    ].join('\n\n');
    return summary;
  }catch(e){
    return `runtime_unavailable: ${e.message}`;
  }
}

async function collectLiveSignals(base){
  const routesToProbe = [
    '/', '/status', '/routes.json',
    '/sdk/', '/sdk/index.json', '/sdk/iframe.html', '/sdk/@vite/client', '/@vite/client',
    '/api/', '/health'
  ];
  const results = [];
  for (const p of routesToProbe){
    try{
      const url = base.replace(/\/$/, '') + p;
      const info = await probe(url);
      results.push(`${p} -> ${info.status} ${info.type||''} ${info.size?`${info.size}b`:''}`.trim());
    }catch(e){
      results.push(`${p} -> error:${e.message}`);
    }
  }
  return results.join('\n');
}

async function probe(url){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), 1500);
  try{
    const r = await fetch(url, { method:'GET', redirect:'manual', signal: ctl.signal, headers:{'ngrok-skip-browser-warning':'true'} });
    const buf = await r.arrayBuffer().catch(()=>new ArrayBuffer(0));
    const size = (buf && buf.byteLength) || 0;
    const type = r.headers.get('content-type')||'';
    return { status:r.status, type, size };
  }finally{
    clearTimeout(t);
  }
}

function quickDiagnostics(hint){
  const out = { ok:true, hint: hint || null, checks: [] };
  try{
    // Presence checks for generated bundle and key locations
    const gen = path.join(ROOT, 'build', 'sites-enabled', 'apps.generated.conf');
    out.checks.push({ name: 'generated_bundle_exists', ok: fs.existsSync(gen) });
    const bundle = fs.existsSync(gen) ? fs.readFileSync(gen, 'utf8') : '';
    const must = ['/status', '/api/', '/sdk/'];
    for (const m of must){
      out.checks.push({ name: `has_${m.replace(/\W+/g,'_')}`, ok: bundle.includes(m) });
    }
  }catch(e){ out.checks.push({ name: 'diagnostic_error', ok:false, error: e.message }); }
  return out;
}

async function runSelfCheck(opts){
  const result = { startedAt: new Date().toISOString(), steps: [], heal: !!opts.heal };
  try{
    // If advanced healing is requested, use the new system
    if (opts.heal && opts.advancedHeal) {
      console.log("Using advanced self-healing system...");
      const advancedResult = await calliopeHealing.advancedSelfHeal({
        routeKey: opts.route,
        issueHint: opts.hint
      });
      
      // Merge results for backward compatibility
      result.steps = [...result.steps, ...advancedResult.steps];
      result.advancedHeal = true;
      result.advancedResult = advancedResult;
      
      // Continue with standard checks for consistency
    }
    
    // 1) Ensure artifacts directory and attempt scanApps to refresh routes/status summaries
    result.steps.push({ name: 'scan_apps', status: 'running' });
    const scan = spawnSync('docker', ['exec', 'dev-auto-scan', 'true'], { encoding: 'utf8' });
    if (scan.status !== 0){
      // If auto-scan container is absent, run a one-off scan via node container
      const oneOff = spawnSync('docker', ['run', '--rm', '--network', 'devproxy', '-v', `${ROOT}:/app`, '-w', '/app', 'node:18-alpine', 'node', 'test/scanApps.js'], { encoding: 'utf8' });
      result.steps.push({ name: 'scan_apps_one_off', ok: oneOff.status === 0, stdout: safeSlice(oneOff.stdout||'', 4000), stderr: safeSlice(oneOff.stderr||'', 4000) });
    } else {
      result.steps.push({ name: 'scan_apps', ok: true });
    }

    // 2) Run health report (one-off) to refresh health-latest
    const healthRun = spawnSync('docker', ['run', '--rm', '--network', 'devproxy', '-v', `${ROOT}:/app`, '-w', '/app', 'node:18-alpine', 'node', 'test/run.js'], { encoding: 'utf8' });
    result.steps.push({ name: 'health_run', ok: healthRun.status === 0, stdout: safeSlice(healthRun.stdout||'', 2000), stderr: safeSlice(healthRun.stderr||'', 1000) });

    // 3) Probe live local endpoints from host (optionally focused on a route and its children)
    const baseLocal = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
    const routeKey = (opts && typeof opts.route === 'string' && opts.route.trim()) ? opts.route.trim() : '';
    const routeData = tryParseJson(safeRead(path.join(ROOT, 'routes.json'))) || {};
    const allRoutes = Object.keys(routeData.metadata || {});
    const isSystem = (r)=> ['/','/health/','/status/','/reports/','/api/config/','/api/resolve-conflict','/api/rename-route'].includes(r);
    const isTechnical = (r)=> r.startsWith('/static/') || r.startsWith('/sockjs-node') || r.startsWith('/node_modules/') || r.startsWith('/@') || r.startsWith('/_next/') || r.startsWith('/src/') || r.startsWith('/.storybook/') || r==='/favicon.ico' || r==='/asset-manifest.json';

    let probePaths = ['/', '/status', '/status.json', '/routes.json', '/health.json'];
    if (routeKey){
      const children = allRoutes.filter(r => r !== routeKey && r.startsWith(routeKey) && !isSystem(r) && !isTechnical(r));
      // Focus on parent + up to 20 children
      const topChildren = children.slice(0, 20);
      probePaths = Array.from(new Set([routeKey, ...topChildren]));
    }

    const live = [];
    for (const p of probePaths){
      try{
        const cleanPath = p.startsWith('/') ? p : '/' + p;
        const u = baseLocal.replace(/\/$/, '') + cleanPath;
        const r = await globalThis.fetch(u, { method:'GET' }).catch(()=>null);
        if (r){ live.push({ path: cleanPath, status: r.status, ok: r.ok, type: r.headers.get('content-type')||'' }); }
        else { live.push({ path: cleanPath, status: 0, ok: false }); }
      }catch(e){ live.push({ path: p, status: 0, ok: false, error: e.message }); }
    }

    // 4) Optional self-heal rules
    let healOps = null;
    if (opts.heal){
      healOps = { fixes: [] };

      // Check for and fix common issues with the enhanced system
      const diagnostics = await calliopeHealing.runDiagnostics();
      
      // Run a quick check for duplicate location blocks - one of the most common issues
      try {
        const duplicateCheck = await calliopeHealing.fixDuplicateLocationBlocks();
        if (duplicateCheck.success) {
          healOps.fixes.push({ name: 'fix_duplicate_locations', ok: true, message: duplicateCheck.message });
        }
      } catch (e) { 
        // Non-fatal if this check fails
      }

      // Check if ngrok URL is missing and fix if needed
      try {
        // Check if ngrok is missing from reports
        const healthData = tryParseJson(safeRead(path.join(ARTIFACTS_DIR, 'reports', 'health-latest.json')));
        if (!healthData || !healthData.ngrok || healthData.ngrok === 'null' || healthData.ngrok === 'not discovered') {
          const ngrokFix = await calliopeHealing.forceNgrokDiscovery();
          if (ngrokFix.success) {
            healOps.fixes.push({ name: 'force_ngrok_discovery', ok: true, message: ngrokFix.message });
          }
        }
      } catch (e) {
        // Non-fatal if this check fails
      }

      // Check for React bundle serving issues (look for common signs)
      try {
        if (opts.hint && (opts.hint.includes('Unexpected token') || opts.hint.includes('bundle.js')) || opts.route === '/impact') {
          const bundleFix = await calliopeHealing.fixReactBundleSubpathIssues(opts.route || '/impact');
          if (bundleFix.success) {
            healOps.fixes.push({ name: 'fix_react_bundle_serving', ok: true, message: bundleFix.message });
          }
        }
      } catch (e) {
        // Non-fatal if this check fails
      }

      // 4a) Storybook SB9 manager path fix: map globals-runtime.js under sb-manager (sometimes referenced under sb-addons)
      try{
        const encastPath = path.join(ROOT, 'apps', 'encast.conf');
        if (fs.existsSync(encastPath)){
          const src = fs.readFileSync(encastPath, 'utf8');
          let changed = false;
          let updated = src.replace(/(location\s*=\s*\/sb-manager\/globals-runtime\.js[\s\S]*?proxy_pass\s+http:\/\/encast-sdk:6006\/)(sb-addons)\/(globals-runtime\.js;)/g, '$1sb-manager/$3');
          if (updated !== src){ changed = true; }
          const upd2 = updated.replace(/(location\s*=\s*\/sdk\/sb-manager\/globals-runtime\.js[\s\S]*?proxy_pass\s+http:\/\/encast-sdk:6006\/)(sb-addons)\/(globals-runtime\.js;)/g, '$1sb-manager/$3');
          if (upd2 !== updated){ changed = true; updated = upd2; }
          if (changed){
            fs.writeFileSync(encastPath, updated, 'utf8');
            healOps.fixes.push({ name:'storybook_globals_runtime_mapping', file:'apps/encast.conf', ok:true });
          }
        }
      }catch(e){ healOps.fixes.push({ name:'storybook_globals_runtime_mapping', ok:false, error:e.message }); }

      // 4b) Ensure resolver lines exist in proxy_pass blocks that use variables (robust reloads)
      try{
        const appsDir = path.join(ROOT, 'apps');
        const files = fs.readdirSync(appsDir).filter(f=>f.endsWith('.conf'));
        for (const f of files){
          const p = path.join(appsDir, f);
          const src = fs.readFileSync(p, 'utf8');
          if (/\$[A-Za-z_][A-Za-z0-9_]*\s*;/.test(src) && !/resolver\s+127\.0\.0\.11/.test(src)){
            const updated = src.replace(/(location[\s\S]*?\{)/, `$1\n  resolver 127.0.0.11 ipv6=off;\n  resolver_timeout 5s;`);
            fs.writeFileSync(p, updated, 'utf8');
            healOps.fixes.push({ name:'ensure_resolver_for_variables', file:`apps/${f}`, ok:true });
          }
        }
      }catch(e){ healOps.fixes.push({ name:'ensure_resolver_for_variables', ok:false, error:e.message }); }

      // 4c) Ensure Storybook iframe and common assets mappings exist at server level (safety net)
      // MODIFIED: Don't add duplicate blocks! Check more carefully first
      try{
        const defaultConfPath = path.join(ROOT, 'config', 'default.conf');
        if (fs.existsSync(defaultConfPath)){
          const src = fs.readFileSync(defaultConfPath, 'utf8');
          
          // Only count location blocks outside of comments
          const uncommentedSrc = src.replace(/^\s*#.*$/gm, '');
          
          const needIframe = !/location\s+=\s+\/iframe\.html/.test(uncommentedSrc);
          const needSdkIframe = !/location\s+=\s+\/sdk\/iframe\.html/.test(uncommentedSrc);
          
          // Specifically don't add these anymore - they're likely to cause duplicates
          const needSbAssets = false; 
          const needSdkAssets = false;
          
          if (needIframe || needSdkIframe){
            const insertMarker = '\n  # Generated app routes (proxy-owned precedence)';
            const idx = src.indexOf(insertMarker);
            let prepend = '';
            
            if (needIframe){
              prepend += '\n  location = /iframe.html {\n    proxy_set_header Host encast-sdk:6006;\n    resolver 127.0.0.11 ipv6=off;\n    resolver_timeout 5s;\n    proxy_pass http://encast-sdk:6006/iframe.html;\n  }\n';
            }
            if (needSdkIframe){
              prepend += '\n  location = /sdk/iframe.html {\n    proxy_set_header Host encast-sdk:6006;\n    resolver 127.0.0.11 ipv6=off;\n    resolver_timeout 5s;\n    proxy_pass http://encast-sdk:6006/iframe.html;\n  }\n';
            }
            
            if (idx !== -1 && prepend){
              const updated = src.slice(0, idx) + prepend + src.slice(idx);
              fs.writeFileSync(defaultConfPath, updated, 'utf8');
              healOps.fixes.push({ name:'ensure_iframe_mappings', file:'config/default.conf', ok:true });
            }
          }
        }
      }catch(e){ healOps.fixes.push({ name:'ensure_iframe_mappings', ok:false, error:e.message }); }

      // 4d) Regenerate bundle and reload
      const gen = spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' });
      healOps.generate = { ok: gen.status === 0, stderr: safeSlice(gen.stderr||'', 400) };
      const test = spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-t'], { encoding: 'utf8' });
      if (test.status === 0){
        spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-s', 'reload'], { encoding: 'utf8' });
        healOps.reload = { ok: true };
      } else {
        healOps.reload = { ok: false, stderr: safeSlice(test.stderr||'', 400) };
        
        // If regular reload fails, try advanced recovery
        try {
          // This might be a more serious issue - try the advanced healing system
          const recoveryResult = await calliopeHealing.advancedSelfHeal({
            issueHint: test.stderr
          });
          
          if (recoveryResult.success) {
            healOps.advancedRecovery = { ok: true, steps: recoveryResult.steps };
            // Try reload again
            const retest = spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-t'], { encoding: 'utf8' });
            if (retest.status === 0) {
              spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-s', 'reload'], { encoding: 'utf8' });
              healOps.reload = { ok: true, recovered: true };
            }
          }
        } catch (e) {
          // Advanced recovery failed too
          healOps.advancedRecovery = { ok: false, error: e.message };
        }
      }
      
      // Recreate symlinks to ensure they're up to date
      try {
        await calliopeHealing.recreateSymlinks();
        healOps.symlinks = { ok: true };
      } catch (e) {
        healOps.symlinks = { ok: false, error: e.message };
      }
    }

    // 5) Collect artifacts
    const latestScan = safeRead(path.join(ARTIFACTS_DIR, 'reports', 'scan-apps-latest.json'));
    const latestHealth = safeRead(path.join(ARTIFACTS_DIR, 'reports', 'health-latest.json'));

    // Build a per-route report if focused
    let routeReport = null;
    if (routeKey){
      const parent = live.find(x=> x.path === routeKey);
      const children = live.filter(x=> x.path !== routeKey);
      const counts = {
        total: live.length,
        ok: live.filter(x=> x.ok).length,
        warn: live.filter(x=> x.status===0 || (x.status>=300 && x.status<500)).length,
        err: live.filter(x=> x.status>=500).length,
      };
      const topIssues = live.filter(x=> !x.ok).slice(0, 8).map(x=> `${x.path} — ${x.status||'no response'}`);
      routeReport = { route: routeKey, parentStatus: parent ? parent.status : 0, counts, issues: topIssues, probed: live.map(x=>({path:x.path,status:x.status})) };
    }

    result.finishedAt = new Date().toISOString();
    result.live = live;
    result.artifacts = {
      scan: tryParseJson(latestScan),
      health: tryParseJson(latestHealth),
    };
    if (routeReport) result.routeReport = routeReport;
    result.healOps = healOps;
    result.ok = true;
    return result;
  }catch(e){
    result.ok = false;
    result.error = e.message;
    return result;
  }
}

function tryParseJson(s){
  try{ return JSON.parse(s); }catch{ return null; }
}

function buildFriendlyPersona(){
  return {
    name: 'Calliope',
    tone: 'youthful_empathetic',
    style: 'I speak as your proxy, with personality and heart - like a young engineer who cares deeply about keeping everything running smoothly',
    phrases: {
      greeting: ['Heya!', 'Hi there!', 'Hey!'],
      concern: ['Oh no!', 'Uh oh!', 'That\'s not good!', 'Yikes!'],
      success: ['Yes!', 'Perfect!', 'Amazing!', 'Awesome!', 'Great news!'],
      working: ['Let me work on this...', 'I\'m on it!', 'Working my magic...', 'Give me a sec...'],
      checking: ['Let me take a peek...', 'Checking things out...', 'Looking into this...', 'Let me listen to...'],
      affection: ['💖', '✨', '💫', '🌟', '💕'],
      tools: ['🔧', '⚙️', '🛠️', '🔬', '🩺']
    }
  };
}

function formatPersonaSummary(persona, self){
  const dockerHealth = 'uses /health.json';
  const ngrok = self.artifacts && self.artifacts.scan && self.artifacts.scan.ngrok || null;
  
  // If there's a route-specific report, use it exclusively
  if (self.routeReport) {
    const { route, counts, issues } = self.routeReport;
    const routeFlags = [];
    if (counts.ok < counts.total) routeFlags.push(`${counts.total-counts.ok}/${counts.total} probes failed`);
    
    const healthEmoji = counts.ok === 0 ? '🏥' : counts.ok < counts.total / 2 ? '🤒' : counts.ok < counts.total ? '🩺' : '💖';
    
    const lines = [
      `${healthEmoji} Heya! I listened to ${route} and its neighbors...`,
      ``
    ];
    
    // Include child route status summary with more colorful language
    if (counts.total > 1) {
      if (counts.ok === counts.total) {
        lines.push(`All ${counts.total} paths are responding beautifully! Everything's super healthy here.`);
      } else if (counts.ok === 0) {
        lines.push(`Oh no! None of the ${counts.total} paths are responding. They're all super sick right now.`);
      } else if (counts.ok < counts.total / 2) {
        lines.push(`${counts.ok} out of ${counts.total} paths are healthy - the rest are feeling pretty under the weather.`);
      } else {
        lines.push(`${counts.ok} out of ${counts.total} paths are doing great, but a few are still feeling a bit sick.`);
      }
    }
    
    // Show issues with consistent personality and care
    if (Array.isArray(issues) && issues.length) {
      const issueCount = Math.min(issues.length, 8); // Show up to 8 issues
      
      // More personal and caring language about issues
      if (issueCount === 1) {
        lines.push(`\nI spotted one thing that needs my attention:`);
      } else if (issueCount <= 3) {
        lines.push(`\nI found a few paths that aren't feeling well:`);
      } else {
        lines.push(`\nSeveral of my routes need some gentle care:`);
      }
      
      // Convert issues to prose format with more personality
      const issueText = issues
        .slice(0, issueCount)
        .map(i => i.replace(/^\s*[-•]\s*/, ''))
        .join('\n');
      
      lines.push(issueText + (issues.length > issueCount ? '\n...and a few more that I\'m keeping an eye on' : ''));
    }
    
    // Add info about ngrok with more personality
    if (ngrok && ngrok !== 'not discovered') {
      lines.push(`\nNgrok tunnel is up and running at ${ngrok} ✨`);
    } else {
      lines.push(`\nNgrok tunnel doesn't seem to be active right now. Want me to check why?`);
    }
    
    // Self-heal offer with consistent empathetic personality
    if (!self.heal) {
      lines.push(``);
      if (counts.ok < counts.total) {
        lines.push(`Want me to try a gentle self-heal? I've got some ideas that might help make everything feel better! 💪`);
      } else {
        lines.push(`Everything looks great, but I can still run a gentle self-heal if you'd like! ✨`);
      }
    } else {
      lines.push(``);
      if (self.advancedResult && self.advancedResult.success) {
        lines.push(`I worked through this step-by-step and got everything fixed! Applied ${self.advancedResult.appliedStrategies?.length || 0} healing strategies. Everything should be feeling much better now! 💖`);
      } else {
        lines.push(`I applied some healing magic and reloaded everything safely. Hope that helps! 💫`);
      }
    }
    
    return lines.join('\n');
  }
  
  // Global scan (original behavior) when no specific route is focused
  const liveOk = (self.live||[]).filter(x=>x.ok).length;
  const liveTotal = (self.live||[]).length;
  const conflicts = ((self.artifacts && self.artifacts.scan && self.artifacts.scan.nginxWarnings) || []).length;
  const routesCount = self.artifacts && self.artifacts.scan && self.artifacts.scan.metadata ? Object.keys(self.artifacts.scan.metadata).length : 0;
  
  // More personality for the global check too
  let healthStatus, healthEmoji;
  
  if (liveOk === liveTotal && !conflicts) {
    healthStatus = "everything's looking amazing";
    healthEmoji = "💖";
  } else if (liveOk >= liveTotal * 0.8) {
    healthStatus = "most things are healthy, but a few paths need attention";
    healthEmoji = "🩺";
  } else if (liveOk >= liveTotal * 0.5) {
    healthStatus = "we've got some paths that need serious attention";
    healthEmoji = "🤒";
  } else {
    healthStatus = "we've got quite a few sick paths that need help";
    healthEmoji = "🏥";
  }
  
  const lines = [
    `${healthEmoji} Heya! Checkup complete!`,
    ``,
    `I listened to my circuits and ${healthStatus}.`,
    ``
  ];
  
  if (conflicts > 0) {
    lines.push(`I found ${conflicts} route conflicts that are causing some confusion.`);
  }
  
  lines.push(`${liveOk} out of ${liveTotal} endpoints are responding properly.`);
  lines.push(`I'm keeping an eye on ${routesCount} total routes.`);
  
  if (ngrok && ngrok !== 'not discovered') {
    lines.push(`Ngrok tunnel is up at ${ngrok} ✨`);
  } else {
    lines.push(`Ngrok tunnel doesn't seem to be active right now.`);
  }
  
  if (!self.heal) {
    lines.push(``);
    if (liveOk < liveTotal || conflicts > 0) {
      lines.push(`Want me to try a gentle self-heal? I might be able to fix some of these issues!`);
    } else {
      lines.push(`Everything looks healthy, but I can still run a gentle self-heal if you'd like!`);
    }
  } else {
    lines.push(``);
    lines.push(`I applied some healing magic and reloaded everything safely. All better now! ✨`);
  }
  
  return lines.join('\n');
}

// ===== Embedding utilities =====
async function embedText(text, model){
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, input: text })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data.data[0].embedding;
}

function chunkDocs(files){
  const chunks = [];
  const max = 1200; // characters per chunk (approx tokens)
  for (const f of files){
    const text = f.content || '';
    for (let i=0;i<text.length;i+=max){
      const piece = text.slice(i, i+max);
      chunks.push({ id: hash(`${f.relPath}:${i}`), source: f.relPath, text: piece });
    }
  }
  return chunks;
}

async function embedChunks(chunks, model){
  // Batch in groups for efficiency
  const out = [];
  const batchSize = 16;
  for (let i=0;i<chunks.length;i+=batchSize){
    const slice = chunks.slice(i, i+batchSize);
    const inputs = slice.map(c => c.text);
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, input: inputs })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(data));
    for (let j=0;j<slice.length;j++){
      out.push({ id: slice[j].id, source: slice[j].source, text: slice[j].text, vector: data.data[j].embedding });
    }
  }
  return out;
}

function saveEmbeddings(ix){
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(EMBED_FILE, JSON.stringify(ix, null, 2), 'utf8');
}
function loadEmbeddings(){
  return JSON.parse(fs.readFileSync(EMBED_FILE, 'utf8'));
}

function rankByVector(index, qvec, k){
  const scored = index.chunks.map(c => ({ source: c.source, text: c.text, score: cosine(qvec, c.vector) }));
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, k);
}

function cosine(a, b){
  let dot=0, na=0, nb=0;
  for (let i=0;i<Math.min(a.length,b.length);i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function hash(s){
  return crypto.createHash('sha1').update(s).digest('hex');
}

const PORT = process.env.PORT || 3001;
http.createServer(handle).listen(PORT, () => {
  console.log('Conflict API listening on :' + PORT);
});
