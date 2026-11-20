'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCtoObserverHttpBoundary } = require('../../utils/cto-observer-http.cjs');
const { buildObserverProjection, projectionLeaksSensitive } = require('../../utils/cto-observer-sanitized-projection.cjs');
const { classifyCtoBrowserTransport } = require('../../utils/cto-observer-browser-transport.cjs');

const SHA = '952aa2625990f8da60784a8c6a63759b47b43569';
const PRINCIPAL = 'chatgpt-work-cto-observer';
const CSRF = 'a'.repeat(32);

function mockRes() {
  return {
    code: null,
    headers: null,
    body: null,
    writeHead(code, headers) { this.code = code; this.headers = headers; },
    end(body) { this.body = typeof body === 'string' ? body : String(body); },
  };
}

function boundary() {
  return createCtoObserverHttpBoundary({
    getSourceSha: () => SHA,
    getAssetManifest: () => Object.freeze([
      '/status/assets/logo.png',
      '/status/assets/site.css',
      '/dashboard/assets/app.js',
    ]),
    parseBody: async (req) => req._body || {},
    send: (res, code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    },
  });
}

function ownerReq(body = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://ramileo.ngrok.app',
      'x-devproxy-csrf': CSRF,
      host: 'ramileo.ngrok.app',
      cookie: 'admin_session=' + 'b'.repeat(64),
    },
    _body: { csrfToken: CSRF, observerPrincipal: PRINCIPAL, sourceSha: SHA, ...body },
  };
}

test('owner grant → redeem → check allows page; replay and admin reuse denied', async () => {
  const api = boundary();
  const grantRes = mockRes();
  await api.handle(ownerReq(), grantRes, {
    pathname: '/admin/cto-observer/grants',
    ownerAuthenticated: true,
    trustedOriginOk: true,
    adminSessionPresent: true,
  });
  assert.equal(grantRes.code, 200);
  const grantBody = JSON.parse(grantRes.body);
  assert.equal(grantBody.ok, true);
  assert.match(grantBody.redemptionToken, /^[a-f0-9]{64}$/);

  const redeemRes = mockRes();
  await api.handle({
    method: 'POST',
    headers: {
      origin: 'https://ramileo.ngrok.app',
      'x-devproxy-csrf': CSRF,
      host: 'ramileo.ngrok.app',
    },
    _body: {
      csrfToken: CSRF,
      grantId: grantBody.grantId,
      redemptionToken: grantBody.redemptionToken,
      observerPrincipal: PRINCIPAL,
    },
  }, redeemRes, {
    pathname: '/admin/cto-observer/redeem',
    ownerAuthenticated: false,
    trustedOriginOk: true,
    adminSessionPresent: false,
  });
  assert.equal(redeemRes.code, 200);
  assert.match(redeemRes.headers['Set-Cookie'], /cto_observer_session=[a-f0-9]{64}/);
  assert.doesNotMatch(redeemRes.headers['Set-Cookie'], /admin_session=/);
  const session = /cto_observer_session=([a-f0-9]{64})/.exec(redeemRes.headers['Set-Cookie'])[1];

  const replay = mockRes();
  await api.handle({
    method: 'POST',
    headers: {
      origin: 'https://ramileo.ngrok.app',
      'x-devproxy-csrf': CSRF,
      host: 'ramileo.ngrok.app',
    },
    _body: {
      csrfToken: CSRF,
      grantId: grantBody.grantId,
      redemptionToken: grantBody.redemptionToken,
      observerPrincipal: PRINCIPAL,
    },
  }, replay, {
    pathname: '/admin/cto-observer/redeem',
    trustedOriginOk: true,
  });
  assert.equal(replay.code, 401);

  const checkOk = mockRes();
  await api.handle({
    method: 'GET',
    headers: {
      cookie: 'cto_observer_session=' + session,
      'x-original-uri': '/status',
    },
  }, checkOk, { pathname: '/admin/cto-observer/check' });
  assert.equal(checkOk.code, 200);

  const checkAdminReuse = mockRes();
  await api.handle({
    method: 'GET',
    headers: {
      cookie: 'cto_observer_session=' + session + '; admin_session=' + 'c'.repeat(64),
      'x-original-uri': '/status',
    },
  }, checkAdminReuse, {
    pathname: '/admin/cto-observer/check',
    adminSessionPresent: true,
  });
  assert.equal(checkAdminReuse.code, 401);

  for (const badPath of ['/devproxy/api/ai/ask', '/routes.json', '/admin/check', '/status.json']) {
    const denied = mockRes();
    await api.handle({
      method: 'GET',
      headers: {
        cookie: 'cto_observer_session=' + session,
        'x-original-uri': badPath,
      },
    }, denied, { pathname: '/admin/cto-observer/check' });
    assert.equal(denied.code, 401, badPath);
  }
});

test('CSRF and origin mismatches deny grant issuance', async () => {
  const api = boundary();
  const res = mockRes();
  await api.handle({
    method: 'POST',
    headers: { 'x-devproxy-csrf': CSRF, host: 'ramileo.ngrok.app' },
    _body: { csrfToken: 'b'.repeat(32), observerPrincipal: PRINCIPAL, sourceSha: SHA },
  }, res, {
    pathname: '/admin/cto-observer/grants',
    ownerAuthenticated: true,
    trustedOriginOk: true,
  });
  assert.equal(res.code, 403);
  assert.equal(JSON.parse(res.body).code, 'CSRF_DENIED');

  const res2 = mockRes();
  await api.handle(ownerReq(), res2, {
    pathname: '/admin/cto-observer/grants',
    ownerAuthenticated: true,
    trustedOriginOk: false,
  });
  assert.equal(res2.code, 403);
});

test('visual gate allows admin alone or observer alone, never mixed credentials', () => {
  const api = boundary();
  assert.deepEqual(api.evaluateVisualAccessGate({ headers: {} }, {
    adminSessionValid: true,
    adminSessionPresent: true,
  }), { ok: true, role: 'admin' });
  assert.equal(api.evaluateVisualAccessGate({
    headers: { cookie: 'cto_observer_session=' + 'd'.repeat(64) },
  }, {
    adminSessionValid: true,
    adminSessionPresent: true,
  }).ok, false);
});

test('sanitized projection drops private fields and fails closed on leaks', () => {
  const built = buildObserverProjection({
    page: 'status',
    sourceSha: SHA,
    routeCountPublic: 3,
    publicHealthOk: true,
    generatedAtMs: 1000,
    adminPassword: 'nope',
    privatePath: '/Users/secret',
  });
  assert.equal(built.ok, true);
  assert.equal(projectionLeaksSensitive(built.projection), false);
  assert.equal(Object.hasOwn(built.projection, 'adminPassword'), false);
  assert.equal(buildObserverProjection({
    page: 'status',
    sourceSha: SHA,
    routeCountPublic: -1,
    publicHealthOk: true,
    generatedAtMs: 1000,
  }).ok, false);
});

test('browser transport truth gate remains blocked without ChatGPT-inline PNG path', () => {
  const blocked = classifyCtoBrowserTransport({
    chatgptWorkCloudBrowserCallable: false,
    devProxyObserverPluginCallable: false,
    canRetrieveOriginalPngBytes: false,
    deliversInlineToOwnerChatgpt: false,
    cursorIdeBrowserPresent: true,
  });
  assert.equal(blocked.code, 'BLOCKED_CTO_BROWSER_TRANSPORT');
  assert.equal(blocked.uiApproval, 'UI_APPROVAL_WITHHELD');
  const ready = classifyCtoBrowserTransport({
    chatgptWorkCloudBrowserCallable: true,
    devProxyObserverPluginCallable: false,
    canRetrieveOriginalPngBytes: true,
    deliversInlineToOwnerChatgpt: true,
  });
  assert.equal(ready.code, 'CTO_BROWSER_TRANSPORT_READY');
});
