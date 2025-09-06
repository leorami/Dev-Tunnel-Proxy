#!/usr/bin/env node
/* Minimal Conflict Management API (no external deps)
   Endpoints:
   - GET  /api/config/:file
   - POST /api/config/:file    { content }
   - POST /api/resolve-conflict { route, winner }
   - POST /api/rename-route     { oldRoute, newRoute, configFile }
*/

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');
const ARTIFACTS_DIR = path.join(ROOT, '.artifacts');
const RES_FILE = path.join(ARTIFACTS_DIR, 'route-resolutions.json');

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

    send(res, 404, { error: 'Not found' });
  }catch(e){
    send(res, 500, { error: e.message });
  }
}

function escapeReg(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PORT = process.env.PORT || 3001;
http.createServer(handle).listen(PORT, () => {
  console.log('Conflict API listening on :' + PORT);
});
