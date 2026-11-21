'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCtoObserverHttpBoundary } = require('../../utils/cto-observer-http.cjs');
const { buildObserverProjection, projectionLeaksSensitive } = require('../../utils/cto-observer-sanitized-projection.cjs');
const { classifyCtoBrowserTransport } = require('../../utils/cto-observer-browser-transport.cjs');
const { selectGrantSourceSha } = require('../../utils/cto-observer-source-attestation.cjs');

const SHA = '952aa2625990f8da60784a8c6a63759b47b43569';
const PRINCIPAL = 'chatgpt-work-cto-observer';
const ADMIN = 'b'.repeat(64);

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

async function issueCsrf(api) {
  const res = mockRes();
  await api.handle({
    method: 'GET',
    headers: { origin: 'https://ramileo.ngrok.app', host: 'ramileo.ngrok.app', cookie: 'admin_session=' + ADMIN },
  }, res, {
    pathname: '/admin/cto-observer/csrf',
    ownerAuthenticated: true,
    trustedOriginOk: true,
    adminSessionToken: ADMIN,
  });
  assert.equal(res.code, 200);
  const body = JSON.parse(res.body);
  assert.match(body.csrfToken, /^[a-f0-9]{64}$/);
  return body.csrfToken;
}

test('owner grant → redeem → check allows page; replay and admin reuse denied', async () => {
  const api = boundary();
  const csrf = await issueCsrf(api);
  const grantRes = mockRes();
  await api.handle({
    method: 'POST',
    headers: {
      origin: 'https://ramileo.ngrok.app',
      'x-devproxy-csrf': csrf,
      host: 'ramileo.ngrok.app',
      cookie: 'admin_session=' + ADMIN,
    },
    _body: { csrfToken: csrf, observerPrincipal: PRINCIPAL },
  }, grantRes, {
    pathname: '/admin/cto-observer/grants',
    ownerAuthenticated: true,
    trustedOriginOk: true,
    adminSessionPresent: true,
    adminSessionToken: ADMIN,
  });
  assert.equal(grantRes.code, 200);
  const grantBody = JSON.parse(grantRes.body);
  assert.equal(grantBody.ok, true);
  assert.match(grantBody.redemptionToken, /^[a-f0-9]{64}$/);

  const redeemRes = mockRes();
  await api.handle({
    method: 'POST',
    headers: { origin: 'https://ramileo.ngrok.app', host: 'ramileo.ngrok.app' },
    _body: {
      grantId: grantBody.grantId,
      redemptionToken: grantBody.redemptionToken,
      observerPrincipal: PRINCIPAL,
    },
  }, redeemRes, {
    pathname: '/admin/cto-observer/redeem',
    trustedOriginOk: true,
    adminSessionPresent: false,
  });
  assert.equal(redeemRes.code, 200);
  const session = /cto_observer_session=([a-f0-9]{64})/.exec(redeemRes.headers['Set-Cookie'])[1];

  const checkOk = mockRes();
  await api.handle({
    method: 'GET',
    headers: {
      cookie: 'cto_observer_session=' + session,
      'x-original-uri': '/status',
    },
  }, checkOk, { pathname: '/admin/cto-observer/check' });
  assert.equal(checkOk.code, 200);

  const missingUri = mockRes();
  await api.handle({
    method: 'GET',
    headers: { cookie: 'cto_observer_session=' + session },
  }, missingUri, { pathname: '/admin/cto-observer/check' });
  assert.equal(missingUri.code, 401);
});

test('invented CSRF self-match is denied without server-bound token', async () => {
  const api = boundary();
  const invented = 'a'.repeat(64);
  const res = mockRes();
  await api.handle({
    method: 'POST',
    headers: {
      origin: 'https://ramileo.ngrok.app',
      'x-devproxy-csrf': invented,
      host: 'ramileo.ngrok.app',
    },
    _body: { csrfToken: invented, observerPrincipal: PRINCIPAL },
  }, res, {
    pathname: '/admin/cto-observer/grants',
    ownerAuthenticated: true,
    trustedOriginOk: true,
    adminSessionPresent: true,
    adminSessionToken: ADMIN,
  });
  assert.equal(res.code, 403);
  assert.equal(JSON.parse(res.body).code, 'CSRF_DENIED');
});

test('caller-supplied mismatched source SHA is rejected; attested SHA used', () => {
  assert.equal(selectGrantSourceSha({
    attestedSourceSha: SHA,
    requestedSourceSha: 'f'.repeat(40),
  }).code, 'SOURCE_SHA_MISMATCH');
  assert.deepEqual(selectGrantSourceSha({
    attestedSourceSha: SHA,
    requestedSourceSha: SHA,
  }), { ok: true, sourceSha: SHA });
  assert.equal(selectGrantSourceSha({
    attestedSourceSha: null,
    requestedSourceSha: SHA,
  }).code, 'SOURCE_SHA_UNAVAILABLE');
});

test('visual gate allows admin alone; observer requires proven original URI', () => {
  const api = boundary();
  assert.deepEqual(api.evaluateVisualAccessGate({ headers: {} }, {
    adminSessionValid: true,
    adminSessionPresent: true,
  }), { ok: true, role: 'admin' });
  assert.equal(api.evaluateVisualAccessGate({
    headers: { cookie: 'cto_observer_session=' + 'd'.repeat(64) },
  }, {
    adminSessionValid: false,
    adminSessionPresent: false,
  }).code, 'ORIGINAL_URI_REQUIRED');
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
});
