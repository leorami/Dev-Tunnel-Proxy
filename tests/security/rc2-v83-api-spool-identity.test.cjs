'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApiSpoolIdentityProbe}=require('../../utils/rc2-api-spool-identity-probe.cjs');
const CID='a'.repeat(64),IMG='sha256:'+'b'.repeat(64);
const HOST='/private/test-stage',SPOOL=HOST+'/host-share',SECRET=HOST+'/activation.secret';
const MS=[{Type:'bind',Source:SPOOL,Destination:'/app/.artifacts/rc2-ipc',RW:true},
 {Type:'bind',Source:SECRET,Destination:'/app/.artifacts/rc2-activation.secret',RW:false}];
const BASE={dockerBinary:'/usr/local/bin/docker',containerId:CID,image:IMG,spoolHostDir:SPOOL,
 secretHostFile:SECRET,apiUid:504,apiGid:20,home:'/private/owner-home'};
function fixture({fields={},access={},errorOn,extraMount,secretOverexposed=false,drift=false,timeout=false}={}){
 const calls=[];
 const mapped={
  '{{json .Id}}':CID,'{{json .Image}}':IMG,'{{json .State.Running}}':true,
  '{{json .Config.User}}':'504:20','{{json .Mounts}}':[...MS,...(extraMount?[extraMount]:[])] ,...fields};
 const result={uid:504,gid:20,spoolOwnerUid:504,spoolMode:448,secretOwnerUid:504,secretMode:384,spoolAccessible:true,secretReadable:true,...access};
 const exec=(binary,args,opts,cb)=>{
  calls.push({binary,args,opts});
  if(timeout)return; // tool-level bounded timeout
  if(errorOn===args[0])return setImmediate(()=>cb(Error('test-owner-simulated-failure'),'',''));
  if(args[0]==='inspect'&&args[1]==='--format')return setImmediate(()=>cb(null,JSON.stringify(mapped[args[2]])+'\n',''));
  if(args[0]==='exec'&&args[1]===CID&&args[2]==='node'&&args[3]==='-e')return setImmediate(()=>cb(null,JSON.stringify(result)+'\n',''));
  throw Error('unexpected docker command '+args.join(' '));
 };
 if(secretOverexposed) mapped['{{json .Mounts}}']=[...MS,{Type:'bind',Source:SECRET,Destination:'/app/public-secret',RW:false}];
 return {exec,calls,opts:BASE};
}
const run=f=>createApiSpoolIdentityProbe({...f.opts,execFileImpl:f.exec,timeoutMs:110}).inspect();
test('RED: actual unprivileged API process can read the 0600 secret and access 0700 spool as matching mapped UID',async()=>{
 const f=fixture(),r=await run(f);
 assert.equal(r.code,'API_SPOOL_CROSS_UID_EVIDENCE_ONLY');assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.deployed,false);assert.equal(r.apiUidObserved,504);
 assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,1);
 assert.ok(f.calls.every(c=>c.opts.shell===false));
 assert.ok(f.calls.every(c=>!c.args.includes('system')&&!c.args.includes('reload')&&!c.args.includes('run')));
});
test('RED: Linux API UID 504 mismatch fails instead of treating successful RW probe as proof',async()=>{
 const f=fixture({access:{uid:501}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED');
});
test('RED: mapped spool owner mismatch fails',async()=>{const f=fixture({access:{spoolOwnerUid:501}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: mapped secret owner mismatch fails',async()=>{const f=fixture({access:{secretOwnerUid:501}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: wrong permissions on secret reject',async()=>{const f=fixture({access:{secretMode:420}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: wrong permissions on spool reject',async()=>{const f=fixture({access:{spoolMode:493}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: unreadable secret refuses access',async()=>{const f=fixture({access:{secretReadable:false}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: spool not writable for nonroot API is blocked',async()=>{const f=fixture({access:{spoolAccessible:false}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: wrong Config.User is blocked before docker exec',async()=>{const f=fixture({fields:{'{{json .Config.User}}':'root'}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,0)});
test('RED: image ID drift blocks without API exec',async()=>{const f=fixture({fields:{'{{json .Image}}':'sha256:'+'f'.repeat(64)}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,0)});
test('RED: secret accidentally RW is blocked',async()=>{const f=fixture({fields:{'{{json .Mounts}}':MS.map((m,i)=>i===1?{...m,RW:true}:m)}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: secret also mounted elsewhere is blocked',async()=>{const f=fixture({secretOverexposed:true});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: renamed spool source is blocked',async()=>{const f=fixture({fields:{'{{json .Mounts}}':MS.map((m,i)=>i===0?{...m,Source:'/tmp/rogue'}:m)}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: extra Docker socket mount is blocked',async()=>{const f=fixture({extraMount:{Type:'bind',Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock',RW:true}});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: process failing read probe denies',async()=>{const f=fixture({errorOn:'exec'});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED')});
test('RED: timeout is bounded, blocks and never retries or mutates',async()=>{const f=fixture({timeout:true});assert.equal((await run(f)).code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,0)});
test('RED: Docker invocation requires exact pinned full ID, digest, UID, GID',()=>{
 const f=fixture();assert.throws(()=>createApiSpoolIdentityProbe({...BASE,apiUid:0,execFileImpl:f.exec}),/RC2_SPOOL_IDENTITY_INVALID/);
 assert.throws(()=>createApiSpoolIdentityProbe({...BASE,containerId:'dev-proxy-config-api',execFileImpl:f.exec}),/RC2_SPOOL_IDENTITY_INVALID/);
});
test('RED: returned evidence never exposes private spool source, secret path or bytes',async()=>{const f=fixture();const r=await run(f);assert.equal(JSON.stringify(r).includes(HOST),false);assert.equal(JSON.stringify(r).includes('activation.secret'),false)});
