#!/usr/bin/env node
/**
 * Dev Tunnel Proxy: macOS Notifications Bridge
 *
 * A tiny local HTTP server that can send a test message via Messages.app
 * and manage the notifications engine LaunchAgent.
 *
 * Why this exists:
 * - The Status UI runs in a browser.
 * - Sending texts is a macOS-only capability (AppleScript -> Messages).
 * - This bridge gives the UI a local endpoint to call.
 *
 * Run:
 *   node macos/notifications-bridge.js
 *
 * Optional env:
 *   NOTIF_BRIDGE_PORT=17888
 *
 * Endpoints:
 *   GET  /health                - Health check
 *   GET  /service/status        - Check LaunchAgent installation status
 *   POST /service/install       - Install and start the notifications engine
 *   POST /service/uninstall     - Stop and uninstall the notifications engine
 *   POST /test                  - Send a test notification
 *     JSON: {
 *       "recipients": ["+15125551234"],
 *       "subject": "TEST: ...",
 *       "message": "..."
 *     }
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execSync } = require('child_process');
const { randomBytes } = require('node:crypto');
const { authorizeBridgeRequest, resolveAllowedOrigins } = require('./notifications-bridge-auth.cjs');

const PORT = parseInt(process.env.NOTIF_BRIDGE_PORT || '17888', 10);
const HOST = '127.0.0.1';
const ROOT_DIR = path.resolve(__dirname, '..');
const LABEL = 'com.leorami.devtunnelproxy.notifications';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

// Local operator-only pairing credential. Never in served HTML, API, .artifacts,
// logs, or repository; the user retrieves it directly on their Mac when pairing.
// A configured environment credential wins, but must be strong.
const SECRET_DIR=path.join(os.homedir(),'Library','Application Support','Dev Tunnel Proxy');
const SECRET_PATH=path.join(SECRET_DIR,'notification-bridge.token');
function loadOrCreateBridgeToken() {
  const configured=process.env.NOTIF_BRIDGE_TOKEN;
  if(configured!==undefined) {
    if(typeof configured!=='string'||configured.length<32) throw new Error('NOTIF_BRIDGE_TOKEN must contain at least 32 characters');
    return configured;
  }
  fs.mkdirSync(SECRET_DIR,{recursive:true,mode:0o700});
  const dir=fs.lstatSync(SECRET_DIR);
  if(!dir.isDirectory()||(dir.mode&0o077)) throw new Error('Notification secret directory permissions unsafe');
  try {
    const fd=fs.openSync(SECRET_PATH,'wx',0o600);
    try { fs.writeSync(fd,randomBytes(32).toString('hex')+'\n'); }
    finally { fs.closeSync(fd); }
  } catch(e) {
    if(e.code!=='EEXIST') throw e;
  }
  const st=fs.lstatSync(SECRET_PATH);
  if(!st.isFile()||(st.mode&0o077)||(typeof process.getuid==='function'&&st.uid!==process.getuid())) {
    throw new Error('Notification bridge token file ownership or permissions unsafe');
  }
  const token=fs.readFileSync(SECRET_PATH,'utf8').trim();
  if(token.length<32) throw new Error('Notification bridge token file too short');
  return token;
}
const BRIDGE_TOKEN=loadOrCreateBridgeToken();
const BRIDGE_ALLOWED_ORIGINS=resolveAllowedOrigins(process.env.NOTIF_BRIDGE_ALLOWED_ORIGINS||'');


function bridgeCorsHeaders(res) {
  if(!res.bridgeCorsOrigin) return {'Vary':'Origin'};
  return {
    'Vary':'Origin',
    'Access-Control-Allow-Origin':res.bridgeCorsOrigin,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type',
    'Access-Control-Allow-Private-Network':'true',
  };
}
function json(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...bridgeCorsHeaders(res),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if(Buffer.byteLength(data)>64*1024) {
        req.pause();
        reject(Object.assign(new Error('Request too large'),{status:413}));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function normalizeRecipients(recipients) {
  if (!recipients) return [];
  if (Array.isArray(recipients)) return recipients.map(String).map(s => s.trim()).filter(Boolean);
  return String(recipients)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function sendViaMessages(recipient, text) {
  // Use a more natural approach that doesn't trigger Contact Key Verification
  // This creates a new message in Messages.app as if the user typed it
  const script = `
on run argv
  set theBuddy to item 1 of argv
  set theMessage to item 2 of argv
  tell application "Messages"
    set targetService to first service
    set newMessage to make new outgoing message with properties {content:theMessage}
    tell newMessage
      send to participant theBuddy of targetService
    end tell
  end tell
end run
`.trim();

  const result = spawnSync('/usr/bin/osascript', ['-e', script, recipient, text], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(err || `osascript failed with exit ${result.status}`);
  }
}

function isLaunchAgentInstalled() {
  try {
    return fs.existsSync(PLIST_PATH);
  } catch {
    return false;
  }
}

function isLaunchAgentRunning() {
  try {
    const result = execSync(`launchctl list | grep ${LABEL}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

function getLaunchAgentStatus() {
  const engineInstalled = isLaunchAgentInstalled();
  const engineRunning = engineInstalled && isLaunchAgentRunning();
  
  // Check bridge status (self)
  const BRIDGE_LABEL = 'com.leorami.devtunnelproxy.notifications.bridge';
  const BRIDGE_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${BRIDGE_LABEL}.plist`);
  const bridgeInstalled = fs.existsSync(BRIDGE_PLIST);
  const bridgeRunning = bridgeInstalled; // If we're responding, we're running
  
  let logPath = null;
  let errPath = null;
  let bridgeLogPath = null;
  let bridgeErrPath = null;
  
  if (engineInstalled) {
    logPath = path.join(ROOT_DIR, '.artifacts', 'notifications-engine.log');
    errPath = path.join(ROOT_DIR, '.artifacts', 'notifications-engine.err');
  }
  
  if (bridgeInstalled) {
    bridgeLogPath = path.join(ROOT_DIR, '.artifacts', 'notifications-bridge.log');
    bridgeErrPath = path.join(ROOT_DIR, '.artifacts', 'notifications-bridge.err');
  }

  return {
    installed: engineInstalled && bridgeInstalled,
    running: engineRunning && bridgeRunning,
    engine: {
      installed: engineInstalled,
      running: engineRunning,
      label: LABEL,
      plistPath: PLIST_PATH,
      logPath,
      errPath
    },
    bridge: {
      installed: bridgeInstalled,
      running: bridgeRunning,
      label: BRIDGE_LABEL,
      plistPath: BRIDGE_PLIST,
      logPath: bridgeLogPath,
      errPath: bridgeErrPath
    }
  };
}

function installLaunchAgent() {
  const WRAPPER_SCRIPT = path.join(ROOT_DIR, 'macos', 'dev-tunnel-proxy-notifications');
  
  if (!fs.existsSync(WRAPPER_SCRIPT)) {
    throw new Error(`Wrapper script not found: ${WRAPPER_SCRIPT}`);
  }

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${WRAPPER_SCRIPT}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>NOTIF_POLL_INTERVAL_SEC</key>
      <string>10</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${ROOT_DIR}/.artifacts/notifications-engine.log</string>
    <key>StandardErrorPath</key>
    <string>${ROOT_DIR}/.artifacts/notifications-engine.err</string>
  </dict>
</plist>
`;

  // Ensure LaunchAgents directory exists
  const launchAgentsDir = path.dirname(PLIST_PATH);
  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  // Write plist file
  fs.writeFileSync(PLIST_PATH, plistContent, 'utf8');

  // Unload if already loaded (in case of reinstall)
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {}

  // Load the agent
  execSync(`launchctl load "${PLIST_PATH}"`, { encoding: 'utf8' });

  return getLaunchAgentStatus();
}

function uninstallLaunchAgent() {
  if (!fs.existsSync(PLIST_PATH)) {
    throw new Error('LaunchAgent is not installed');
  }

  // Unload the agent
  try {
    execSync(`launchctl unload "${PLIST_PATH}"`, { encoding: 'utf8' });
  } catch (e) {
    // Continue even if unload fails (might not be loaded)
  }

  // Remove plist file
  fs.unlinkSync(PLIST_PATH);

  return { installed: false, running: false };
}

const server = http.createServer(async (req, res) => {
  try {
    const decision=authorizeBridgeRequest(req,{
      token:BRIDGE_TOKEN,port:PORT,allowedOrigins:BRIDGE_ALLOWED_ORIGINS,
    });
    res.bridgeCorsOrigin=decision.corsOrigin;
    if(!decision.allowed) return json(res,decision.status,{ok:false,error:decision.reason});
    if(decision.isPreflight) {
      res.writeHead(204,{'Cache-Control':'no-store',...bridgeCorsHeaders(res)});
      return res.end();
    }

    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, status: 'healthy' });
    }

    if (req.method === 'GET' && req.url === '/service/status') {
      const status = getLaunchAgentStatus();
      return json(res, 200, { ok: true, ...status });
    }

    if (req.method === 'POST' && req.url === '/service/install') {
      try {
        const status = installLaunchAgent();
        return json(res, 200, { ok: true, message: 'LaunchAgent installed and started', ...status });
      } catch (e) {
        return json(res, 500, { ok: false, error: e?.message || String(e) });
      }
    }

    if (req.method === 'POST' && req.url === '/service/uninstall') {
      try {
        const status = uninstallLaunchAgent();
        return json(res, 200, { ok: true, message: 'LaunchAgent uninstalled', ...status });
      } catch (e) {
        return json(res, 500, { ok: false, error: e?.message || String(e) });
      }
    }

    if (req.method === 'POST' && req.url === '/test') {
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return json(res, 415, { ok: false, error: 'Content-Type must be application/json' });
      }
      const raw = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(raw || '{}');
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON' });
      }

      const recipients = normalizeRecipients(payload.recipients);
      const subject = (payload.subject || '').toString();
      const message = (payload.message || '').toString();

      if (recipients.length === 0) {
        return json(res, 400, { ok: false, error: 'At least one recipient is required' });
      }

      const text = [subject, message].filter(Boolean).join('\n\n') || 'TEST';
      const results = [];

      for (const r of recipients) {
        try {
          sendViaMessages(r, text);
          results.push({ recipient: r, ok: true });
        } catch (e) {
          results.push({ recipient: r, ok: false, error: e?.message || String(e) });
        }
      }

      const ok = results.every(x => x.ok);
      return json(res, ok ? 200 : 502, { ok, results });
    }

    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (e) {
    return json(res, e?.status === 413 ? 413 : 500, { ok: false, error: e?.status === 413 ? 'Request too large' : 'Internal bridge error' });
  }
});

server.listen(PORT, HOST, () => {
  const pairingFromEnvironment = process.env.NOTIF_BRIDGE_TOKEN !== undefined;
  // eslint-disable-next-line no-console
  console.log(`[notifications-bridge] listening on http://${HOST}:${PORT}`);
  console.log('[notifications-bridge] pairing token location: '+(pairingFromEnvironment?'configured environment':'private local file '+SECRET_PATH));
});

