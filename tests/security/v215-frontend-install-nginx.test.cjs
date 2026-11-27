'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { sha256, installRelease, rollbackRelease } = require('../../scripts/v215-frontend-install.cjs');

const ROOT = path.resolve(__dirname, '../..');
const STATUS = path.join(ROOT, 'status');
const PREIMAGE = path.join(__dirname, 'fixtures', 'v215-v214-documents');
const IMAGE = 'nginx:1.26.3-alpine';
const DOCUMENTS = ['health.html', 'reports.html', 'status.html'];

function preimage(name) {
  return fs.readFileSync(path.join(PREIMAGE, name));
}

function releaseFromRepo() {
  const health = fs.readFileSync(path.join(STATUS, 'health.html'), 'utf8');
  const cssName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.css)/)[1];
  const jsName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.js)/)[1];
  const previous = {};
  const documents = {};
  for (const name of DOCUMENTS) {
    previous[name.replace('.html', '')] = sha256(preimage(name));
    documents[name.replace('.html', '')] = fs.readFileSync(path.join(STATUS, name));
  }
  return {
    cssName,
    jsName,
    cssBytes: fs.readFileSync(path.join(STATUS, cssName)),
    jsBytes: fs.readFileSync(path.join(STATUS, jsName)),
    documents,
    previous,
  };
}

function nginxConf() {
  return `
events { worker_connections 64; }
http {
  default_type text/plain;
  server {
    listen 8080;
    server_name _;
    location = /admin/check {
      internal;
      if ($http_cookie ~* "(^|;\\\\s*)dp_owner=1(;|$)") { return 200; }
      return 401;
    }
    location @login_redirect { return 401 'login-required'; }
    location ^~ /status {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
      index status.html;
      try_files $uri $uri/status.html $uri.html =404;
    }
    location ^~ /reports {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
      index reports.html;
      try_files $uri $uri/reports.html $uri.html =404;
    }
    location ^~ /health {
      auth_request /admin/check;
      error_page 401 = @login_redirect;
      alias /usr/share/nginx/html/status;
      index health.html;
      try_files $uri $uri/health.html $uri.html =404;
    }
    location = /health.json {
      default_type application/json;
      add_header Cache-Control "no-store" always;
      if (!-f /usr/share/nginx/html/.artifacts/reports/health-latest.json) {
        return 503 '{"status":"unavailable"}';
      }
      return 200 '{"status":"ok"}';
    }
  }
}
`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function request(port, url, { cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: url,
      headers: cookie ? { Cookie: cookie } : {},
      timeout: 4000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
  });
}

test('isolated nginx serves each install boundary and the inverse, without calling liveness a report', { timeout: 60000 }, async () => {
  const release = releaseFromRepo();
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'devproxy-v215-ngx-'));
  const html = path.join(root, 'html');
  const statusDir = path.join(html, 'status');
  const port = await freePort();
  const name = `devproxy-v215-${process.pid}-${port}`;
  let run;
  try {
    await fsp.mkdir(path.join(html, '.artifacts', 'reports'), { recursive: true });
    await fsp.cp(STATUS, statusDir, { recursive: true });
    for (const docName of DOCUMENTS) {
      await fsp.writeFile(path.join(statusDir, docName), preimage(docName));
    }
    await fsp.rm(path.join(statusDir, release.cssName), { force: true });
    await fsp.rm(path.join(statusDir, release.jsName), { force: true });
    await fsp.writeFile(path.join(html, '.artifacts', 'reports', 'health-latest.json'), '{"detailed":true}');
    await fsp.writeFile(path.join(root, 'nginx.conf'), nginxConf(), { mode: 0o600 });
    const cachedJs = await fsp.readFile(path.join(statusDir, 'common.js'));

    run = spawn('docker', [
      'run', '--rm', '--name', name,
      '--entrypoint', 'nginx',
      '-p', `127.0.0.1:${port}:8080`,
      '-v', `${path.join(root, 'nginx.conf')}:/etc/nginx/nginx.conf:ro`,
      '-v', `${html}:/usr/share/nginx/html`,
      IMAGE, '-g', 'daemon off;',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    run.stderr.on('data', (chunk) => { stderr += String(chunk).slice(0, 2000); });
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const probe = await request(port, '/health.json');
        if (probe.status === 200) { ready = true; break; }
      } catch { /* container still starting */ }
      if (run.exitCode != null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `fixture nginx not ready: ${stderr.slice(0, 400)}`);

    const anon = await request(port, '/status/health.html');
    assert.equal(anon.status, 401);
    const liveness = await request(port, '/health.json');
    assert.equal(liveness.status, 200);
    assert.equal(liveness.body.toString('utf8'), '{"status":"ok"}');
    assert.equal(liveness.body.includes(Buffer.from('<html')), false);

    const owner = { cookie: 'dp_owner=1' };
    const before = await request(port, '/status/common.js', owner);
    assert.equal(before.status, 200);
    assert.deepEqual(before.body, cachedJs);

    const partial = installRelease(statusDir, release, 3);
    const healthMid = await request(port, '/status/health.html', owner);
    const reportsMid = await request(port, '/status/reports.html', owner);
    const statusMid = await request(port, '/status/status.html', owner);
    assert.equal(healthMid.status, 200);
    assert.match(healthMid.body.toString('utf8'), /Proxy liveness/);
    assert.match(healthMid.body.toString('utf8'), new RegExp(release.jsName));
    assert.doesNotMatch(reportsMid.body.toString('utf8'), /Report list could not be read/);
    assert.doesNotMatch(statusMid.body.toString('utf8'), new RegExp(release.cssName));
    const cachedDuring = await request(port, '/status/common.js', owner);
    assert.deepEqual(cachedDuring.body, cachedJs);

    const rest = installRelease(statusDir, release, 5, 3);
    const healthNew = await request(port, '/status/health.html', owner);
    const sharedJs = await request(port, `/status/${release.jsName}`, owner);
    assert.match(healthNew.body.toString('utf8'), new RegExp(release.cssName));
    assert.match(sharedJs.body.toString('utf8'), /data-dtp-shared-style/);
    assert.doesNotMatch(sharedJs.body.toString('utf8'), /href='\/status\/common\.css'/);
    const stillCached = await request(port, '/status/common.js', owner);
    assert.deepEqual(stillCached.body, cachedJs);

    rollbackRelease(statusDir, partial.concat(rest));
    const restored = await request(port, '/status/health.html', owner);
    assert.doesNotMatch(restored.body.toString('utf8'), /Proxy liveness/);
    assert.deepEqual(restored.body, preimage('health.html'));
    const cachedAfter = await request(port, '/status/common.js', owner);
    assert.deepEqual(cachedAfter.body, cachedJs);

    await fsp.rm(path.join(html, '.artifacts', 'reports', 'health-latest.json'));
    const unavailable = await request(port, '/health.json');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.toString('utf8'), '{"status":"unavailable"}');
    const stillDocument = await request(port, '/status/health.html', owner);
    assert.equal(stillDocument.status, 200);
    assert.notEqual(stillDocument.body.toString('utf8'), unavailable.body.toString('utf8'));
  } finally {
    spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 10000 });
    if (run) {
      await Promise.race([
        new Promise((resolve) => run.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
  }
});
