'use strict';
// Synthetic only. No Docker command runs in these tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditDockerRuntime}=require('../../scripts/rc1-runtime-isolation-audit.cjs');
const sha='sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1';
function fixtures(){
 return {
 'dev-proxy|{{json .State.Running}}':true,
 'dev-proxy-config-api|{{json .State.Running}}':true,
 'dev-proxy|{{json .Image}}':sha,
 'dev-proxy-config-api|{{json .Config.User}}':'10001',
 'dev-proxy-config-api|{{json .HostConfig.Privileged}}':false,
 'dev-proxy-config-api|{{json .Mounts}}':[
  {Type:'bind',Destination:'/app',RW:false,Source:'/private/OWNER_ROOT_DO_NOT_ECHO'},
  {Type:'bind',Destination:'/app/.env',RW:false,Source:'/private/SECRET_ENV_DO_NOT_ECHO'},
  {Type:'bind',Destination:'/app/.artifacts',RW:true,Source:'/private/SECRET_SESSION_DO_NOT_ECHO'}
 ],
 'dev-proxy-config-api|{{json .NetworkSettings.Ports}}':{
  '3001/tcp':[{HostIp:'127.0.0.1',HostPort:'3001'}],
  '3002/tcp':[{HostIp:'127.0.0.1',HostPort:'3002'}]
 }
 };
}
function invoke(fixture){
 const calls=[];
 const run=(cmd,args,opts)=>{
  assert.equal(cmd,'docker');
  assert.deepEqual(args.slice(0,2),['inspect','--format']);
  assert.ok(['dev-proxy','dev-proxy-config-api'].includes(args[3]));
  assert.equal(opts.encoding,'utf8');
  assert.ok(opts.timeout>0&&opts.timeout<=8000);
  calls.push(args);
  const key=args[3]+'|'+args[2];
  if(!Object.hasOwn(fixture,key))throw Error('FIXTURE_MISSING');
  return JSON.stringify(fixture[key])+'\n';
 };
 return {result:auditDockerRuntime({run}),calls};
}
test('safe synthetic inspected runtime returns only fixed PLAN_ONLY code, no secret mount paths',()=>{
 const {result,calls}=invoke(fixtures());
 assert.equal(result.state,'PLAN_ONLY');assert.equal(result.productionChangeAuthorized,false);
 assert.equal(calls.length,7);assert.equal(result.findings.length,0);
 assert.doesNotMatch(JSON.stringify(result),/OWNER_ROOT_DO_NOT_ECHO|SECRET_/);
});
test('read-only command set is ONLY inspect --format; never shell, Compose or mutators',()=>{
 const {calls}=invoke(fixtures());
 assert.ok(calls.every(c=>c.length===4&&c[0]==='inspect'&&c[1]==='--format'));
 for(const args of calls)assert.doesNotMatch(args.join(' '),/\.Env|\.Config.Env|docker.sock|exec |restart|up -d|down|compose/);
});
test('RW source + root + Docker socket is CRITICAL, including when socket mount falsely called RO',()=>{
 for(const rw of [true,false]){
  const f=fixtures();
  f['dev-proxy-config-api|{{json .Config.User}}']='root';
  const m=f['dev-proxy-config-api|{{json .Mounts}}'];
  m[0].RW=true;m.push({Type:'bind',Destination:'/var/run/docker.sock',RW:rw});
  const {result}=invoke(f);
  assert.equal(result.state,'CRITICAL');assert.ok(result.findings.includes('COMPOUND_HOST_CONTROL'));
 }
});
test('if inspect command fails, return redacted UNKNOWN instead of printing stderr/paths',()=>{
 const result=auditDockerRuntime({run:()=>{throw new Error('docker connect denied password=NEVER_SHOW_PRIVATE_HOST');}});
 assert.equal(result.state,'UNKNOWN');assert.equal(result.productionChangeAuthorized,false);
 assert.doesNotMatch(JSON.stringify(result),/password|NEVER_SHOW|PRIVATE_HOST/);
});
test('stopped or missing containers never yield green',()=>{
 for(const key of ['dev-proxy|{{json .State.Running}}','dev-proxy-config-api|{{json .State.Running}}']){
  const f=fixtures();f[key]=false;
  const {result}=invoke(f);assert.equal(result.state,'UNKNOWN');
 }
});
test('all-interface management published must report CRITICAL',()=>{
 const f=fixtures();f['dev-proxy-config-api|{{json .NetworkSettings.Ports}}']['3002/tcp'][0].HostIp='0.0.0.0';
 const {result}=invoke(f);assert.equal(result.state,'CRITICAL');
 assert.ok(result.findings.includes('MANAGEMENT_NOT_LOOPBACK'));
});
