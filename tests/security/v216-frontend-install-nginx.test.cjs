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
const { sha256, installRelease, rollbackRelease } = require('../../scripts/v216-frontend-install.cjs');

const ROOT = path.resolve(__dirname, '../..');
const STATUS = path.join(ROOT, 'status');
const BASELINE = path.join(__dirname, 'fixtures', 'v216-served-baseline');
const IMAGE = 'nginx:1.26.3-alpine';
const DOCUMENTS = ['health.html', 'reports.html', 'status.html'];

function hostedReleaseFixture() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('RELEASE_FIXTURE_REQUIRES_ISOLATED_HOSTED_CI');
  }
}

function baseline(name) {
  return fs.readFileSync(path.join(BASELINE, name));
}

function releaseFromRepo() {
  const health = fs.readFileSync(path.join(STATUS, 'health.html'), 'utf8');
  const cssName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.css)/)[1];
  const jsName = health.match(/\/status\/(common\.v215-[0-9a-f]{12}\.js)/)[1];
  const previous = {};
  const documents = {};
  for (const name of DOCUMENTS) {
    previous[name.replace('.html', '')] = sha256(baseline(name));
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
  types {
    text/html html htm;
    text/css css;
    application/javascript js mjs;
    application/json json;
    image/svg+xml svg;
  }
  default_type application/octet-stream;
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

function request(port, url, { cookie, headers } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: url,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
      timeout: 4000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timeout')));
  });
}

test('isolated nginx serves the baseline install, cache, types, and auth, and cannot see custody', { timeout: 60000 }, async () => {
  hostedReleaseFixture();
  const release = releaseFromRepo();
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'devproxy-v216-ngx-'));
  const html = path.join(root, 'html');
  const statusDir = path.join(html, 'status');
  const custody = path.join(root, 'custody');
  const port = await freePort();
  const name = `devproxy-v216-${process.pid}-${port}`;
  let run;
  try {
    await fsp.mkdir(path.join(html, '.artifacts', 'reports'), { recursive: true });
    await fsp.mkdir(custody, { mode: 0o700 });
    await fsp.cp(STATUS, statusDir, { recursive: true });
    for (const docName of DOCUMENTS) await fsp.writeFile(path.join(statusDir, docName), baseline(docName));
    await fsp.writeFile(path.join(statusDir, 'common.js'), baseline('common.js'));
    await fsp.writeFile(path.join(statusDir, 'common.css'), baseline('common.css'));
    await fsp.rm(path.join(statusDir, release.cssName), { force: true });
    await fsp.rm(path.join(statusDir, release.jsName), { force: true });
    await fsp.writeFile(path.join(html, '.artifacts', 'reports', 'health-latest.json'), '{"detailed":true}');
    await fsp.writeFile(path.join(root, 'nginx.conf'), nginxConf(), { mode: 0o600 });
    const cachedJs = await fsp.readFile(path.join(statusDir, 'common.js'));
    assert.equal(custody.startsWith(html), false);

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
    assert.equal(liveness.headers['content-type'], 'application/json');
    assert.equal(liveness.body.toString('utf8'), '{"status":"ok"}');
    assert.match(String(liveness.headers['cache-control'] || ''), /no-store/);

    const owner = { cookie: 'dp_owner=1' };
    const before = await request(port, '/status/common.js', owner);
    assert.equal(before.status, 200);
    assert.equal(before.headers['content-type'], 'application/javascript');
    assert.ok(before.headers.etag);
    assert.deepEqual(before.body, cachedJs);
    const cached = await request(port, '/status/common.js', {
      ...owner,
      headers: { 'If-None-Match': before.headers.etag },
    });
    assert.equal(cached.status, 304);

    const oldHealth = await request(port, '/status/health.html', owner);
    assert.equal(oldHealth.status, 200);
    assert.equal(oldHealth.headers['content-type'], 'text/html');
    assert.match(oldHealth.body.toString('utf8'), /src="\/status\/common\.js"/);

    installRelease(statusDir, release, { custodyDir: custody, docroot: html });
    const names = await fsp.readdir(statusDir);
    assert.deepEqual(names.filter((entry) => entry.startsWith('.v216-')), []);
    const hidden = await request(port, '/status/.v216-preimage', owner);
    assert.equal(hidden.status, 404);
    const journal = await fsp.readFile(path.join(custody, 'journal.json'));
    const escape = await request(port, '/status/../custody/journal.json', owner);
    assert.equal(escape.body.equals(journal), false);

    const healthNew = await request(port, '/status/health.html', owner);
    const sharedCss = await request(port, `/status/${release.cssName}`, owner);
    const sharedJs = await request(port, `/status/${release.jsName}`, owner);
    assert.equal(healthNew.headers['content-type'], 'text/html');
    assert.equal(sharedCss.headers['content-type'], 'text/css');
    assert.equal(sharedJs.headers['content-type'], 'application/javascript');
    assert.match(healthNew.body.toString('utf8'), new RegExp(release.cssName));
    assert.doesNotMatch(healthNew.body.toString('utf8'), /src="\/status\/common\.js"/);
    const stillCached = await request(port, '/status/common.js', owner);
    assert.deepEqual(stillCached.body, cachedJs);
    const stillRevalidated = await request(port, '/status/common.js', {
      ...owner,
      headers: { 'If-None-Match': before.headers.etag },
    });
    assert.equal(stillRevalidated.status, 304);

    rollbackRelease(statusDir, custody, html);
    const restored = await request(port, '/status/health.html', owner);
    assert.deepEqual(restored.body, baseline('health.html'));
    assert.match(restored.body.toString('utf8'), /src="\/status\/common\.js"/);

    await fsp.rm(path.join(html, '.artifacts', 'reports', 'health-latest.json'));
    const unavailable = await request(port, '/health.json');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.toString('utf8'), '{"status":"unavailable"}');
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
