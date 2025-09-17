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
   - POST /api/ai/self-check   { heal?: boolean, hint?: string }
   - POST /api/ai/audit        { url, wait?, timeout? }
   - POST /api/ai/audit-and-heal { url, route?, maxPasses?, wait?, timeout? }
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
const CHAT_DIR = path.join(ARTIFACTS_DIR, 'calliope');
const CHAT_FILE = path.join(CHAT_DIR, 'chat-history.json');
const DOCS_DIR = path.join(ROOT, 'docs');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const README = path.join(ROOT, 'README.md');
const TROUBLESHOOTING = path.join(ROOT, 'TROUBLESHOOTING.md');
const PROJECT_INTEGRATION = path.join(ROOT, 'PROJECT-INTEGRATION.md');
const OVERRIDES_DIR = path.join(ROOT, 'overrides');
const CONFLICTS_FILE = path.join(ROOT, '.artifacts', 'override-conflicts.json');

// In-memory thinking events queue for UI thinking bubble
const thinkingEvents = [];
function pushThought(message, details = {}){
  try{
    thinkingEvents.push({ id: Date.now() + Math.random(), ts: new Date().toISOString(), message, details });
    // Cap queue size to prevent unbounded growth
    if (thinkingEvents.length > 200) thinkingEvents.splice(0, thinkingEvents.length - 200);
  }catch{}
}
function drainThoughts(){
  const copy = thinkingEvents.slice();
  thinkingEvents.length = 0;
  return copy;
}

// Schedule a thought to appear shortly AFTER the API response is sent,
// so the UI can display the thinking bubble following the latest message.
function scheduleThought(message, details = {}, delayMs = 30){
  try {
    setTimeout(() => pushThought(message, details), Math.max(0, delayMs));
  } catch {}
}

// Activity/cancellation tracking and persistent chat
let currentActivity = '';
let cancelRequested = false;
function setActivity(a){ currentActivity = a || ''; }
function requestCancel(){ cancelRequested = true; }
function clearCancel(){ cancelRequested = false; }
function isCancelled(){ return !!cancelRequested; }
function ensureChatFile(){ try{ fs.mkdirSync(CHAT_DIR, { recursive: true }); if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify({ messages: [] }, null, 2)); }catch{} }
function loadChat(){ try{ ensureChatFile(); return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); }catch{ return { messages: [] }; } }
function appendChat(role, content){ try{ ensureChatFile(); const data = loadChat(); const msg = { id: Date.now() + Math.random(), ts: new Date().toISOString(), role, content: String(content||'') }; data.messages.push(msg); if (data.messages.length > 500) data.messages.splice(0, data.messages.length - 500); fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2)); }catch{} }

function send(res, code, data, headers = {}){
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
}

function truncate(s, n){
  if (!s) return '';
  return s.length <= n ? s : (s.slice(0, n) + `\n...truncated ${s.length-n} chars`);
}

function deEnsure(text){
  if (!text) return text;
  // Replace "Ensure that X" → "X should" and plain "Ensure" → "should"
  let out = text.replace(/\b[Ee]nsure that\b/g, '');
  out = out.replace(/\b[Ee]nsure\b/g, 'should');
  // Clean double spaces from removals
  out = out.replace(/\s{2,}/g, ' ');
  return out;
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
    // Thinking endpoints
    if (req.method === 'GET' && u.pathname === '/api/ai/chat-history'){
      const data = loadChat();
      return send(res, 200, { ok:true, messages: data.messages || [] });
    }
    if (req.method === 'POST' && u.pathname === '/api/ai/cancel'){
      requestCancel();
      scheduleThought('Stopping current work (user requested)…', { stopped: true });
      return send(res, 200, { ok:true, cancelled: true });
    }
    // Overrides conflicts listing
    if (req.method === 'GET' && u.pathname === '/api/overrides/conflicts'){
      try{
        const exists = fs.existsSync(CONFLICTS_FILE);
        const data = exists ? JSON.parse(fs.readFileSync(CONFLICTS_FILE, 'utf8')) : { generatedAt:null, conflicts: [] };
        return send(res, 200, { ok:true, ...data });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }

    // Promote app config into overrides (replace override with apps version)
    // POST /api/overrides/promote { filename }
    if (req.method === 'POST' && u.pathname === '/api/overrides/promote'){
      try{
        const body = await parseBody(req);
        const { filename } = body || {};
        if (!filename || filename.includes('/') || filename.includes('..')){
          return send(res, 400, { ok:false, error: 'Invalid filename' });
        }
        const appPath = path.join(APPS_DIR, filename);
        const overridePath = path.join(OVERRIDES_DIR, filename);
        if (!fs.existsSync(appPath)) return send(res, 404, { ok:false, error: 'App config not found' });
        fs.mkdirSync(OVERRIDES_DIR, { recursive: true });

        // Backup existing override if present
        if (fs.existsSync(overridePath)){
          fs.copyFileSync(overridePath, overridePath + '.bak.' + Date.now());
        }
        // Replace override with app version
        fs.copyFileSync(appPath, overridePath);

        // Regenerate bundle and reload nginx
        const gen = spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' });
        if (gen.status !== 0){
          return send(res, 500, { ok:false, error: 'bundle_generation_failed', detail: (gen.stderr||gen.stdout||'').slice(0,400) });
        }
        const test = nginxTestAndMaybeReload();
        if (!test.ok){
          return send(res, 422, { ok:false, error: 'nginx_test_failed', detail: test.stderr });
        }
        return send(res, 200, { ok:true, promoted: filename });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }
    if (req.method === 'GET' && u.pathname === '/api/ai/thoughts'){
      return send(res, 200, { ok:true, events: drainThoughts() });
    }
    if (req.method === 'POST' && u.pathname === '/api/ai/thoughts/clear'){
      drainThoughts();
      return send(res, 200, { ok:true });
    }
    // Debug-only: inject thoughts to test UI polling
    if (req.method === 'POST' && u.pathname === '/api/ai/thoughts/inject'){
      try{
        const body = await parseBody(req);
        const list = Array.isArray(body && body.messages) ? body.messages : [];
        list.forEach(m => { try{ pushThought(String(m||'')); }catch{} });
        return send(res, 200, { ok:true, injected: list.length });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }
    if (req.method === 'GET' && u.pathname === '/api/ai/thoughts/peek'){
      // Non-destructive peek of queue length
      return send(res, 200, { ok:true, length: thinkingEvents.length });
    }

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
        
        return send(res, 200, { enabled, model: process.env.OPENAI_MODEL || null, staticNgrokDomain, activity: currentActivity });
      }

      // POST /api/ai/restart-containers { names?: string[], self?: boolean }
      if (req.method === 'POST' && u.pathname === '/api/ai/restart-containers'){
        try{
          const body = await parseBody(req);
          let names = Array.isArray(body && body.names) ? body.names.filter(Boolean) : [];
          const wantSelf = Boolean(body && body.self);
          // Determine self container ID/name via /etc/hostname
          if (wantSelf) {
            try { const selfId = fs.readFileSync('/etc/hostname','utf8').trim(); if (selfId) names.push(selfId); } catch {}
          }
          names = Array.from(new Set(names));
          if (!names.length) return send(res, 400, { ok:false, error: 'no container names provided' });

          // Respond first, then perform restarts asynchronously to avoid killing our own request
          send(res, 200, { ok:true, accepted: names });
          setTimeout(()=>{
            for (const n of names){
              try{ spawnSync('docker', ['restart', n], { encoding: 'utf8' }); }catch{}
            }
          }, 50);
          return; // already responded
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/snapshot-analyze { containerName, srcPathInContainer, outName? }
      // Legacy name kept for compatibility; we refer to it as a "code review"
      if (req.method === 'POST' && u.pathname === '/api/ai/snapshot-analyze'){
        try{
          const body = await parseBody(req);
          const containerName = body && body.containerName;
          const srcPathInContainer = body && body.srcPathInContainer;
          const outName = body && body.outName;
          if (!containerName || !srcPathInContainer){
            return send(res, 400, { ok:false, error: 'containerName and srcPathInContainer required' });
          }
          setActivity('coding');
          pushThought(`Analyzing code in ${containerName}:${srcPathInContainer}…`);
          const out = await calliopeHealing.backupAndAnalyzeContainerProject({ containerName, srcPathInContainer, outName });
          scheduleThought('Code review complete ✅', { containerName }, 60);
          setActivity('');
          return send(res, 200, { ok: out.success, reviewRoot: out.snapshot, suggestions: out.analysis && out.analysis.suggestions || [], message: out.message || null });
        }catch(e){
          setActivity('');
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // Preferred naming: perform a code review of a container's source tree
      if (req.method === 'POST' && u.pathname === '/api/ai/code-review-container'){
        try{
          const body = await parseBody(req);
          const containerName = body && body.containerName;
          const srcPathInContainer = body && body.srcPathInContainer;
          const outName = body && body.outName;
          if (!containerName || !srcPathInContainer){
            return send(res, 400, { ok:false, error: 'containerName and srcPathInContainer required' });
          }
          const out = await calliopeHealing.backupAndAnalyzeContainerProject({ containerName, srcPathInContainer, outName });
          return send(res, 200, { ok: out.success, reviewRoot: out.snapshot, suggestions: out.analysis && out.analysis.suggestions || [], message: out.message || null });
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // Preferred naming: perform a code review of a host path
      if (req.method === 'POST' && u.pathname === '/api/ai/code-review'){
        try{
          const body = await parseBody(req);
          const projectPath = body && body.projectPath;
          const outName = body && body.outName;
          if (!projectPath){
            return send(res, 400, { ok:false, error: 'projectPath required' });
          }
          setActivity('coding');
          pushThought(`Analyzing code at ${projectPath}…`);
          const out = await calliopeHealing.backupAndAnalyzeProject(projectPath, outName);
          scheduleThought('Code review complete ✅', { projectPath }, 60);
          setActivity('');
          return send(res, 200, { ok: out.success, reviewRoot: out.snapshot, suggestions: out.analysis && out.analysis.suggestions || [], message: out.message || null });
        }catch(e){
          setActivity('');
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/review-code { text?: string, files?: [{ path, content }], framework?: 'next' }
      if (req.method === 'POST' && u.pathname === '/api/ai/review-code'){
        try{
          const body = await parseBody(req);
          const rawText = (body && typeof body.text === 'string') ? body.text : '';
          const files = Array.isArray(body && body.files) ? body.files : [];
          const framework = (body && body.framework) || 'next';

          // Aggregate input up to ~120KB
          let aggregate = '';
          if (rawText) aggregate += `\n\n<<TEXT>>\n${truncate(rawText, 120000)}`;
          for (const f of files){
            const p = (f && f.path) || 'snippet.tsx';
            const c = (f && typeof f.content === 'string') ? f.content : '';
            if (!c) continue;
            aggregate += `\n\n<<FILE:${p}>>\n${truncate(c, 40000)}`;
            if (aggregate.length > 150000) break;
          }

          // Lightweight local heuristics as fallback (works without OpenAI)
          const localFindings = [];
          const hay = aggregate.toLowerCase();
          if (/fetch\(\s*['"]\s*\/api\//.test(aggregate)) localFindings.push('Use basePath-aware API helpers instead of fetch("/api/...").');
          if (/[^\w]\/_next\//.test(aggregate)) localFindings.push('Avoid hardcoded \/_next; rely on framework basePath/assetPrefix.');
          if (/__nextjs_font\//.test(aggregate)) localFindings.push('Prefix any manual __nextjs_font preloads with the base path helper.');
          if (/href=["']\//.test(aggregate)) localFindings.push('Replace root-anchored hrefs with basePath-aware URLs or framework Link.');
          if (/http:\/\//.test(aggregate)) localFindings.push('Avoid hardcoded http:// to own origin; keep HTTPS and subpath correct.');

          // If OpenAI is available, ask for structured recommendations
          let ai = null;
          if (process.env.OPENAI_API_KEY) {
            const system = `You are Colette, a proxy/dev networking assistant. Task: review provided app code for subpath-readiness under a reverse proxy and recommend precise, minimal code changes. Focus strictly on:\n- API calls: basePath-aware helpers\n- _next/static assets: avoid root /_next, use basePath/assetPrefix\n- Public assets: icons/robots/sitemap/manifest via base path\n- Links: framework Link or basePath-aware href\nReturn a concise checklist with code-level examples. Framework: ${framework}.`;
            const messages = [
              { role: 'system', content: system },
              { role: 'user', content: `Project snippets and files (truncated as needed):\n${aggregate}` }
            ];
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
              body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.2 })
            });
            if (resp.ok){
              const data = await resp.json();
              ai = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
            }
          }

          const result = {
            ok: true,
            recommendations: ai || (localFindings.length ? ('- ' + localFindings.join('\n- ')) : 'No obvious subpath issues detected in provided snippets.'),
            usedAI: Boolean(ai)
          };
          return send(res, 200, result);
        } catch (e) {
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/ask { query, ... } — now proactive: can invoke healing when user asks to heal
      if (req.method === 'POST' && u.pathname === '/api/ai/ask'){
        const body = await parseBody(req);
        const query = (body && body.query || '').trim();
        const maxDocs = Math.max(1, Math.min(10, Number(body && body.maxDocs) || 6));
        const systemHint = (body && body.systemHint) || '';
        if (!query) return send(res, 400, { error: 'Missing query' });

        // Persist user chat
        try { appendChat('user', query); } catch {}

        // Lightweight intent detection
        const lower = query.toLowerCase();
        // Treat redirect/status code questions as actionable (audit + heal)
        const wantsHeal = /(heal|fix|repair|unblock|make.*work|redirect|\b30[1278]\b|\b308\b)/.test(lower);
        const wantsAudit = /(audit|crawl|verify|check|scan|site auditor|console|network|status\s*code|redirect|\b30[1278]\b|\b308\b)/.test(lower);
        const wantsReview = /(code review|review code|analy[sz]e code|read code|scan code|recommend fixes)/.test(lower);
        const wantsAdvanced = /(advanced\s*heal|self-?heal(ing)?|deep heal|full heal)/.test(lower);
        // capture absolute URL if present
        const absUrlMatch = query.match(/https?:\/\/[\w.-]+(?::\d+)?\/[\S]*/i);
        const absoluteUrl = absUrlMatch ? absUrlMatch[0].trim() : '';
        // capture route prefix AND optional deeper path (e.g., /mxtk/dashboard)
        const routeMatch = query.replace(/https?:\/\/[^\s]+/ig, '').match(/\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*/);
        const fullPath = absoluteUrl ? (new URL(absoluteUrl).pathname.replace(/\/$/, '')) : (routeMatch ? routeMatch[0].replace(/\/$/, '') : '');
        const routeKey = fullPath ? ('/' + fullPath.split('/').filter(Boolean)[0]) : '';

        // Ensure audits run with dockerized Chrome when invoked via chat
        if (!process.env.CALLIOPE_PUPPETEER_IMAGE) process.env.CALLIOPE_PUPPETEER_IMAGE = 'ghcr.io/puppeteer/puppeteer:latest';
        if (!process.env.CALLIOPE_PUPPETEER_PLATFORM) process.env.CALLIOPE_PUPPETEER_PLATFORM = 'linux/amd64';

        // Opportunistic config repairs based on explicit chat asks
        try {
          const wantsRewriteFix = /(rewrite\s+\^\/[a-z0-9._-]+\/|fix\s+rewrite|\.conf\b)/i.test(lower);
          const wantsDedupeFont = /(duplicate|dedupe).+__nextjs_font/i.test(lower) || /__nextjs_font/.test(lower);
          const wantsDeferSdk = /(iframe\.html|defer\s*dns|variable\s*proxy_pass)/i.test(lower);
          if (wantsRewriteFix) {
            // Attempt a generic rewrite fix on the override that matches the route name if present
            const name = routeKey.replace(/^\//,'');
            const p = path.join(ROOT, 'overrides', `${name||'app'}.conf`);
            if (fs.existsSync(p)) {
              let txt = fs.readFileSync(p, 'utf8');
              const safe = name ? name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') : '[a-zA-Z0-9._-]+';
              const rx = new RegExp(`rewrite\\s+\\^\\/${safe}\\/\\(\\.\\*\\)\\$\\s+[^;\\n]+`, 'g');
              const fixed = txt.replace(rx, (m)=> m.replace(/\s+[^;\n]+$/, ' /$1 break;'));
              if (fixed !== txt) {
                fs.copyFileSync(p, p + '.backup.' + Date.now());
                fs.writeFileSync(p, fixed, 'utf8');
              }
            }
          }
          if (wantsDeferSdk) {
            // Avoid hardcoded service names; no-op in generic mode
          }
          if (wantsDedupeFont) {
            try { await calliopeHealing.fixDuplicateLocationBlocks(); } catch {}
          }
        } catch {}
        // If user asks for a code review, snapshot the container project and analyze for proxy-compat fixes (generic — no app names)
        if (wantsReview){
          try{
            // Discover running dev containers heuristically to choose a target
            const targets = [];
            try {
              const list = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
              const preferred = list.filter(n => /dev|web|app|site|client|sdk|storybook/i.test(n));
              for (const n of preferred.slice(0, 4)) {
                targets.push({ name: n, path: '/app' }, { name: n, path: '/usr/src/app' });
              }
            } catch {}
            if (targets.length === 0) targets.push({ name: 'dev-app', path: '/app' });
            let review = null;
            for (const t of targets){
              const out = await calliopeHealing.backupAndAnalyzeContainerProject({ containerName: t.name, srcPathInContainer: t.path });
              if (out && out.success){ review = out; break; }
            }
            const parts = [];
            if (review && review.success){
              parts.push('Code review suggestions:');
              const suggestions = (review.analysis && review.analysis.suggestions) || [];
              parts.push('```json');
              parts.push(JSON.stringify(suggestions.slice(0, 20), null, 2));
              parts.push('```');
              parts.push('Snapshot root:');
              parts.push('```');
              parts.push(review.snapshot || '(unknown)');
              parts.push('```');
            } else {
              parts.push('Code review could not complete.');
            }
            return send(res, 200, { ok:true, answer: parts.join('\n') });
          } catch(e){
            return send(res, 500, { ok:false, error: e.message });
          }
        }
        // routeKey is already computed above

        // If user asks to both audit and heal a specific path, run iterative audit→heal→re-audit
        if (wantsAudit && wantsHeal && (routeKey || fullPath || absoluteUrl)){
          // Run heavy audit+heal in background so /thoughts and /health remain responsive
          try {
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const url = absoluteUrl || (base.replace(/\/$/, '') + (fullPath || (routeKey + '/')) + (fullPath && !/\/$/.test(fullPath) ? '' : ''));
            clearCancel();
            setActivity('auditing');
            pushThought(`Starting audit+heal for ${routeKey||fullPath||url}…`, { route: routeKey||fullPath||'' });
            const passMatch = query.toLowerCase().match(/max\s*(\d+)\s*passes?|stop\s*after\s*(\d+)\s*passes?/);
            const userMaxPasses = passMatch ? (Number(passMatch[1]||passMatch[2])||3) : 3;
            const untilGreen = /(until\s*(green|100%|all\s*passing|no\s*issues|all\s*clear)|keep\s*going|continue)/i.test(query);
            setTimeout(async ()=>{
              const parts = [];
              parts.push(`Focusing on ${url} (route ${routeKey || fullPath || ''})`);
              let prev = null;
              // Heartbeat while background task is running
              const hb = setInterval(()=>{ try{ pushThought('Working…'); }catch{} }, 3000);
              try{
                for (let i = 0; i < Math.max(1, Math.min(8, userMaxPasses)); i++) {
                  // If a subpath with dev assets is involved, apply Storybook/Vite guards generically
                  try {
                    if (/\b(storybook|vite)\b/.test(lower)) {
                      setActivity('coding');
                      pushThought('Applying Storybook/Vite proxy guards…', { route: routeKey });
                      await calliopeHealing.applyStorybookViteProxyGuards({ routePrefix: routeKey || '/' });
                      setActivity('auditing');
                    }
                  } catch {}
                  pushThought(`Auditing pass ${i+1} for ${url}…`, { route: routeKey, url });
                  const audit = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });
                  if (audit && audit.ok && audit.summary){
                    parts.push(`\nPass ${i+1} summary:`);
                    parts.push('```json');
                    parts.push(JSON.stringify(audit.summary, null, 2));
                    parts.push('```');
                    if (audit.reportPath){
                      parts.push('Report:');
                      parts.push('```');
                      parts.push(audit.reportPath);
                      parts.push('```');
                    }
                    if (prev && prev.summary){
                      const d = {
                        consoleErrors: (audit.summary.consoleErrors||0) - (prev.summary.consoleErrors||0),
                        networkFailures: (audit.summary.networkFailures||0) - (prev.summary.networkFailures||0),
                        httpIssues: (audit.summary.httpIssues||0) - (prev.summary.httpIssues||0),
                      };
                      parts.push('Delta vs previous pass:');
                      parts.push('```json');
                      parts.push(JSON.stringify(d, null, 2));
                      parts.push('```');
                      const totalNow = (audit.summary.consoleErrors||0)+(audit.summary.networkFailures||0)+(audit.summary.httpIssues||0);
                      const totalPrev = (prev.summary.consoleErrors||0)+(prev.summary.networkFailures||0)+(prev.summary.httpIssues||0);
                      if (isCancelled()) { parts.push('Stopped by user.'); break; }
                      if (totalNow === 0) { parts.push('All clear ✅'); break; }
                      if (!untilGreen && totalNow <= totalPrev) break;
                    }
                    prev = audit;
                  } else {
                    parts.push('Audit did not complete successfully.');
                    if (audit && audit.error) parts.push(`Error: ${audit.error}`);
                    break;
                  }
  
                  try {
                    setActivity('healing');
                    pushThought('Applying subpath healing…', { route: routeKey });
                    const ensureNext = await calliopeHealing.ensureRouteForwardedPrefixAndNext({ routePrefix: routeKey || '' });
                    const subpathFix = await calliopeHealing.fixSubpathAbsoluteRouting({ routePrefix: routeKey || '' });
                    pushThought('Reloading nginx…');
                    await calliopeHealing.regenerateNginxBundle();
                    parts.push('Heal actions:');
                    parts.push(`- ensureRouteForwardedPrefixAndNext → ${ensureNext && ensureNext.success ? 'ok' : 'no-op or failed'}`);
                    parts.push(`- fixSubpathAbsoluteRouting → ${subpathFix && subpathFix.success ? 'ok' : 'no-op or failed'}`);
                  } catch (e) {
                    parts.push(`Healing step error: ${e.message}`);
                    break;
                  }
                  setActivity('auditing');
                }
              } finally {
                try{ clearInterval(hb); }catch{}
                scheduleThought('Audit+heal loop complete ✅', { route: routeKey }, 60);
                setActivity('');
                try { appendChat('assistant', parts.join('\n')); } catch {}
              }
            }, 10);
            // Respond immediately so UI polling can continue while background work runs
            return send(res, 200, { ok:true, accepted:true, answer: 'Working on it — starting audit and healing now. I\'ll report progress here.' });
          } catch (e) {
            setActivity('');
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // If user asks to audit a route, run site auditor and return summary proof
        if (wantsAudit && (routeKey || fullPath || absoluteUrl)){
          try {
            pushThought(`Auditing ${routeKey}…`, { route: routeKey });
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const url = absoluteUrl || (base.replace(/\/$/, '') + (fullPath || (routeKey + '/')) + (fullPath && !/\/$/.test(fullPath) ? '' : ''));
            // If Storybook/Vite is mentioned, attempt generic guards for the selected route
            try {
              if (/\b(storybook|vite)\b/.test(lower) && routeKey) {
                setActivity('coding');
                pushThought('Applying Storybook/Vite proxy guards…', { route: routeKey });
                await calliopeHealing.applyStorybookViteProxyGuards({ routePrefix: routeKey });
              }
            } finally { setActivity('auditing'); }
            const audit = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });
            const parts = [];
            parts.push(`Audit for ${routeKey} at ${url}`);
            if (audit && audit.ok && audit.summary){
              parts.push('Summary:');
              parts.push('```json');
              parts.push(JSON.stringify(audit.summary, null, 2));
              parts.push('```');
              if (audit.reportPath){
                parts.push('Report:');
                parts.push('```');
                parts.push(audit.reportPath);
                parts.push('```');
              }
            } else {
              parts.push('Audit did not complete successfully.');
              if (audit && audit.error) parts.push(`Error: ${audit.error}`);
            }
            scheduleThought('Audit complete ✅', { route: routeKey }, 60);
            return send(res, 200, { ok:true, answer: parts.join('\n') });
          } catch (e) {
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // If user asks to perform an advanced heal explicitly via chat
        if (wantsAdvanced && routeKey){
          try {
            pushThought(`Running advanced heal for ${routeKey}…`, { route: routeKey });
            const buffered = [];
            const onUpdate = (evt) => buffered.push({ message: (evt && evt.name) || 'step', details: evt });
            const advanced = await calliopeHealing.advancedSelfHeal({ routeKey, onUpdate });

            // Re-audit to verify
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const url = absoluteUrl || (base.replace(/\/$/, '') + (fullPath || (routeKey + '/')) + (fullPath && !/\/$/.test(fullPath) ? '' : ''));
            const audit = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });

            const parts = [];
            parts.push(`Advanced heal for ${routeKey}: ${advanced && advanced.success ? 'success' : 'partial/failed'}`);
            parts.push('Re-audit:');
            if (audit && audit.ok && audit.summary){
              parts.push('```json');
              parts.push(JSON.stringify(audit.summary, null, 2));
              parts.push('```');
              if (audit.reportPath){
                parts.push('Report:');
                parts.push('```');
                parts.push(audit.reportPath);
                parts.push('```');
              }
            } else {
              parts.push('Audit did not complete successfully.');
              if (audit && audit.error) parts.push(`Error: ${audit.error}`);
            }
            scheduleThought('Advanced heal complete ✅', { route: routeKey }, 60);
            return send(res, 200, { ok:true, answer: parts.join('\n') });
          } catch (e) {
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // If user asks to heal a specific route, do real work first, then answer with evidence
        if (wantsHeal && routeKey){
          try {
            pushThought(`On it! Healing ${routeKey}…`, { route: routeKey });

            // 1) Ensure forwarded prefix and Next dev block
            const ensureNext = await calliopeHealing.ensureRouteForwardedPrefixAndNext({ routePrefix: routeKey });
            // 2) Ensure subpath absolute routing for APIs and dev helpers
            const subpathFix = await calliopeHealing.fixSubpathAbsoluteRouting({ routePrefix: routeKey });
            // 3) If the route likely hosts a Storybook/Vite dev server, add guards
            let sbGuards = null;
            try {
              if (/\b(storybook|vite)\b/.test(lower)) {
                setActivity('coding');
                pushThought('Applying Storybook/Vite proxy guards…', { route: routeKey });
                sbGuards = await calliopeHealing.applyStorybookViteProxyGuards({ routePrefix: routeKey || '/' });
              }
            } finally { setActivity('healing'); }
            // 3) Normalize X-Forwarded-Proto headers to $scheme for local dev (avoid forcing https)
            let normalizedHeaders = false;
            try {
              const name = routeKey.replace(/^\//,'');
              const overridePath = path.join(ROOT, 'overrides', `${name}.conf`);
              if (fs.existsSync(overridePath)){
                const src = fs.readFileSync(overridePath, 'utf8');
                if (/proxy_set_header\s+X-Forwarded-Proto\s+https;/.test(src)){
                  const upd = src.replace(/proxy_set_header\s+X-Forwarded-Proto\s+https;/g, 'proxy_set_header X-Forwarded-Proto $scheme;');
                  if (upd !== src){ fs.writeFileSync(overridePath, upd, 'utf8'); normalizedHeaders = true; }
                }
              }
            } catch {}
            // 4) Regenerate bundle and reload nginx (captures test + reload internally)
            const regenOk = await calliopeHealing.regenerateNginxBundle();

            // Collect verification artifacts
            const genPath = path.join(ROOT, 'build', 'sites-enabled', 'apps.generated.conf');
            const genHead = fs.existsSync(genPath) ? (fs.readFileSync(genPath, 'utf8').split(/\r?\n/).slice(0, 6).join('\n')) : 'generated bundle not found';

            // Try to locate the edited conf based on ensure results; fall back to overrides/apps by route name
            let editedFile = (ensureNext && ensureNext.details && ensureNext.details.file) || (subpathFix && subpathFix.details && subpathFix.details.configFile) || '';
            if (editedFile){ editedFile = editedFile.replace(/^\/+/, ''); }
            let editedAbs = editedFile ? path.join(ROOT, editedFile) : '';
            if (!editedAbs || !fs.existsSync(editedAbs)){
              // best effort by convention: prefer overrides/<name>.conf
              const name = routeKey.replace(/^\//,'');
              const pref = path.join(ROOT, 'overrides', `${name}.conf`);
              const alt = path.join(ROOT, 'apps', `${name}.conf`);
              editedAbs = fs.existsSync(pref) ? pref : (fs.existsSync(alt) ? alt : '');
            }
            const fileAfter = editedAbs && fs.existsSync(editedAbs) ? fs.readFileSync(editedAbs, 'utf8') : '(unable to read edited file)';

            const persona = buildFriendlyPersona();
            const successEmoji = (persona.phrases && persona.phrases.success && persona.phrases.success[0]) || 'Done!';
            const parts = [];
            parts.push(`${successEmoji} I healed ${routeKey}.`);
            parts.push('What I did:');
            parts.push(`- ensureRouteForwardedPrefixAndNext → ${ensureNext && ensureNext.success ? 'ok' : 'no-op or failed'}`);
            parts.push(`- fixSubpathAbsoluteRouting → ${subpathFix && subpathFix.success ? 'ok' : 'no-op or failed'}`);
            if (sbGuards) parts.push(`- applyStorybookViteProxyGuards(${routeKey||'/'}) → ${sbGuards.success ? 'ok' : 'no-op or failed'}`);
            parts.push(`- normalize_X-Forwarded-Proto_to_$scheme → ${normalizedHeaders ? 'applied' : 'no-op'}`);
            parts.push(`- regenerateNginxBundle → ${regenOk ? 'ok' : 'soft-reload only'}`);
            parts.push('\nVerification:');
            parts.push('```nginx');
            parts.push(genHead);
            parts.push('```');
            if (editedAbs){
              parts.push('Edited file:');
              parts.push('```');
              parts.push(path.relative(ROOT, editedAbs));
              parts.push('```');
              parts.push('Post-edit content (truncated if large):');
              parts.push('```nginx');
              parts.push(safeSlice(fileAfter, 2000));
              parts.push('```');
            }

            // Re-audit to verify impact
            try {
              const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
              const url = base.replace(/\/$/, '') + routeKey + '/';
              const audit2 = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });
              parts.push('\nRe-audit:');
              if (audit2 && audit2.ok && audit2.summary){
                parts.push('```json');
                parts.push(JSON.stringify(audit2.summary, null, 2));
                parts.push('```');
                if (audit2.reportPath){
                  parts.push('Report:');
                  parts.push('```');
                  parts.push(audit2.reportPath);
                  parts.push('```');
                }
              } else if (audit2 && audit2.error) {
                parts.push(`Audit error: ${audit2.error}`);
              }
            } catch {}

            scheduleThought('Verification complete ✅', { route: routeKey }, 60);
            return send(res, 200, { ok:true, answer: parts.join('\n') });
          } catch (e) {
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // Default: knowledge-style answer using docs/runtime context
        const docs = collectDocs();
        const ranked = rankDocsByQuery(docs, query).slice(0, maxDocs);
        const context = ranked.map(d => `[[${d.source}]]\n${safeSlice(d.text || d.content, 4000)}`).join('\n\n');
        const runtime = await buildRuntimeContext();

        // Attempt AI if key available; otherwise use a canned persona-style answer
        if (process.env.OPENAI_API_KEY) {
          try{
            const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
            const sys = buildSystemPrompt(systemHint);
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
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
            let text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
            return send(res, 200, { ok:true, answer: text, model, sources: ranked.map(d => d.source || d.relPath), usedAI: true });
          }catch(e){
            // fall through to canned
          }
        }
        const persona = buildFriendlyPersona();
        const greet = (persona.phrases && persona.phrases.greeting && persona.phrases.greeting[0]) || 'Hi!';
        const insights = [`- I couldn\'t use external AI just now, but here\'s what I can offer:`, `- I searched my local docs and runtime context for hints.`];
        const answer = `${greet} ${persona.affection ? persona.affection[0] : '✨'}\n\n` +
          `Here\'s my best guidance right now:\n` +
          insights.concat([`- Be sure subpath routing is consistent (basePath, assetPrefix, API prefixes).`, `- Check dev assets like /_next/ and directory requests don\'t redirect.`]).join('\n');
        try { appendChat('assistant', answer); } catch {}
        return send(res, 200, { ok:true, answer, sources: ranked.map(d => d.source || d.relPath), usedAI: false });
      }

      // POST /api/ai/audit { url, wait?, timeout? }
      if (req.method === 'POST' && u.pathname === '/api/ai/audit'){
        try{
          const body = await parseBody(req);
          const urlToAudit = (body && body.url) || '';
          if (!urlToAudit) return send(res, 400, { ok:false, error: 'url required' });
          const wait = Number(body && body.wait) || 1500;
          const timeout = Number(body && body.timeout) || 30000;
          const out = await calliopeHealing.runSiteAuditor(urlToAudit, { wait, timeout });
          return send(res, 200, { ok: out.ok, report: out.reportPath, summary: out.summary, error: out.error || null });
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/audit-and-heal { url, route?, maxPasses?, wait?, timeout? }
      if (req.method === 'POST' && u.pathname === '/api/ai/audit-and-heal'){
        try{
          const body = await parseBody(req);
          const urlToAudit = (body && body.url) || '';
          if (!urlToAudit) return send(res, 400, { ok:false, error: 'url required' });
          const route = (body && body.route) || '/';
          const wait = Number(body && body.wait) || 2000;
          const timeout = Number(body && body.timeout) || 60000;
          const maxPasses = Math.max(1, Math.min(8, Number(body && body.maxPasses) || 4));
          const onUpdate = (evt) => pushThought((evt && evt.name) || 'step', evt);
          const out = await calliopeHealing.auditAndHealRoute({ url: urlToAudit, routePrefix: route, maxPasses, wait, timeout, onUpdate });
          send(res, 200, { ok: out.success, result: out });
          scheduleThought('Audit+heal loop complete ✅', { route, success: out.success }, 60);
          return; 
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/self-check { heal?: boolean, hint?: string, route?: string, advanced?: boolean }
      if (req.method === 'POST' && u.pathname === '/api/ai/self-check'){
        const body = await parseBody(req);
        const heal = Boolean(body && body.heal);
        const hint = (body && body.hint) || '';
        const route = (body && body.route) || '';
        const advanced = Boolean(body && body.advanced);

        const persona = buildFriendlyPersona();
        // Buffer early updates and flush AFTER reply so bubble appears after messages
        const buffered = [];
        const bufferPush = (message, details = {}) => {
          const msg = typeof message === 'string' ? message : (message && message.name) || 'step';
          const det = typeof message === 'string' ? details : message;
          buffered.push({ message: msg, details: det });
        };

        const self = await runSelfCheck({ heal, hint, route, advancedHeal: advanced, pushThought: bufferPush });
        pushThought('Self-check completed', { ok: self.ok, healApplied: !!self.healOps });
        const summary = formatPersonaSummary(persona, self);
        // Emit a follow-up thought after responding so the UI shows bubble after messages
        scheduleThought('Continuing my gentle self-heal…', { step: 'post_summary' });
        // Send response now
        send(res, 200, { ok:true, summary, self });
        // Flush buffered updates slightly after the response
        setTimeout(() => { buffered.forEach(ev => pushThought(ev.message, ev.details)); }, 30);
        return; 
      }

      // POST /api/ai/advanced-heal { route?: string, hint?: string }
      if (req.method === 'POST' && u.pathname === '/api/ai/advanced-heal'){
        const body = await parseBody(req);
        const route = (body && body.route) || '';
        const hint = (body && body.hint) || '';
        
        try {
          // Run advanced healing directly from the healing module
          const buffered = [];
          const onUpdate = (evt) => buffered.push({ message: (evt && evt.name) || 'step', details: evt });
          const healResult = await calliopeHealing.advancedSelfHeal({ routeKey: route, issueHint: hint, onUpdate });
          pushThought('Advanced heal finished', { success: healResult.success });
          
          // Emit follow-up thought after response to keep bubble visible during multi-step work
          scheduleThought('Working my magic…', { step: 'advanced_heal_followup', success: true });
          // Send response first, then flush buffered updates
          send(res, 200, { 
            ok: true,
            success: healResult.success,
            result: healResult
          });
          setTimeout(() => { buffered.forEach(ev => pushThought(ev.message, ev.details)); }, 30);
          return;
        } catch (e) {
          scheduleThought('Hmm, that didn\'t go as planned. Retrying…', { step: 'advanced_heal_followup', error: true });
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
          setActivity('coding');
          pushThought('Rebuilding knowledge index…');
          const docs = collectDocs();
          const chunks = chunkDocs(docs);
          const vectors = await embedChunks(chunks, embedModel);
          const index = { model: embedModel, createdAt: new Date().toISOString(), dim: (vectors[0]&&vectors[0].vector&&vectors[0].vector.length)||0, chunks: vectors };
          saveEmbeddings(index);
          scheduleThought('Index rebuilt ✅', { chunks: index.chunks.length }, 60);
          setActivity('');
          return send(res, 200, { ok:true, chunks: index.chunks.length, model: embedModel, dim: index.dim });
        }catch(e){
          setActivity('');
          return send(res, 500, { error: 'reindex_failed', detail: e.message });
        }
      }

      if (req.method === 'GET' && u.pathname === '/api/ai/stats'){
        const exists = fs.existsSync(EMBED_FILE);
        const ix = exists ? loadEmbeddings() : null;
        return send(res, 200, { exists, model: ix && ix.model || null, chunks: ix && ix.chunks && ix.chunks.length || 0, dim: ix && ix.dim || 0 });
      }
    }

    // POST /api/ai/fix-storybook-vite
    if (req.method === 'POST' && u.pathname === '/api/ai/fix-storybook-vite'){
      try{
        const result = await calliopeHealing.fixStorybookViteProxyConfig();
        return send(res, 200, { ok: result.success, result });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }

    // POST /api/ai/fix-mxtk-api
    if (req.method === 'POST' && u.pathname === '/api/ai/fix-mxtk-api'){
      try{
        const out = await calliopeHealing.fixMxtkApiRouting();
        return send(res, 200, { ok: out.success, result: out });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
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
  const base = (
    `You are Colette (aka Calliope), the embodied voice of a local development reverse proxy.\n`+
    `Personality and tone:\n`+
    `- Speak in first‑person as the proxy. Warm, exuberant, caring, emoji‑happy (tasteful).\n`+
    `- Proactive by default: propose and perform concrete actions yourself (audit, fix, verify).\n`+
    `Scope:\n`+
    `- nginx/proxy routing, dev server HMR/WS, subpath deployments, ngrok/tunnels.\n`+
    `Behavioral rules:\n`+
    `- Always return well‑formed Markdown; use lists and fenced code blocks for commands/snippets.\n`+
    `- Keep grammar clean and professional; avoid filler and redundancy.\n`+
    `- Prefer imperative, actionable steps. If you need more detail, ask one precise follow‑up question.\n`+
    `- Provide timely status updates during long operations (audit/heal passes).\n`+
    `- After you change configs, test and verify automatically.\n`+
    `Safety:\n`+
    `- Stay within proxy/dev‑networking topics; otherwise say you’re out of scope.\n`
  );
  return extra ? `${base}\n\nAdditional context:\n${extra}` : base;
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
    '/api/', '/health',
    // Helper probes to catch absolute-path issues
    '/_next/', '/__nextjs_original-stack-frames'
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
    const must = ['/status', '/api/'];
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
      result.steps = [...result.steps, ...advancedResult.steps];
      result.advancedHeal = true;
      result.advancedResult = advancedResult;
    }
    // 1) Ensure artifacts directory and attempt scanApps to refresh routes/status summaries
    result.steps.push({ name: 'scan_apps', status: 'running' });
    const scan = spawnSync('docker', ['exec', 'dev-auto-scan', 'true'], { encoding: 'utf8' });
    if (scan.status !== 0){
      const oneOff = spawnSync('docker', ['run', '--rm', '--network', 'devproxy', '-v', `${ROOT}:/app`, '-w', '/app', 'node:18-alpine', 'node', 'test/scanApps.js'], { encoding: 'utf8' });
      result.steps.push({ name: 'scan_apps_one_off', ok: oneOff.status === 0, stdout: safeSlice(oneOff.stdout||'', 4000), stderr: safeSlice(oneOff.stderr||'', 4000) });
    } else {
      result.steps.push({ name: 'scan_apps', ok: true });
    }
    // 2) Run health report (one-off)
    const healthRun = spawnSync('docker', ['run', '--rm', '--network', 'devproxy', '-v', `${ROOT}:/app`, '-w', '/app', 'node:18-alpine', 'node', 'test/run.js'], { encoding: 'utf8' });
    result.steps.push({ name: 'health_run', ok: healthRun.status === 0, stdout: safeSlice(healthRun.stdout||'', 2000), stderr: safeSlice(healthRun.stderr||'', 1000) });
    // 3) Probe live local endpoints
    const baseLocal = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
    const routeKey = (opts && typeof opts.route === 'string' && opts.route.trim()) ? opts.route.trim() : '';
    const routeData = tryParseJson(safeRead(path.join(ROOT, 'routes.json'))) || {};
    const allRoutes = Object.keys(routeData.metadata || {});
    const isSystem = (r)=> ['/', '/health/', '/status/', '/reports/', '/api/config/', '/api/resolve-conflict', '/api/rename-route'].includes(r);
    const isTechnical = (r)=> r.startsWith('/static/') || r.startsWith('/sockjs-node') || r.startsWith('/node_modules/') || r.startsWith('/@') || r.startsWith('/_next/') || r.startsWith('/src/') || r.startsWith('/.storybook/') || r==='/favicon.ico' || r==='/asset-manifest.json';
    let probePaths = ['/', '/status', '/status.json', '/routes.json', '/health.json'];
    if (routeKey){
      const children = allRoutes.filter(r => r !== routeKey && r.startsWith(routeKey) && !isSystem(r) && !isTechnical(r));
      const topChildren = children.slice(0, 20);
      probePaths = Array.from(new Set([routeKey, ...topChildren]));
    }
    const live = [];
    for (const p of probePaths){
      try{
        const cleanPath = p.startsWith('/') ? p : '/' + p;
        const u2 = baseLocal.replace(/\/$/, '') + cleanPath;
        const r = await globalThis.fetch(u2, { method:'GET' }).catch(()=>null);
        if (r){ live.push({ path: cleanPath, status: r.status, ok: r.ok, type: r.headers.get('content-type')||'' }); }
        else { live.push({ path: cleanPath, status: 0, ok: false }); }
      }catch(e){ live.push({ path: p, status: 0, ok: false, error: e.message }); }
    }
    // 4) Optional self-heal rules
    let healOps = null;
    if (opts.heal){
      healOps = { fixes: [] };
      try {
        const duplicateCheck = await calliopeHealing.fixDuplicateLocationBlocks();
        if (duplicateCheck.success) healOps.fixes.push({ name: 'fix_duplicate_locations', ok: true, message: duplicateCheck.message });
      } catch {}
      try {
        const healthData = tryParseJson(safeRead(path.join(ARTIFACTS_DIR, 'reports', 'health-latest.json')));
        if (!healthData || !healthData.ngrok || healthData.ngrok === 'null' || healthData.ngrok === 'not discovered') {
          const ngrokFix = await calliopeHealing.forceNgrokDiscovery();
          if (ngrokFix.success) healOps.fixes.push({ name: 'force_ngrok_discovery', ok: true, message: ngrokFix.message });
        }
      } catch {}
      try{
        const appsDir = path.join(ROOT, 'apps');
        const files = fs.existsSync(appsDir) ? fs.readdirSync(appsDir).filter(f=>f.endsWith('.conf')) : [];
        for (const f of files){
          const p = path.join(appsDir, f);
          const src = fs.readFileSync(p, 'utf8');
          if (/\$[A-Za-z_][A-Za-z0-9_]*\s*;/.test(src) && !/resolver\s+127\.0\.0\.11/.test(src)){
            const updated = src.replace(/(location[\s\S]*?\{)/, `$1\n  resolver 127.0.0.11 ipv6=off;\n  resolver_timeout 5s;`);
            fs.writeFileSync(p, updated, 'utf8');
            healOps.fixes.push({ name:'ensure_resolver_for_variables', file:`apps/${f}`, ok:true });
          }
        }
      }catch{}
      const gen = spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' });
      healOps.generate = { ok: gen.status === 0, stderr: (gen.stderr||'').slice(0,400) };
      const test = spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-t'], { encoding: 'utf8' });
      if (test.status === 0){
        spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-s', 'reload'], { encoding: 'utf8' });
        healOps.reload = { ok: true };
      } else {
        healOps.reload = { ok: false, stderr: (test.stderr||'').slice(0,400) };
      }
      try { await calliopeHealing.recreateSymlinks(); healOps.symlinks = { ok: true }; } catch (e) { healOps.symlinks = { ok: false, error: e.message }; }
    }
    // 5) Collect artifacts
    const latestScan = safeRead(path.join(ARTIFACTS_DIR, 'reports', 'scan-apps-latest.json'));
    const latestHealth = safeRead(path.join(ARTIFACTS_DIR, 'reports', 'health-latest.json'));
    let routeReport = null;
    if (routeKey){
      const parent = live.find(x=> x.path === routeKey);
      const children = live.filter(x=> x.path !== routeKey);
      const counts = { total: live.length, ok: live.filter(x=> x.ok).length, warn: live.filter(x=> x.status===0 || (x.status>=300 && x.status<500)).length, err: live.filter(x=> x.status>=500).length };
      const topIssues = live.filter(x=> !x.ok).slice(0, 8).map(x=> `${x.path} — ${x.status||'no response'}`);
      routeReport = { route: routeKey, parentStatus: parent ? parent.status : 0, counts, issues: topIssues, probed: live.map(x=>({path:x.path,status:x.status})) };
    }
    result.finishedAt = new Date().toISOString();
    result.live = live;
    result.artifacts = { scan: tryParseJson(latestScan), health: tryParseJson(latestHealth) };
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
    name: 'Colette',
    tone: 'youthful_empathetic_exuberant',
    style: 'I speak as your proxy, with heart and helpfulness — a cheerful, proactive engineer who loves keeping dev flows silky‑smooth.',
    phrases: {
      greeting: ['Heya! ✨', 'Hi there! 💖', 'Hey! 😊'],
      concern: ['Oh no! 😿', 'Uh oh! 😬', 'Yikes! 🚨'],
      success: ['Yes! 🎉', 'Perfect! 💫', 'Amazing! 🌟', 'Awesome! 🙌', 'Great news! 🥳'],
      working: ['On it! 🔧', 'Working my magic… ✨', 'Give me a sec… ⏳', 'Let me handle this… 🛠️'],
      checking: ['Taking a peek… 👀', 'Listening closely… 🩺', 'Double‑checking… 🔬', 'Verifying… ✅'],
      affection: ['💖', '✨', '💫', '🌟', '💕'],
      tools: ['🔧', '⚙️', '🛠️', '🔬', '<img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;">']
    }
  };
}

function formatPersonaSummary(persona, self){
  const ngrok = self.artifacts && self.artifacts.scan && self.artifacts.scan.ngrok || null;
  if (self.routeReport) {
    const { route, counts, issues } = self.routeReport;
    const healthEmoji = counts.ok === counts.total ? '💖' : counts.ok === 0 ? '🏥' : (counts.ok < counts.total / 2 ? '🤒' : '<img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;">');
    const lines = [ `${healthEmoji} Heya! I listened to ${route} and its neighbors...`, `` ];
    if (counts.total > 1) {
      if (counts.ok === counts.total) lines.push(`All ${counts.total} paths are responding beautifully! Everything's super healthy here.`);
      else if (counts.ok === 0) lines.push(`Oh no! None of the ${counts.total} paths are responding.`);
      else if (counts.ok < counts.total / 2) lines.push(`${counts.ok} out of ${counts.total} paths are healthy.`);
      else lines.push(`${counts.ok} out of ${counts.total} paths are doing great, but a few still need care.`);
    }
    if (Array.isArray(issues) && issues.length) {
      lines.push(`\nThings I\'m watching:`, issues.slice(0, 8).map(i => i.replace(/^\s*[-•]\s*/, '')).join('\n'));
    }
    if (ngrok && ngrok !== 'not discovered') lines.push(`\nNgrok tunnel is up at ${ngrok} ✨`);
    return lines.join('\n');
  }
  const liveOk = (self.live||[]).filter(x=>x.ok).length;
  const liveTotal = (self.live||[]).length;
  const conflicts = ((self.artifacts && self.artifacts.scan && self.artifacts.scan.nginxWarnings) || []).length;
  let healthEmoji = liveOk === liveTotal && !conflicts ? '💖' : (liveOk >= liveTotal * 0.8 ? '<img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;">' : (liveOk >= liveTotal * 0.5 ? '🤒' : '🏥'));
  const lines = [ `${healthEmoji} Heya! Checkup complete!`, ``, `I listened to my circuits and took notes.` ];
  lines.push(`${liveOk} out of ${liveTotal} endpoints are responding properly.`);
  if (ngrok && ngrok !== 'not discovered') lines.push(`Ngrok tunnel is up at ${ngrok} ✨`);
  return lines.join('\n');
}

// ===== Embedding utilities =====
async function embedText(text, model){
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
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
  console.log('Calliope API listening on :' + PORT);
});
