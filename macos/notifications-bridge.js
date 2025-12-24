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
const { spawnSync, execSync } = require('child_process');

const PORT = parseInt(process.env.NOTIF_BRIDGE_PORT || '17888', 10);
const HOST = '127.0.0.1';
const ROOT_DIR = path.resolve(__dirname, '..');
const LABEL = 'com.leorami.devtunnelproxy.notifications';
const PLIST_PATH = path.join(require('os').homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

function json(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
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
  // Uses iMessage service; for SMS, macOS will use SMS relay if available/enabled.
  const script = `
on run argv
  set theBuddy to item 1 of argv
  set theMessage to item 2 of argv
  tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy theBuddy of targetService
    send theMessage to targetBuddy
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
  const installed = isLaunchAgentInstalled();
  const running = installed && isLaunchAgentRunning();
  
  let logPath = null;
  let errPath = null;
  if (installed) {
    logPath = path.join(ROOT_DIR, '.artifacts', 'notifications-engine.log');
    errPath = path.join(ROOT_DIR, '.artifacts', 'notifications-engine.err');
  }

  return {
    installed,
    running,
    label: LABEL,
    plistPath: PLIST_PATH,
    logPath,
    errPath
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
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
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
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[notifications-bridge] listening on http://${HOST}:${PORT}`);
});

