'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProductionComposeCandidate}=require('../../utils/rc2-production-compose-candidate.cjs');
const {createReadOnlyProductionPreflight}=require('../../utils/rc2-readonly-production-preflight.cjs');
const ID={proxy:'a'.repeat(64),api:'b'.repeat(64)};
const IMG={proxy:'sha256:'+'c'.repeat(64),api:'sha256:'+'d'.repeat(64)};
function pins(){
 const x={proxyImage:'registry.example.invalid/devproxy-proxy@sha256:'+'e'.repeat(64),
 apiImage:'registry.example.invalid/devproxy-api@sha256:'+'f'.repeat(64),
 apiUid:10001,apiGid:10001,
 paths:{sourceRoot:'/private/rc2-stage/source',ownerEnvFile:'/private/rc2-operator/env',
 secretHostFile:'/private/rc2-operator/secret',spoolHostDir:'/private/rc2-operator/spool',
 appsDir:'/private/rc2-stage/data/apps',overridesDir:'/private/rc2-stage/data/overrides',
 sitesDir:'/private/rc2-stage/data/build/sites-enabled',artifactsDir:'/private/rc2-stage/data/artifacts',
 nginxConf:'/private/rc2-stage/source/config/nginx.production.conf',
 defaultConf:'/private/rc2-stage/source/config/default.production.conf',
 nginxEntrypoint:'/private/rc2-stage/source/scripts/nginx-entrypoint.sh',
 certsDir:'/private/rc2-stage/data/certs',statusDir:'/private/rc2-stage/data/status',
 dashboardDir:'/private/rc2-stage/source/dashboard/public'}};
 const obj=createProductionComposeCandidate(x).compose;
 const convert=(name,role)=>({containerId:ID[role],image:IMG[role],mounts:
 obj.services[name].volumes.map(m=>({destination:m.target,source:m.source,readOnly:m.read_only}))});
 return {proxy:convert('proxy','proxy'),api:convert('proxy-config-api','api')};
}
function fake(pins,mutation){
 const F={id:'{{json .Id}}',image:'{{json .Image}}',running:'{{json .State.Running}}',
 privileged:'{{json .HostConfig.Privileged}}',user:'{{json .Config.User}}',
 mounts:'{{json .Mounts}}',ports:'{{json .HostConfig.PortBindings}}'};
 const roles={};for(const role of ['api','proxy']){
  const pin=pins[role];roles[role]={id:pin.containerId,image:pin.image,running:true,
  privileged:false,user:role==='api'?'10001':'nginx',
  mounts:pin.mounts.map(m=>({Type:'bind',Source:m.source,Destination:m.destination,RW:!m.readOnly})),
  ports:role==='api'?{'3001/tcp':[{HostIp:'127.0.0.1',HostPort:'3001'}]}:{'80/tcp':[{HostIp:'127.0.0.1',HostPort:'8080'}]}};
 }
 if(mutation)mutation(roles);
 const calls=[];
 const execFileImpl=(bin,args,opts,cb)=>{
  calls.push(args);
  const role=args[3]===ID.api?'api':args[3]===ID.proxy?'proxy':null;
  const key=Object.keys(F).find(k=>F[k]===args[2]);
  if(!role||!key)throw Error('INVALID_MOCK_DOCKER_CALL');
  queueMicrotask(()=>cb(null,JSON.stringify(roles[role][key])+'\n',''));
 };
 return {execFileImpl,calls};
}
function read(p,mutation){
 const m=fake(p,mutation);
 const pre=createReadOnlyProductionPreflight({pins:p,execFileImpl:m.execFileImpl,
  dockerBinary:'/usr/local/bin/docker',home:'/private/rc2-operator'});
 return {inspect:()=>pre.inspect(),calls:m.calls};
}
test('RED: exact source-pinned RC2 candidate with isolated RW spool can pass read-only Docker preflight construction',async()=>{
 const p=pins();const m=read(p);const out=await m.inspect();
 assert.equal(out.code,'EVIDENCE_FOR_INDEPENDENT_REVIEW_ONLY');
 assert.equal(out.productionChangeAuthorized,false);assert.equal(out.runtimeAttested,false);
 assert.equal(m.calls.length,28);
});
test('RED: RO spool mount is rejected for a signed settlement-enabled candidate',()=>{
 const p=pins();p.api.mounts.find(m=>m.destination==='/app/.artifacts/rc2-ipc').readOnly=true;
 assert.throws(()=>read(p),/INVALID_RC2_PREFLIGHT/);
});
test('RED: RW secret exposure is rejected before Docker preflight',()=>{
 const p=pins();p.api.mounts.find(m=>m.destination==='/app/.artifacts/rc2-activation.secret').readOnly=false;
 assert.throws(()=>read(p),/INVALID_RC2_PREFLIGHT/);
});
test('RED: missing operator secret while spool exists is rejected at preflight construction',()=>{
 const p=pins();p.api.mounts=p.api.mounts.filter(m=>m.destination!=='/app/.artifacts/rc2-activation.secret');
 assert.throws(()=>read(p),/INVALID_RC2_PREFLIGHT/);
});
test('RED: missing spool when secret exists is rejected at preflight construction',()=>{
 const p=pins();p.api.mounts=p.api.mounts.filter(m=>m.destination!=='/app/.artifacts/rc2-ipc');
 assert.throws(()=>read(p),/INVALID_RC2_PREFLIGHT/);
});
test('RED: a worker private secret inside the proxy shared artifacts tree fails construction',()=>{
 const p=pins();p.api.mounts.find(m=>m.destination==='/app/.artifacts/rc2-activation.secret').source=
  '/private/rc2-stage/data/artifacts/host-activation.secret';
 assert.throws(()=>read(p),/INVALID_RC2_PREFLIGHT/);
});
test('RED: spool must not point inside API source or any owner route data volume',()=>{
 for(const nested of ['/private/rc2-stage/source/rc2-spool','/private/rc2-stage/data/apps/.spool',
  '/private/rc2-stage/data/artifacts/.spool']){
  const p=pins();p.api.mounts.find(m=>m.destination==='/app/.artifacts/rc2-ipc').source=nested;
  assert.throws(()=>read(p),/INVALID_RC2_PREFLIGHT/,nested);
 }
});
test('RED: actual observed worker spool RW downgrade blocks postcutover',async()=>{
 const p=pins();const m=read(p,records=>{
  records.api.mounts.find(x=>x.Destination==='/app/.artifacts/rc2-ipc').RW=false;
 });
 const r=await m.inspect();assert.equal(r.code,'READ_ONLY_PREFLIGHT_BLOCKED');
 assert.ok(r.blockers.includes('API_MOUNTS_MISMATCH'));
});
test('RED: unexpected secret mount source after release blocks without leaking private operator path',async()=>{
 const p=pins();const m=read(p,records=>{
  records.api.mounts.find(x=>x.Destination==='/app/.artifacts/rc2-activation.secret').Source='/private/other/secret';
 });
 const r=await m.inspect();assert.ok(r.blockers.includes('API_MOUNTS_MISMATCH'));
 assert.equal(JSON.stringify(r).includes('/private/'),false);
});
