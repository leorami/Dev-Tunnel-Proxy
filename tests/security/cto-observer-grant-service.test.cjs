'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCtoObserverGrantStore } = require('../../utils/cto-observer-grant-service.cjs');

const SHA = '952aa2625990f8da60784a8c6a63759b47b43569';
const OTHER = '6a5e9aa8c1788961c1dc199f9cbca491ff26e65e';
const PRINCIPAL = 'chatgpt-work-cto-observer';
const manifest = Object.freeze(['/status/assets/logo.png']);

function storeAt(now) {
  return createCtoObserverGrantStore({ nowFn: () => now });
}

function issue(store, overrides = {}) {
  return store.issueGrant({
    ownerAuthenticated: true,
    trustedOriginOk: true,
    csrfOk: true,
    sourceSha: SHA,
    observerPrincipal: PRINCIPAL,
    ...overrides,
  });
}

test('issue requires owner auth, trusted origin, CSRF, exact SHA and principal', () => {
  const store = storeAt(1_000_000);
  assert.equal(issue(store, { ownerAuthenticated: false }).ok, false);
  assert.equal(issue(store, { trustedOriginOk: false }).code, 'ORIGIN_DENIED');
  assert.equal(issue(store, { csrfOk: false }).code, 'CSRF_DENIED');
  assert.equal(issue(store, { sourceSha: 'nope' }).code, 'SOURCE_SHA_INVALID');
  assert.equal(issue(store, { observerPrincipal: 'x' }).code, 'OBSERVER_PRINCIPAL_INVALID');
  assert.equal(issue(store, { ttlMs: 11 * 60 * 1000 }).code, 'TTL_INVALID');
  const ok = issue(store);
  assert.equal(ok.ok, true);
  assert.match(ok.redemptionToken, /^[a-f0-9]{64}$/);
  assert.equal(ok.audit.redeemed, false);
  assert.equal(Object.hasOwn(ok.audit, 'redemptionToken'), false);
});

test('redeem is one-use, principal-bound, and burns the secret', () => {
  const store = storeAt(1_000_000);
  const issued = issue(store);
  const first = store.redeemGrant({
    grantId: issued.audit.grantId,
    redemptionToken: issued.redemptionToken,
    observerPrincipal: PRINCIPAL,
  });
  assert.equal(first.ok, true);
  assert.match(first.sessionToken, /^[a-f0-9]{64}$/);
  const replay = store.redeemGrant({
    grantId: issued.audit.grantId,
    redemptionToken: issued.redemptionToken,
    observerPrincipal: PRINCIPAL,
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, 'REDEMPTION_DENIED');
});

test('redeem denies admin cookie/bearer reuse, wrong principal, expiry and revoke', () => {
  let now = 1_000_000;
  const store = createCtoObserverGrantStore({ nowFn: () => now });
  const issued = issue(store);
  assert.equal(store.redeemGrant({
    grantId: issued.audit.grantId,
    redemptionToken: issued.redemptionToken,
    observerPrincipal: PRINCIPAL,
    ownerAdminSessionPresent: true,
  }).ok, false);

  const issued2 = issue(store);
  assert.equal(store.redeemGrant({
    grantId: issued2.audit.grantId,
    redemptionToken: issued2.redemptionToken,
    observerPrincipal: 'other-principal',
  }).ok, false);

  const issued3 = issue(store);
  store.revokeGrant({
    ownerAuthenticated: true,
    trustedOriginOk: true,
    csrfOk: true,
    grantId: issued3.audit.grantId,
  });
  assert.equal(store.redeemGrant({
    grantId: issued3.audit.grantId,
    redemptionToken: issued3.redemptionToken,
    observerPrincipal: PRINCIPAL,
  }).ok, false);

  const issued4 = issue(store);
  now = 1_000_000 + 10 * 60 * 1000 + 1;
  assert.equal(store.redeemGrant({
    grantId: issued4.audit.grantId,
    redemptionToken: issued4.redemptionToken,
    observerPrincipal: PRINCIPAL,
  }).ok, false);
});

test('accessDecision allows pages/assets and denies writes, sensitive GET, source mismatch', () => {
  const store = storeAt(1_000_000);
  const issued = issue(store);
  const redeemed = store.redeemGrant({
    grantId: issued.audit.grantId,
    redemptionToken: issued.redemptionToken,
    observerPrincipal: PRINCIPAL,
  });
  const allow = store.accessDecision({
    sessionToken: redeemed.sessionToken,
    pathname: '/status',
    method: 'GET',
    sourceSha: SHA,
    exactStaticAssetManifest: manifest,
  });
  assert.equal(allow.allowed, true);
  assert.equal(store.accessDecision({
    sessionToken: redeemed.sessionToken,
    pathname: '/status',
    method: 'POST',
    sourceSha: SHA,
    exactStaticAssetManifest: manifest,
  }).allowed, false);
  assert.equal(store.accessDecision({
    sessionToken: redeemed.sessionToken,
    pathname: '/devproxy/api/ai/ask',
    method: 'GET',
    sourceSha: SHA,
    exactStaticAssetManifest: manifest,
  }).allowed, false);
  assert.equal(store.accessDecision({
    sessionToken: redeemed.sessionToken,
    pathname: '/status',
    method: 'GET',
    sourceSha: OTHER,
    exactStaticAssetManifest: manifest,
  }).allowed, false);
  assert.equal(store.accessDecision({
    sessionToken: redeemed.sessionToken,
    pathname: '/status/assets/logo.png',
    method: 'GET',
    sourceSha: SHA,
    exactStaticAssetManifest: manifest,
  }).allowed, true);
});
