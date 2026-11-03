'use strict';
// Immutable, synthetic Docker-inspect projections only; NO Environment, secrets or owner paths.
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessRuntimeIsolation,EXPECTED_IMAGE}=require('../../utils/rc1-runtime-isolation.cjs');
const m=(Destination,RW,Type='bind')=>({Destination,RW,Type});
const binding=(HostIp,HostPort)=>({HostIp,HostPort:String(HostPort)});
function safe(){return {
 proxyImage:EXPECTED_IMAGE,
 apiUser:'10001',apiPrivileged:false,
 apiMounts:[m('/app',false),m('/app/.env',false),m('/app/.artifacts',true)],
 apiPorts:{'3001/tcp':[binding('127.0.0.1',3001)],'3002/tcp':[binding('127.0.0.1',3002)]}
};}
const ck=(a,code)=>assert.ok(a.findings.includes(code),JSON.stringify(a));
test('all expected fixture fields still require independent GO; no local metadata can deploy',()=>{
 const x=assessRuntimeIsolation(safe());assert.equal(x.state,'PLAN_ONLY');
 assert.equal(x.productionChangeAuthorized,false);assert.equal(x.performedActions,false);
 assert.deepEqual(x.findings,[]);assert.ok(Object.isFrozen(x));
});
test('actual reported /app RW is a source-integrity failure',()=>{
 const s=safe();s.apiMounts[0].RW=true;
 const x=assessRuntimeIsolation(s);ck(x,'APP_SOURCE_WRITABLE');assert.equal(x.state,'REVIEW_REQUIRED');
});
test('docker socket mount is a host-control risk EVEN with ro bind (Unix socket semantics)',()=>{
 for(const rw of [true,false]){
  const s=safe();s.apiMounts.push(m('/var/run/docker.sock',rw));let x=assessRuntimeIsolation(s);
  ck(x,'HOST_DOCKER_SOCKET_MOUNTED');
 }
});
test('root + writable app + host Docker socket is a compound critical risk',()=>{
 const s=safe();s.apiUser='root';s.apiMounts[0].RW=true;s.apiMounts.push(m('/var/run/docker.sock',true));
 const x=assessRuntimeIsolation(s);ck(x,'APP_SOURCE_WRITABLE');ck(x,'HOST_DOCKER_SOCKET_MOUNTED');
 ck(x,'ROOT_USER');ck(x,'COMPOUND_HOST_CONTROL');assert.equal(x.state,'CRITICAL');
});
test('root user, default Docker user, and privileged true do not receive green status',()=>{
 for(const user of ['', '0','0:0','root']){
  const s=safe();s.apiUser=user;ck(assessRuntimeIsolation(s),'ROOT_USER');
 }
 const s=safe();s.apiPrivileged=true;ck(assessRuntimeIsolation(s),'PRIVILEGED_CONTAINER');
});
test('management host binding on any LAN/public interface is critical; absent second port is UNKNOWN',()=>{
 for(const ip of ['0.0.0.0','::','192.168.10.5','10.2.1.8','203.0.113.5']){
  const s=safe();s.apiPorts['3002/tcp']=[binding(ip,3002)];
  const x=assessRuntimeIsolation(s);ck(x,'MANAGEMENT_NOT_LOOPBACK');assert.equal(x.state,'CRITICAL');
 }
 const s=safe();delete s.apiPorts['3002/tcp'];ck(assessRuntimeIsolation(s),'INCOMPLETE_PORT_EVIDENCE');
});
test('proxy image must match full approved sha256, never prefix',()=>{
 const s=safe();s.proxyImage='sha256:'+('1'.repeat(64));
 ck(assessRuntimeIsolation(s),'WRONG_PROXY_IMAGE');
 s.proxyImage=EXPECTED_IMAGE.slice(0,24);ck(assessRuntimeIsolation(s),'WRONG_PROXY_IMAGE');
});
test('owner credential file cannot be RW; session store must remain writable',()=>{
 let s=safe();s.apiMounts[1].RW=true;ck(assessRuntimeIsolation(s),'OWNER_ENV_WRITABLE');
 s=safe();s.apiMounts[2].RW=false;ck(assessRuntimeIsolation(s),'SESSION_STORE_READ_ONLY');
});
test('missing or duplicate app mounts cannot falsely pass; nested source shadow mounts also flagged',()=>{
 for(const index of [0,1,2]){
  const s=safe();s.apiMounts.splice(index,1);ck(assessRuntimeIsolation(s),'MOUNT_EVIDENCE_INCOMPLETE');
 }
 let s=safe();s.apiMounts.push(m('/app',false));ck(assessRuntimeIsolation(s),'MOUNT_EVIDENCE_INCOMPLETE');
 s=safe();s.apiMounts.push(m('/app/utils/proxyConfigAPI.js',true));ck(assessRuntimeIsolation(s),'UNREVIEWED_APP_SHADOW_MOUNT');
});
test('malformed evidence accessors and prototype inputs fail without reading arbitrary secrets',()=>{
 for(const bad of [null,undefined,[],Object.create(safe()),{}]){
  const out=assessRuntimeIsolation(bad);assert.equal(out.state,'UNKNOWN');
 }
 const s=safe();Object.defineProperty(s,'apiMounts',{get(){throw Error('SECRET_LEAK');}});
 const v=assessRuntimeIsolation(s);assert.equal(v.state,'UNKNOWN');
 assert.doesNotMatch(JSON.stringify(v),/SECRET_LEAK/);
});
test('unknown fields containing passwords, full inspect or mount host paths refused, never echoed',()=>{
 for(const field of ['rawDockerInspect','apiEnv','password','ownerRoot']){
  const s=safe();s[field]='SENSITIVE_DO_NOT_ECHO';
  const v=assessRuntimeIsolation(s);assert.equal(v.state,'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(v),/SENSITIVE_DO_NOT_ECHO/);
 }
});
