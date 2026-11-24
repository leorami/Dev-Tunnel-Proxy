'use strict';
/**
 * V200 RED-first fixes to real V199 enrolled device records and
 * cross-process replay. All identities and bytes are synthetic ephemeral.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createTransportIdentity}=require('../../utils/devproxy-v199-device-proof.cjs');
const {openEnrollmentRegistry}=require('../../utils/devproxy-v199-enrollment-registry.cjs');
function sandbox(){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v200-enrollment-')));
 fs.chmodSync(dir,0o700);
 const nonceDir=path.join(dir,'proof-nonces');
 fs.mkdirSync(nonceDir,{mode:0o700});
 return {dir,nonceDir,close(){fs.rmSync(dir,{recursive:true,force:true});}};
}
function record(role,identity,signal='ab'.repeat(32),peer='cd'.repeat(32)){
 return {version:1,role,deviceId:identity.deviceId,revoked:false,
 transportPublicKeySpki:identity.transportPublicKeySpki,
 signalIdentitySha256:signal,peerSignalIdentitySha256:peer};
}
test('RED: enrollment rejects device ID that does not hash the actual Ed25519 public identity',()=>{
 const s=sandbox();try{
  const i=createTransportIdentity(),registry=openEnrollmentRegistry(s.dir);
  const forged=record('trajectory',i);
  forged.deviceId='b'.repeat(64);
  assert.throws(()=>registry.enroll(forged),/ENROLLMENT_IDENTITY_BINDING/);
  assert.equal(registry.role('trajectory'),null);
 }finally{s.close();}
});
test('RED: new enrollment cannot silently replace an active owner-paired device role',()=>{
 const s=sandbox();try{
  const r=openEnrollmentRegistry(s.dir),first=createTransportIdentity(),second=createTransportIdentity();
  r.enroll(record('trajectory',first));
  assert.throws(()=>r.enroll(record('trajectory',second)),/ENROLLMENT_REQUIRES_OWNER_REVOKE/);
  assert.equal(r.role('trajectory').deviceId,first.deviceId);
 }finally{s.close();}
});
test('RED: corrupted owner enrollment record fails closed rather than filtering invalid entries',()=>{
 const s=sandbox();try{
  const f=path.join(s.dir,'enrollment.json');
  fs.writeFileSync(f,JSON.stringify({version:1,devices:[{role:'calliope',revoked:false}]}),{mode:0o600});
  const r=openEnrollmentRegistry(s.dir);
  assert.throws(()=>r.lookup('a'.repeat(64)),/UNSAFE_ENROLLMENT_FILE/);
 }finally{s.close();}
});
test('RED: one signed nonce admits exactly once under eight independent competing workers',async()=>{
 const s=sandbox();try{
  const deviceId=createTransportIdentity().deviceId;
  const nonce=crypto.randomBytes(32).toString('hex');
  const runner=String.raw`
   const R=require(process.argv[1]);
   const r=R.openEnrollmentRegistry(process.argv[2]);
   process.stdin.resume();
   process.stdin.once('data',()=>{
    let code;
    try{code=r.consumeNonce(process.argv[3],process.argv[4],1800000000000)?'1':'0';}
    catch(e){code='ERROR:'+String(e.code||e.message);}
    process.stdout.write(code);
   });
  `;
  const peers=Array.from({length:8},()=>new Promise((resolve,reject)=>{
   const cp=spawn(process.execPath,['-e',runner,
    require.resolve('../../utils/devproxy-v199-enrollment-registry.cjs'),
    s.dir,deviceId,nonce],{stdio:['pipe','pipe','pipe']});
   let text='',err='';
   cp.stdout.on('data',v=>text+=v);
   cp.stderr.on('data',v=>err+=v);
   cp.once('exit',code=>code===0?resolve(text):reject(Error('worker '+code+':'+err.slice(0,300))));
   cp.stdin.write('go');cp.stdin.end();
  }));
  const results=await Promise.all(peers);
  assert.deepEqual(results.filter(x=>x==='1').length,1,'exactly one worker must commit this nonce');
  assert.deepEqual(results.filter(x=>x!=='1'&&x!=='0'),[],'no concurrent FS read/write corruption');
 }finally{s.close();}
});
test('GREEN: replay of a used nonce and reversed order are rejected after registry reopen',()=>{
 const s=sandbox();try{
  const i=createTransportIdentity(),n=crypto.randomBytes(32).toString('hex');
  const first=openEnrollmentRegistry(s.dir);
  assert.equal(first.consumeNonce(i.deviceId,n,1800000000000),true);
  const next=openEnrollmentRegistry(s.dir);
  assert.equal(next.consumeNonce(i.deviceId,n,1800000000001),false);
 }finally{s.close();}
});
