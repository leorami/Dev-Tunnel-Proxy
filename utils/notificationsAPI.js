/*
  Dev Tunnel Proxy: Notifications API

  Purpose
  - Persist per-route notification configuration to ./.artifacts/route-notifications.json
  - Keep dependencies at zero: this uses Node's built-in HTTP server

  Endpoints
  - GET  /devproxy/api/notifications
  - POST /devproxy/api/notifications

  Notes
  - Authentication is intentionally not handled here. Nginx should proxy this
    behind the same auth controls as other /devproxy/api/* endpoints.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.NOTIFICATIONS_API_PORT || 3002);
const ARTIFACT_DIR = process.env.NOTIFICATIONS_ARTIFACT_DIR || path.join(process.cwd(), '.artifacts');
const STORE_PATH = process.env.NOTIFICATIONS_STORE_PATH || path.join(ARTIFACT_DIR, 'route-notifications.json');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
}

function readStore() {
  try {
    const txt = fs.readFileSync(STORE_PATH, 'utf8');
    const json = JSON.parse(txt);
    if (json && typeof json === 'object') return json;
  } catch (_) {}
  return { routes: {} };
}

function writeStore(obj) {
  ensureDir(path.dirname(STORE_PATH));
  const safe = (obj && typeof obj === 'object') ? obj : { routes: {} };
  if (!safe.routes || typeof safe.routes !== 'object') safe.routes = {};
  fs.writeFileSync(STORE_PATH, JSON.stringify(safe, null, 2) + '\n', 'utf8');
  return safe;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 2_000_000) { // 2MB guard
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/devproxy/api/notifications') {
      if (req.method === 'GET') {
        return sendJson(res, 200, readStore());
      }

      if (req.method === 'POST') {
        const raw = await readBody(req);
        let payload;
        try { payload = raw ? JSON.parse(raw) : {}; } catch (_) {
          return sendJson(res, 400, { error: 'Invalid JSON' });
        }
        const stored = writeStore(payload);
        return sendJson(res, 200, stored);
      }

      res.writeHead(405, { 'Allow': 'GET, POST' });
      return res.end();
    }

    if (url.pathname === '/devproxy/api/notifications/health') {
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    return sendJson(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[notificationsAPI] listening on :${PORT}`);
  console.log(`[notificationsAPI] store: ${STORE_PATH}`);
});
