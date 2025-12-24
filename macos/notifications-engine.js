#!/usr/bin/env node
/*
  Dev Tunnel Proxy: macOS Notifications Engine

  Why this exists
  - The notifications UI + API store configuration.
  - The engine runs on macOS (the supported platform for now) so it can send
    messages using the native Messages app (iMessage/SMS relay).

  What it does
  - Polls notification rules in ./.artifacts/route-notifications.json
  - Maps each route to its upstream container using scan-apps-latest.json metadata
  - Evaluates "Conditions" (proxy external + route container status)
  - Fires ONLY on transitions into a matching state (prevents spam)
  - Sends texts via Messages.app using AppleScript (osascript)

  Requirements
  - macOS with Messages configured
  - Docker Desktop running (so `docker inspect` works)
  - The auto-scan job producing ./.artifacts/reports/scan-apps-latest.json

  Usage
    node macos/notifications-engine.js
    NOTIF_POLL_INTERVAL_SEC=10 node macos/notifications-engine.js
*/

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Optional helper that already knows how to discover ngrok URL in this repo.
let discoverNgrokUrlSync = null;
try {
  ({ discoverNgrokUrlSync } = require(path.join(ROOT, 'utils', 'ngrokDiscovery')));
} catch {}

// Jump to repo root so relative paths behave no matter where you launch this.
const ROOT = path.resolve(__dirname, '..');
try { process.chdir(ROOT); } catch {}

const POLL_SEC = Math.max(3, Number(process.env.NOTIF_POLL_INTERVAL_SEC || 10));

const STORE_PATH = path.join(ROOT, '.artifacts', 'route-notifications.json');
const SCAN_PATH = path.join(ROOT, '.artifacts', 'reports', 'scan-apps-latest.json');
const STATE_PATH = path.join(ROOT, '.artifacts', 'notifications-engine-state.json');

function readJson(p, fallback) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function writeJson(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.error('[notifications][engine] failed to write state:', e?.message || e);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function extractHostname(upstream) {
  const u = (upstream || '').trim();
  if (!u) return '';
  try {
    const maybe = u.includes('://') ? u : `http://${u}`;
    const parsed = new URL(maybe);
    return (parsed.hostname || '').trim();
  } catch {
    // Fallback: split host:port
    return (u.split('/')[0].split(':')[0] || '').trim();
  }
}

function checkEndpointStatus(upstream) {
  if (!upstream) return 'unknown';
  
  // Build the URL to check
  const url = upstream.startsWith('http') ? upstream : `http://${upstream}`;
  
  try {
    // Use curl with a short timeout to check if endpoint responds
    // We only care if it's reachable, not what it returns
    const result = spawnSync('curl', [
      '-s',
      '-o', '/dev/null',
      '-w', '%{http_code}',
      '--connect-timeout', '2',
      '--max-time', '3',
      url
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    if (result.status !== 0) {
      // curl failed - endpoint not reachable
      return 'stopped';
    }
    
    const httpCode = parseInt(result.stdout.trim(), 10);
    
    // Any HTTP response (even errors) means the service is running
    // 000 means connection failed
    if (httpCode === 0 || isNaN(httpCode)) {
      return 'stopped';
    }
    
    return 'running';
  } catch {
    return 'stopped';
  }
}

function isProxyExternallyAccessible(scan) {
  const ngrok = scan && typeof scan.ngrok === 'string' ? scan.ngrok.trim() : '';
  if (ngrok && ngrok !== 'not discovered') return true;
  // Fallback: try live discovery (useful when scan hasn't run yet).
  try {
    if (typeof discoverNgrokUrlSync === 'function') {
      const live = (discoverNgrokUrlSync() || '').trim();
      return !!(live && live !== 'not discovered');
    }
  } catch {}
  return false;
}

function sendMessageViaMessagesApp(recipient, message) {
  const to = String(recipient || '').trim();
  const msg = String(message || '').trim();
  if (!to || !msg) return { ok: false, error: 'missing recipient or message' };

  // Use the notifications bridge API instead of calling Messages directly
  // This avoids LaunchAgent permission issues
  try {
    const http = require('http');
    const payload = JSON.stringify({ recipients: [to], message: msg });
    
    const options = {
      hostname: '127.0.0.1',
      port: 17888,
      path: '/test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${data}` });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ ok: false, error: e.message });
      });

      req.write(payload);
      req.end();
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function buildDefaultMessage(route, proxyExternal, status) {
  const proxyLabel = proxyExternal ? 'externally accessible' : 'local-only';
  const st = (status || 'running').toLowerCase();
  const subject = `Dev Tunnel Proxy: ${route} is ${st} (${proxyLabel})`;
  const body = `Route: ${route}\nProxy: ${proxyLabel}\nStatus: ${st}`;
  return { subject, body };
}

function normalizeRecipients(list) {
  if (!Array.isArray(list)) return [];
  return list.map(s => String(s || '').trim()).filter(Boolean);
}

function summarizeRule(rule) {
  const ext = rule?.conditions?.proxyExternallyAccessible ? 'external' : 'local';
  const st = (rule?.conditions?.containerState || 'running').toLowerCase();
  const rec = normalizeRecipients(rule?.action?.recipients);
  return `${ext}/${st} -> ${rule?.action?.type || 'text'} (${rec.join(', ')})`;
}

function loadRules() {
  const store = readJson(STORE_PATH, { routes: {} });
  const routes = store && store.routes && typeof store.routes === 'object' ? store.routes : {};
  const scan = readJson(SCAN_PATH, null);
  const meta = scan && scan.metadata && typeof scan.metadata === 'object' ? scan.metadata : {};

  return { store, routes, scan, meta };
}

function loadEngineState() {
  return readJson(STATE_PATH, { lastSatisfied: {}, lastRunAt: null });
}

function saveEngineState(state) {
  state.lastRunAt = nowIso();
  writeJson(STATE_PATH, state);
}

async function evaluateAndFireOnce() {
  const { routes, scan, meta } = loadRules();
  const state = loadEngineState();
  if (!state.lastSatisfied) state.lastSatisfied = {};

  const proxyExternalNow = isProxyExternallyAccessible(scan);

  // Flatten active notifications
  const jobs = [];
  for (const routeKey of Object.keys(routes)) {
    const bucket = routes[routeKey] || {};
    const route = bucket.route || '';
    const source = bucket.source || '';
    const list = Array.isArray(bucket.notifications) ? bucket.notifications : [];
    for (const n of list) {
      if (!n || n.recycledAt) continue;
      if (n.enabled === false) continue;
      jobs.push({ routeKey, route, source, n });
    }
  }

  if (jobs.length === 0) {
    // Still write heartbeat so people can see it’s alive.
    saveEngineState(state);
    return;
  }

  let fired = 0;

  for (const job of jobs) {
    const n = job.n;
    const desiredExternal = !!n?.conditions?.proxyExternallyAccessible;
    const desiredState = (n?.conditions?.endpointState || n?.conditions?.containerState || 'running').toLowerCase();

    // Check if the endpoint is responding through the proxy
    // Use localhost:8080 + route instead of upstream (which may be Docker-internal)
    const proxyUrl = `http://localhost:8080${job.route}`;
    const actualState = checkEndpointStatus(proxyUrl);

    const condExternalOk = desiredExternal === proxyExternalNow;
    const condStateOk = actualState === desiredState;
    const satisfied = condExternalOk && condStateOk;

    const last = !!state.lastSatisfied[n.id];
    if (satisfied && !last) {
      // Fire! (transition into satisfied state)
      const recips = normalizeRecipients(n?.action?.recipients);
      const subj = (n?.message?.subject || '').trim();
      const body = (n?.message?.body || '').trim();
      const fallback = buildDefaultMessage(job.route, desiredExternal, desiredState);
      const payload = `${subj || fallback.subject}\n\n${body || fallback.body}`;

      console.log(`[notifications][engine] firing ${n.id} (${summarizeRule(n)}) route=${job.route} proxyUrl=${proxyUrl} actual=${actualState} proxyExternal=${proxyExternalNow}`);

      for (const r of recips) {
        const result = await sendMessageViaMessagesApp(r, payload);
        if (!result.ok) {
          console.error(`[notifications][engine] send failed -> ${r}: ${result.error}`);
        }
      }
      fired++;
    }

    // Track satisfied state
    state.lastSatisfied[n.id] = satisfied;
  }

  if (fired) console.log(`[notifications][engine] done: fired=${fired}`);
  saveEngineState(state);
}

function main() {
  console.log(`[notifications][engine] macOS engine starting (poll=${POLL_SEC}s)`);
  console.log(`[notifications][engine] store=${STORE_PATH}`);
  console.log(`[notifications][engine] scan=${SCAN_PATH}`);
  console.log(`[notifications][engine] state=${STATE_PATH}`);
  console.log('[notifications][engine] tip: the first run establishes baseline state (no notifications are sent until a transition happens).');

  evaluateAndFireOnce();
  setInterval(evaluateAndFireOnce, POLL_SEC * 1000);
}

main();
