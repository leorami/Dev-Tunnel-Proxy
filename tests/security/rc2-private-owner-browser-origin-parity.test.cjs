'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessPrivateOwnerBrowserOriginParity:check}=require('../../utils/rc2-private-owner-browser-origin-parity.cjs');
const HTTPS='https://private-owner-gateway.example.ngrok.app';
const LOCAL=['http://127.0.0.1:8080','http://localhost:8080'];
const input=()=>({protocol:'DEVPROXY_RC2_PRIVATE_BROWSER_ORIGINS_V1',
 approvedBrowserOrigins:[...LOCAL,HTTPS],configuredOrigins:[...LOCAL,HTTPS],
 remoteHttpsBrowserExpected:true});
test('RED: exact three-origin owner browser parity is review-only, never execution authority',()=>{
 const r=check(input());
 assert.deepEqual(r,{code:'BROWSER_ORIGIN_PARITY_REVIEW_ONLY',
  coverageVerified:true,productionChangeAuthorized:false,
  liveBrowserVerified:false,deployed:false,ownerUatApproved:false});
 assert.equal(JSON.stringify(r).includes('private-owner-gateway'),false);
});
test('RED: actual reported Owner-A localhost-only origins must block approved HTTPS login',()=>{
 const x=input();x.configuredOrigins=[...LOCAL];const r=check(x);
 assert.equal(r.code,'OWNER_HTTPS_BROWSER_ORIGIN_MISSING');
 assert.equal(r.coverageVerified,false);
});
test('RED: never trust incoming client Origin as evidence of configured server allowlist',()=>{
 const x=input();x.configuredOrigins=[...LOCAL];x.clientOrigin=HTTPS;
 assert.equal(check(x).coverageVerified,false);
});
test('RED: deny all-https requirements absent an operator-approved exact HTTPS origin',()=>{
 const x=input();x.approvedBrowserOrigins=[...LOCAL];
 assert.equal(check(x).coverageVerified,false);
});
test('RED: reject unapproved extra HTTPS or wildcard even if expected HTTPS exists',()=>{
 for(const extra of ['https://unapproved.example.net','*','https://*.ngrok.app']){
  const x=input();x.configuredOrigins.push(extra);
  assert.equal(check(x).coverageVerified,false);
 }
});
test('RED: order of strictly approved origins cannot impact parity',()=>{
 const x=input();x.configuredOrigins.reverse();
 assert.equal(check(x).coverageVerified,true);
});
test('RED: reject duplicates, hidden path, credentials, fragments, query and port drift',()=>{
 for(const invalid of [HTTPS,HTTPS+'/login', 'https://user:pass@private-owner-gateway.example.ngrok.app',
  HTTPS+'?return=1', HTTPS+'#fragment', 'https://private-owner-gateway.example.ngrok.app:8443']){
  const x=input();x.configuredOrigins.push(invalid);
  assert.equal(check(x).coverageVerified,false);
 }
});
test('RED: deny spoofed http public hostname instead of https',()=>{
 const x=input();x.configuredOrigins=[...LOCAL,HTTPS.replace('https:','http:')];
 assert.equal(check(x).coverageVerified,false);
});
test('RED: deny no remote target despite remote-expected=true',()=>{
 const x=input();x.remoteHttpsBrowserExpected=false;
 assert.equal(check(x).coverageVerified,false);
});
test('RED: reject private owner evidence containing shell, generated network and redacted secret fields',()=>{
 const x=input();x.operatorToken='DO_NOT_ECHO';
 const r=check(x);assert.equal(r.coverageVerified,false);
 assert.equal(JSON.stringify(r).includes('DO_NOT_ECHO'),false);
});
test('RED: booleans and arrays cannot masquerade as an attestation',()=>{
 for(const x of [null,{},false,[],3,'',undefined]){
  assert.equal(check(x).coverageVerified,false);
 }
});
test('RED: reject getters or prototype substitutions without disclosing private hostnames',()=>{
 const x=input();Object.defineProperty(x,'configuredOrigins',{get(){throw Error('SECRET_URL')},enumerable:true});
 assert.equal(check(x).coverageVerified,false);
 const y=input();Object.setPrototypeOf(y,[]);
 assert.equal(check(y).coverageVerified,false);
});
test('RED: reject invalid scheme, whitespace, loopback HTTPS disguises',()=>{
 for(const url of ['ftp://private.example','http://127.0.0.1:8080/path',
  'https://127.0.0.1:8080','http://localhost:8080 ', 'https://[::1]:443']){
  const x=input();x.configuredOrigins=[...LOCAL,url];
  assert.equal(check(x).coverageVerified,false);
 }
});
