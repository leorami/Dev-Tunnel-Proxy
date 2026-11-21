'use strict';
/**
 * Native disposable nginx proof: production-shaped ^~ UI prefixes beat nested JSON regex.
 * Source-only; no live proxy mutation.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const IMAGE = 'nginx:1.26.3-alpine';
const dockerOk = spawnSync('docker', ['image', 'inspect', IMAGE], { encoding: 'utf8', timeout: 15000 }).status === 0;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function request(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: urlPath, timeout: 4000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

test('native: ^~ /status requires auth for nested JSON; public health.json stays open', async (t) => {
  if (!dockerOk) {
    t.skip('nginx:1.26.3-alpine image not available locally');
    return;
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'v175-nginx-'));
  const html = path.join(dir, 'html');
  await fsp.mkdir(path.join(html, 'status'), { recursive: true });
  await fsp.writeFile(path.join(html, 'status', 'status.html'), 'STATUS_OK');
  await fsp.writeFile(path.join(html, 'status', 'nested.json'), '{"secret":true}');
  await fsp.writeFile(path.join(html, 'health.json'), '{"ok":true}');
  const conf = `
events { worker_connections 64; }
http {
  server {
    listen 8080;
    location = /admin/visual-access-check {
      internal;
      if ($http_cookie ~* "(^|;\\\\s*)dp_owner=1(;|$)") { return 200; }
      return 401;
    }
    location @login_redirect { return 401 'login-required'; }
    location = /health.json { root /usr/share/nginx/html; }
    location ^~ /status {
      auth_request /admin/visual-access-check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
    }
    location ~* \\.(json)$ {
      root /usr/share/nginx/html;
    }
  }
}
`;
  await fsp.writeFile(path.join(dir, 'nginx.conf'), conf);
  const hostPort = await freePort();
  const name = 'v175-nginx-' + process.pid;
  const run = spawnSync('docker', [
    'run', '-d', '--rm', '--name', name,
    '-p', `127.0.0.1:${hostPort}:8080`,
    '-v', `${path.join(dir, 'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
    '-v', `${html}:/usr/share/nginx/html:ro`,
    IMAGE,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
  try {
    await new Promise((r) => setTimeout(r, 800));
    const anonNested = await request(hostPort, '/status/nested.json');
    assert.equal(anonNested.status, 401, 'anonymous nested JSON under ^~ /status must require auth');
    const health = await request(hostPort, '/health.json');
    assert.equal(health.status, 200);
    assert.match(health.body, /ok/);
  } finally {
    spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 15000 });
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
