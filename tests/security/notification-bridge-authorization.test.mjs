/** DEVPROXY-P0 RED: pure authorization contracts. NEVER invoke Messages or launchctl. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { authorizeBridgeRequest, resolveAllowedOrigins } = require('../../macos/notifications-bridge-auth.cjs');
const secret = 'very-long-local-notifications-token-' + 'x'.repeat(40);
const port=17888;
const allowed=resolveAllowedOrigins('https://trusted.example');
const auth=(method,path,headers={})=>authorizeBridgeRequest({method,url:path,headers},{
  token:secret,port,allowedOrigins:allowed,
});
const bearer={host:'127.0.0.1:17888',authorization:'Bearer '+secret};
test('all privilege-bearing local OS endpoints fail closed without an authenticated bearer',()=>{
 for(const method of ['GET','POST']){
  for(const path of ['/service/status','/service/install','/service/uninstall','/test']){
   const r=auth(method,path,{host:'127.0.0.1:17888'});
   assert.equal(r.allowed,false,method+' '+path);
   assert.equal(r.status,401);
  }
 }
});
test('a correct bearer cannot override an untrusted or missing localhost Host',()=>{
 for(const host of ['evil.test','127.0.0.1.evil.test:17888','127.0.0.1:4000','[::1]:17888',null]){
  const r=auth('POST','/service/install',{authorization:'Bearer '+secret,...host?{host}:{}});
  assert.equal(r.allowed,false,String(host));
  assert.equal(r.status,403);
 }
});
test('allowed origins are exact, not suffix/domain/reflection or wildcard matches',()=>{
 for(const origin of ['https://trusted.example.evil.tld','https://evil.test','null','file://','http://trusted.example','https://trusted.example:8443']){
  const r=auth('POST','/test',{...bearer,origin});
  assert.equal(r.allowed,false,origin);
  assert.equal(r.status,403);
  assert.equal(r.corsOrigin,null);
 }
 const r=auth('POST','/test',{...bearer,origin:'https://trusted.example'});
 assert.equal(r.allowed,true);
 assert.equal(r.corsOrigin,'https://trusted.example');
 assert.equal(auth('POST','/test',bearer).allowed,true,'valid authenticated nonbrowser operator allowed');
});
test('local UI origins are exact and preflight never grants authority',()=>{
 const origins=['http://localhost:8080','http://127.0.0.1:8080','https://localhost:8443','https://127.0.0.1:8443'];
 for(const origin of origins){
  const p=auth('OPTIONS','/service/install',{host:'127.0.0.1:17888',origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'});
  assert.equal(p.allowed,true,origin);
  assert.equal(p.isPreflight,true);
  assert.equal(p.corsOrigin,origin);
  assert.equal(auth('POST','/service/install',{host:'127.0.0.1:17888',origin}).allowed,false,'preflight does not convey authentication');
 }
 for(const origin of ['https://evil.test','null']){
  const p=auth('OPTIONS','/service/install',{host:'127.0.0.1:17888',origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'});
  assert.equal(p.allowed,false);
  assert.equal(p.corsOrigin,null);
 }
});
test('a token is bound to legitimate operations, not another protocol method',()=>{
 assert.equal(auth('POST','/service/install',{...bearer}).allowed,true);
 assert.equal(auth('GET','/service/install',{...bearer}).allowed,false);
 assert.equal(auth('POST','/service/status',{...bearer}).allowed,false);
 assert.equal(auth('POST','/test',{...bearer,origin:'https://trusted.example'}).allowed,true);
 assert.equal(auth('POST','/test',{...bearer,authorization:'Bearer wrong'}).allowed,false);
 assert.equal(auth('GET','/health',{host:'127.0.0.1:17888'}).allowed,true,'health excludes private details');
});
test('configuration must reject insecure public/http origins instead of allowing wildcard',()=>{
 assert.throws(()=>resolveAllowedOrigins('*'));
 assert.throws(()=>resolveAllowedOrigins('http://trusted.example'));
 assert.throws(()=>resolveAllowedOrigins('https://trusted.example/path'));
 assert.throws(()=>resolveAllowedOrigins('https://u:p@trusted.example'));
});
test('runtime/UI integration never directly expose unauthenticated macOS operations',()=>{
 const server=readFileSync(new URL('../../macos/notifications-bridge.js', import.meta.url),'utf8');
 const ui=readFileSync(new URL('../../status/status.html', import.meta.url),'utf8');
 assert.match(server,/authorizeBridgeRequest\(/);
 assert.doesNotMatch(server,/Access-Control-Allow-Origin'\s*:\s*'\*'/);
 assert.match(ui,/Authorization.*Bearer|authorization.*Bearer/);
 assert.match(ui,/sessionStorage/);
 assert.doesNotMatch(ui,/localStorage\.setItem\(['"]notifBridgeToken/);
});
