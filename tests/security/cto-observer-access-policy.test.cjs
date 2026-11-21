'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {evaluateObserverAccess} = require('../../utils/cto-observer-access-policy.cjs');
const SHA = '6a5e9aa8c1788961c1dc199f9cbca491ff26e65e';
const now = 1000000;
const grant = Object.freeze({
  audience: 'devproxy-cto-observer',
  scope: 'visual-readonly',
  ownerApproved: true,
  sessionValidatedByServer: true,
  revoked: false,
  issuedAtMs: now - 120000,
  expiresAtMs: now + 480000,
  sourceSha: SHA,
});
const manifest = Object.freeze([
  '/status/assets/logo.png',
  '/status/assets/site.css',
  '/status/assets/logo.svg',
  '/status/common.css',
  '/status/common.js',
  '/dashboard/assets/app.js',
]);
const access = (overrides={}) => evaluateObserverAccess({
  method: 'GET', pathname: '/status', grant, nowMs: now,
  sourceSha: SHA, exactStaticAssetManifest: manifest,
  ...overrides,
});

test('DENY by default without a server-validated, owner-approved scoped observation session', () => {
  assert.equal(access({grant: null}).allowed,false);
  assert.equal(access({grant: {...grant,sessionValidatedByServer:false}}).allowed,false);
  assert.equal(access({grant: {...grant,ownerApproved:false}}).allowed,false);
  assert.equal(access({grant: {...grant,scope:'admin'}}).allowed,false);
  assert.equal(access({grant: {...grant,audience:'other'}}).allowed,false);
  assert.equal(access({grant: {...grant,revoked:true}}).allowed,false);
});

test('REFUSE expired, unbounded, malformed, and source-mismatched grants', () => {
  assert.equal(access({grant: {...grant,expiresAtMs: now}}).allowed,false);
  assert.equal(access({grant: {...grant,expiresAtMs: now + 900000}}).allowed,false);
  assert.equal(access({grant: {...grant,issuedAtMs: now + 1}}).allowed,false);
  assert.equal(access({grant: {...grant,sourceSha:'f'.repeat(40)}}).allowed,false);
  assert.equal(access({sourceSha:'f'.repeat(40)}).allowed,false);
});

test('ALLOW only explicit read-only rendered page routes', () => {
  for(const pathname of ['/status','/status/','/health','/health/','/reports','/reports/','/dashboard','/dashboard/',
    '/observer/status','/observer/health.html','/observer/reports','/observer/dashboard.html']) {
    assert.deepEqual(access({pathname}),{allowed:true,classification:'page'},pathname);
  }
});

test('ALLOW only exact source-allowlisted inert assets, no wildcard asset grants', () => {
  assert.deepEqual(access({pathname:'/status/assets/logo.png'}),{allowed:true,classification:'asset'});
  assert.deepEqual(access({pathname:'/dashboard/assets/app.js'}),{allowed:true,classification:'asset'});
  assert.deepEqual(access({pathname:'/status/assets/logo.svg'}),{allowed:true,classification:'asset'});
  assert.deepEqual(access({pathname:'/status/common.css'}),{allowed:true,classification:'asset'});
  assert.equal(access({pathname:'/status/assets/secrets.json'}).allowed,false);
  assert.equal(access({pathname:'/status/assets/random.js'}).allowed,false);
  assert.equal(access({pathname:'/status/common.css',exactStaticAssetManifest:[]}).allowed,false);
  assert.equal(access({pathname:'/status/secret.json',exactStaticAssetManifest:['/status/secret.json']}).allowed,false);
});

test('DENY mutations, configuration, AI actions, admin endpoints and private JSON even with a valid grant', () => {
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])
    assert.equal(access({method}).allowed,false,method);
  for(const pathname of ['/admin/check','/admin/login','/config','/routes.json','/status.json',
    '/devproxy/api/ai/ask','/devproxy/api/apps/reload','/devproxy/api/reports/',
    '/.artifacts/calliope/healing-log.json','/dashboard/private.json',
    '/dashboard/index.html','/status/assets/unknown.png'])
    assert.equal(access({pathname}).allowed,false,pathname);
});

test('DENY ambiguous URL serialization and owner admin-cookie/bearer credential reuse', () => {
  for(const pathname of ['/status?x=1','/status#frag','/status%2f..%2fadmin',
    '/status/../admin', '/status\\admin','//status','/status\u0000', '/status//'])
    assert.equal(access({pathname}).allowed,false,JSON.stringify(pathname));
  assert.equal(access({ownerAdminSessionPresent:true}).allowed,false);
  assert.equal(access({adminAuthorizationHeaderPresent:true}).allowed,false);
});

test('Observation never escalates to unscoped API access or a live browser PASS flag', () => {
  const result=access();
  assert.equal(Object.hasOwn(result,'ownerUatPassed'),false);
  assert.equal(Object.hasOwn(result,'canMutate'),false);
  assert.equal(access({pathname:'/devproxy/observer/snapshot/status'}).allowed,false);
});
