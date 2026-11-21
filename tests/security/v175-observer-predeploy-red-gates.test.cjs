'use strict';
/**
 * V175 CTO RED-first predeployment regression contracts.
 * Pinned parent: PR #183 @ edb362d56eee9bb9a12b0945b1f59a258435412e.
 * These are INTENTIONALLY RED on that return; do not soften the assertions.
 * No network, owner host, browser, credentials or production mutations.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createCtoObserverHttpBoundary} = require('../../utils/cto-observer-http.cjs');
const {createCtoObserverGrantStore} = require('../../utils/cto-observer-grant-service.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SHA = '952aa2625990f8da60784a8c6a63759b47b43569';
const OTHER_SHA = 'f'.repeat(40);
const PRINCIPAL = 'chatgpt-work-cto-observer';

function config(name) {return fs.readFileSync(path.join(ROOT, 'config', name), 'utf8');}
function nginxBlock(src, declaration) {
  const start = src.indexOf(declaration + ' {');
  if(start < 0) return null;
  const open = src.indexOf('{', start);
  let depth = 1;
  for(let i = open + 1; i < src.length; i++) {
    if(src[i] === '{') depth++;
    else if(src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}
function res() {
  return {code: 0, body: '', writeHead(c) {this.code=c;}, end(b) {this.body=String(b || '');}};
}
function boundary(extra = {}) {
  return createCtoObserverHttpBoundary({
    getSourceSha: () => SHA, getAssetManifest: () => [],
    parseBody: async (req) => req._body || {},
    send: (out,code,data) => {out.writeHead(code, {'content-type':'application/json'});out.end(JSON.stringify(data));},
    ...extra,
  });
}

test('P0: BOTH Nginx candidates preserve V172 four ^~ auth-prefix protections', () => {
  for(const name of ['default.conf', 'default.production.conf']) {
    const source = config(name);
    for(const page of ['status','reports','health','dashboard']) {
      const b=nginxBlock(source, 'location ^~ /' + page);
      assert.ok(b, name + ' must preserve V172 ^~ /' + page);
      assert.match(b, /auth_request\s+\/admin\/visual-access-check;/,
        name + ': ' + page + ' retains dual auth inside strong prefix');
    }
  }
});

test('P0: dual visual auth subrequest is internal-only in both Nginx configs', () => {
  for(const name of ['default.conf', 'default.production.conf']) {
    const b=nginxBlock(config(name), 'location = /admin/visual-access-check');
    assert.ok(b, name + ' must provide the auth check');
    assert.match(b, /\binternal\s*;/, name + ' must prevent public direct invocation');
  }
});

test('P1: observer sanitized projection must have an authenticated Nginx forwarding route', () => {
  for(const name of ['default.conf', 'default.production.conf']) {
    const source=config(name);
    assert.match(source,
      /location\s+(?:\^~\s+)?\/admin\/cto-observer\/projection\//,
      name + ' must expose a dedicated, read-only, observer-gated projection route');
  }
});

test('P1: grant issuance must reject caller-supplied source SHA != attested runtime SHA', async () => {
  const api=boundary();
  const response=res();
  const arbitraryCsrf='a'.repeat(32);
  await api.handle({
    method:'POST',
    headers:{origin:'https://example.invalid','x-devproxy-csrf':arbitraryCsrf,host:'example.invalid'},
    _body:{
      csrfToken:arbitraryCsrf, observerPrincipal:PRINCIPAL,
      sourceSha:OTHER_SHA,
    },
  }, response, {
    pathname:'/admin/cto-observer/grants',
    ownerAuthenticated:true, trustedOriginOk:true,
    adminSessionPresent:true,
  });
  assert.notEqual(response.code, 200, 'grant must never issue for mismatched source SHA');
});

test('P0: missing original requested URI must DENY, never default to /status', () => {
  const now=1_000_000;
  const store=createCtoObserverGrantStore({nowFn:()=>now});
  const grant=store.issueGrant({
    ownerAuthenticated:true,trustedOriginOk:true,csrfOk:true,
    sourceSha:SHA,observerPrincipal:PRINCIPAL,
  });
  assert.equal(grant.ok,true);
  const redeemed=store.redeemGrant({
    grantId:grant.audit.grantId,redemptionToken:grant.redemptionToken,
    observerPrincipal:PRINCIPAL,
  });
  assert.equal(redeemed.ok,true);
  const api=boundary({store});
  const decision=api.evaluateVisualAccessGate({
    method:'GET',
    headers:{cookie:'cto_observer_session='+redeemed.sessionToken},
    // No X-Original-URI; app must fail closed rather than invent '/status'.
  }, {adminSessionValid:false,adminSessionPresent:false,adminBearerPresent:false});
  assert.equal(decision.ok,false,'missing original URI must NOT authorize an observer');
});
