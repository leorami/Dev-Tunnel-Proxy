'use strict';
/**
 * #154 RED→GREEN: POST /devproxy/api/apps/create-route must not treat
 * omitted install as an install attempt. Default is preview / no mutation.
 * Pure helper + authenticated in-process API path with stub manager only.
 * No Docker, live proxy, credentials, bridge, worker, or HMAC changes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const helperPath = path.join(ROOT, 'utils', 'create-route-install-intent.cjs');
const apiPath = path.join(ROOT, 'utils', 'proxyConfigAPI.js');
const dashboardPath = path.join(ROOT, 'dashboard', 'public', 'index.html');

const ADMIN_PASSWORD = 'v154-test-admin-password-32b';
const TRUSTED_ORIGIN = 'http://127.0.0.1:18080';

function loadHelper() {
  assert.equal(fs.existsSync(helperPath), true, 'utils/create-route-install-intent.cjs missing');
  return require(helperPath);
}

test('helper module exists for create-route install intent', () => {
  assert.equal(fs.existsSync(helperPath), true, 'utils/create-route-install-intent.cjs missing');
});

test('pure: omitted install defaults to no install', () => {
  const { decideCreateRouteInstall } = loadHelper();
  assert.deepEqual(decideCreateRouteInstall({ name: 'a', basePath: '/a/', upstream: 'http://127.0.0.1:9' }), {
    ok: true,
    install: false,
  });
  assert.deepEqual(
    decideCreateRouteInstall({
      name: 'a',
      basePath: '/a/',
      upstream: 'http://127.0.0.1:9',
      options: { websockets: true },
    }),
    { ok: true, install: false }
  );
});

test('pure: top-level boolean install is honored', () => {
  const { decideCreateRouteInstall } = loadHelper();
  assert.equal(decideCreateRouteInstall({ install: false }).install, false);
  assert.equal(decideCreateRouteInstall({ install: true }).install, true);
});

test('pure: nested options.install boolean is honored (dashboard Preview/Create)', () => {
  const { decideCreateRouteInstall } = loadHelper();
  assert.equal(decideCreateRouteInstall({ options: { install: false } }).install, false);
  assert.equal(decideCreateRouteInstall({ options: { install: true } }).install, true);
});

test('pure: agreeing top-level and nested booleans succeed', () => {
  const { decideCreateRouteInstall } = loadHelper();
  assert.equal(decideCreateRouteInstall({ install: true, options: { install: true } }).install, true);
  assert.equal(decideCreateRouteInstall({ install: false, options: { install: false } }).install, false);
});

test('pure: conflicting booleans and nonbooleans fail closed', () => {
  const { decideCreateRouteInstall } = loadHelper();
  const conflict = decideCreateRouteInstall({ install: true, options: { install: false } });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 400);
  const badTop = decideCreateRouteInstall({ install: 'yes' });
  assert.equal(badTop.ok, false);
  assert.equal(badTop.status, 400);
  const badNested = decideCreateRouteInstall({ options: { install: 1 } });
  assert.equal(badNested.ok, false);
  assert.equal(badNested.status, 400);
});

test('pure: malformed request objects fail closed', () => {
  const { decideCreateRouteInstall } = loadHelper();
  for (const bad of [null, undefined, 'x', 3, [], true]) {
    const out = decideCreateRouteInstall(bad);
    assert.equal(out.ok, false, `expected reject for ${String(bad)}`);
    assert.equal(out.status, 400);
  }
  const badOptions = decideCreateRouteInstall({ options: 'nope' });
  assert.equal(badOptions.ok, false);
  assert.equal(badOptions.status, 400);
});

test('source: create-route uses decideCreateRouteInstall; old default-true gone', () => {
  const src = fs.readFileSync(apiPath, 'latin1');
  const start = src.indexOf("apiPath('apps/create-route')");
  assert.ok(start > 0);
  const branch = src.slice(start, start + 2200);
  assert.match(branch, /decideCreateRouteInstall\s*\(/);
  assert.doesNotMatch(branch, /options\.install\s*!==\s*false/);
  assert.match(fs.readFileSync(apiPath, 'latin1'), /create-route-install-intent\.cjs/);
});

test('source: dashboard Preview nests options.install false; Create nests checkbox', () => {
  const html = fs.readFileSync(dashboardPath, 'utf8');
  assert.match(html, /function collectRoutePayload\(installFlag\)/);
  assert.match(html, /install:\s*installFlag/);
  assert.match(html, /collectRoutePayload\(false\)/);
  assert.match(html, /collectRoutePayload\(installFlag\)/);
});

async function withApiHarness(fn) {
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.DEVPROXY_TRUSTED_ORIGINS = TRUSTED_ORIGIN;
  process.env.PROXY_API_BASE_PATH = '/devproxy/api';
  process.env.NODE_ENV = 'test'; // required before module import for test-only setter
  // Fresh load so TRUSTED_ORIGINS / password bind from this harness env.
  for (const rel of ['../../utils/proxyConfigAPI.js', '../../utils/create-route-install-intent.cjs']) {
    try {
      delete require.cache[require.resolve(rel)];
    } catch {
      /* module may be absent during RED */
    }
  }
  const api = require('../../utils/proxyConfigAPI.js');
  assert.equal(typeof api.handle, 'function', 'proxyConfigAPI must export handle for in-process tests');
  assert.equal(
    typeof api.__setRouteMutationServiceForTests,
    'function',
    'proxyConfigAPI must export stub mutation-manager hook for tests'
  );

  const installs = [];
  api.__setRouteMutationServiceForTests({
    async install(name, content) {
      installs.push({ name, content });
      const filename = String(name).replace(/\.conf$/i, '') + '.conf';
      return { ok: true, httpStatus: 200, filename };
    },
  });

  const server = http.createServer((req, res) => {
    Promise.resolve(api.handle(req, res)).catch((err) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err && err.message) }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    await fn({ port, installs, api });
  } finally {
    api.__setRouteMutationServiceForTests(null);
    await new Promise((r) => server.close(r));
  }
}

function request(port, { method, urlPath, body, headers }) {
  const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
          accept: 'application/json',
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': payload.length }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            raw,
            json,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(port) {
  const res = await request(port, {
    method: 'POST',
    urlPath: '/admin/login',
    body: { password: ADMIN_PASSWORD },
    headers: { origin: TRUSTED_ORIGIN },
  });
  assert.equal(res.status, 200, `login failed: ${res.raw}`);
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie && setCookie.length, 'missing session cookie');
  const cookie = String(setCookie[0]).split(';')[0];
  return cookie;
}

const baseRoute = {
  name: 'v154preview',
  basePath: '/v154preview/',
  upstream: 'http://127.0.0.1:3999',
};

test('API: omitted install never calls manager.install (authenticated)', async () => {
  await withApiHarness(async ({ port, installs }) => {
    const cookie = await login(port);
    const res = await request(port, {
      method: 'POST',
      urlPath: '/devproxy/api/apps/create-route',
      body: { ...baseRoute },
      headers: { origin: TRUSTED_ORIGIN, cookie },
    });
    assert.equal(res.status, 200, res.raw);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.installed, null);
    assert.equal(installs.length, 0);
  });
});

test('API: top-level install:false and nested options.install:false never install', async () => {
  await withApiHarness(async ({ port, installs }) => {
    const cookie = await login(port);
    for (const body of [
      { ...baseRoute, install: false },
      { ...baseRoute, options: { install: false, websockets: true } },
    ]) {
      const before = installs.length;
      const res = await request(port, {
        method: 'POST',
        urlPath: '/devproxy/api/apps/create-route',
        body,
        headers: { origin: TRUSTED_ORIGIN, cookie },
      });
      assert.equal(res.status, 200, res.raw);
      assert.equal(res.json.installed, null);
      assert.equal(installs.length, before);
    }
  });
});

test('API: explicit install true reaches stub manager only after auth/Origin', async () => {
  await withApiHarness(async ({ port, installs }) => {
    const cookie = await login(port);
    const res = await request(port, {
      method: 'POST',
      urlPath: '/devproxy/api/apps/create-route',
      body: { ...baseRoute, options: { install: true } },
      headers: { origin: TRUSTED_ORIGIN, cookie },
    });
    assert.equal(res.status, 200, res.raw);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.installed, 'v154preview.conf');
    assert.equal(installs.length, 1);
    assert.match(installs[0].content, /location/);
  });
});

test('API: conflicting / nonboolean install intent is bounded 400 and never mutates', async () => {
  await withApiHarness(async ({ port, installs }) => {
    const cookie = await login(port);
    for (const body of [
      { ...baseRoute, install: true, options: { install: false } },
      { ...baseRoute, install: 'yes' },
      { ...baseRoute, options: { install: 'no' } },
    ]) {
      const before = installs.length;
      const res = await request(port, {
        method: 'POST',
        urlPath: '/devproxy/api/apps/create-route',
        body,
        headers: { origin: TRUSTED_ORIGIN, cookie },
      });
      assert.equal(res.status, 400, res.raw);
      assert.equal(res.json.ok, false);
      assert.equal(installs.length, before);
    }
  });
});

test('API: unauthenticated and forged-Origin attempts do not mutate', async () => {
  await withApiHarness(async ({ port, installs }) => {
    const unauth = await request(port, {
      method: 'POST',
      urlPath: '/devproxy/api/apps/create-route',
      body: { ...baseRoute, options: { install: true } },
      headers: { origin: TRUSTED_ORIGIN },
    });
    assert.equal(unauth.status, 401);
    assert.equal(installs.length, 0);

    const cookie = await login(port);
    const forged = await request(port, {
      method: 'POST',
      urlPath: '/devproxy/api/apps/create-route',
      body: { ...baseRoute, options: { install: true } },
      headers: { origin: 'http://evil.example', cookie },
    });
    assert.equal(forged.status, 403);
    assert.equal(installs.length, 0);
  });
});

test('export fence: production NODE_ENV does not expose route-manager test setter', () => {
  const script = `
    'use strict';
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_PASSWORD = ${JSON.stringify(ADMIN_PASSWORD)};
    process.env.DEVPROXY_TRUSTED_ORIGINS = ${JSON.stringify(TRUSTED_ORIGIN)};
    process.env.PROXY_API_BASE_PATH = '/devproxy/api';
    const api = require(${JSON.stringify(apiPath)});
    if (typeof api.__setRouteMutationServiceForTests !== 'undefined') {
      console.error('LEAK');
      process.exit(2);
    }
    if (typeof api.handle !== 'function' || typeof api.decideCreateRouteInstall !== 'function') {
      console.error('MISSING_PUBLIC');
      process.exit(3);
    }
    console.log('FENCED');
  `;
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 0, `production export fence failed: status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(r.stdout, /FENCED/);
});

test('export fence: test NODE_ENV exposes setter only after fresh import', () => {
  const script = `
    'use strict';
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_PASSWORD = ${JSON.stringify(ADMIN_PASSWORD)};
    process.env.DEVPROXY_TRUSTED_ORIGINS = ${JSON.stringify(TRUSTED_ORIGIN)};
    process.env.PROXY_API_BASE_PATH = '/devproxy/api';
    const api = require(${JSON.stringify(apiPath)});
    if (typeof api.__setRouteMutationServiceForTests !== 'function') {
      console.error('MISSING_SETTER');
      process.exit(2);
    }
    console.log('TEST_OK');
  `;
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 0, `test export fence failed: status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  assert.match(r.stdout, /TEST_OK/);
});
