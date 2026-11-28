'use strict';
/**
 * V200 RED-first: Signal ratchet/key/sealed-session bytes must be atomically
 * committed and reject symlink or weak-permission storage on owner Mac.
 * All files are synthetic disposable bytes, never real user keys.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {
 readPrivateSealedStore,writePrivateSealedStore
}=require('../../utils/devproxy-v200-atomic-sealed-store.cjs');
function sandbox(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v200-sealed-')));
 fs.chmodSync(root,0o700);
 const file=path.join(root,'sealed.store');
 return {root,file,close(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('RED: ratchet store write atomically replaces existing sealed bytes and preserves mode',()=>{
 const s=sandbox();try{
  const old=crypto.randomBytes(120),next=crypto.randomBytes(245);
  assert.equal(readPrivateSealedStore(s.file),null);
  writePrivateSealedStore(s.file,old);
  assert.deepEqual(readPrivateSealedStore(s.file),old);
  writePrivateSealedStore(s.file,next);
  assert.deepEqual(readPrivateSealedStore(s.file),next);
  const st=fs.lstatSync(s.file);
  assert.equal(st.mode&0o777,0o600);
  assert.equal(st.nlink,1);
  assert.deepEqual(fs.readdirSync(s.root),['sealed.store']);
 }finally{s.close();}
});
test('RED: failed ratchet commit cannot truncate last known-good identity/session bytes',()=>{
 const s=sandbox();try{
  const old=crypto.randomBytes(137),next=crypto.randomBytes(201);
  writePrivateSealedStore(s.file,old);
  assert.throws(()=>writePrivateSealedStore(s.file,next,{
   beforeCommit(){throw Error('INJECTED_CRASH_BEFORE_ATOMIC_RENAME');}
  }),/INJECTED_CRASH_BEFORE_ATOMIC_RENAME/);
  assert.deepEqual(readPrivateSealedStore(s.file),old);
  assert.deepEqual(fs.readdirSync(s.root),['sealed.store']);
 }finally{s.close();}
});
test('RED: a symlink target or group-readable sealed store must never be opened or overwritten',()=>{
 const s=sandbox();try{
  const outside=path.join(s.root,'outside-private-data');
  fs.writeFileSync(outside,crypto.randomBytes(64),{mode:0o600});
  fs.symlinkSync(outside,s.file);
  assert.throws(()=>readPrivateSealedStore(s.file),/UNSAFE_SIGNAL_SEALED_STORE/);
  assert.throws(()=>writePrivateSealedStore(s.file,crypto.randomBytes(64)),/UNSAFE_SIGNAL_SEALED_STORE/);
  fs.unlinkSync(s.file);
  writePrivateSealedStore(s.file,crypto.randomBytes(80));
  fs.chmodSync(s.file,0o644);
  assert.throws(()=>readPrivateSealedStore(s.file),/UNSAFE_SIGNAL_SEALED_STORE/);
  assert.throws(()=>writePrivateSealedStore(s.file,crypto.randomBytes(80)),/UNSAFE_SIGNAL_SEALED_STORE/);
 }finally{s.close();}
});
test('RED: missing or world-readable parent directories cannot hold Signal identities',()=>{
 const s=sandbox();try{
  const missing=path.join(s.root,'missing','device.store');
  assert.throws(()=>writePrivateSealedStore(missing,Buffer.alloc(64)),/UNSAFE_SIGNAL_STORE_DIRECTORY/);
  fs.chmodSync(s.root,0o755);
  assert.throws(()=>writePrivateSealedStore(s.file,Buffer.alloc(64)),/UNSAFE_SIGNAL_STORE_DIRECTORY/);
  fs.chmodSync(s.root,0o700);
  const link=path.join(s.root,'link');
  fs.symlinkSync(s.root,link);
  assert.throws(()=>writePrivateSealedStore(path.join(link,'device.store'),Buffer.alloc(64)),/UNSAFE_SIGNAL_STORE_DIRECTORY/);
 }finally{s.close();}
});
test('RED: foreign concurrent writer lock makes store fail closed without altering state',()=>{
 const s=sandbox();try{
  const old=crypto.randomBytes(80);
  writePrivateSealedStore(s.file,old);
  const lock=s.file+'.lock';
  fs.writeFileSync(lock,'occupied',{flag:'wx',mode:0o600});
  assert.throws(()=>writePrivateSealedStore(s.file,crypto.randomBytes(90)),/SIGNAL_STORE_WRITE_LOCKED/);
  assert.deepEqual(readPrivateSealedStore(s.file),old);
 }finally{s.close();}
});
test('RED: invalid or oversized sealed stores are refused without any filesystem writes',()=>{
 const s=sandbox();try{
  assert.throws(()=>writePrivateSealedStore(s.file,Buffer.alloc(0)),/INVALID_SIGNAL_SEALED_BYTES/);
  assert.throws(()=>writePrivateSealedStore(s.file,Buffer.alloc(4*1024*1024+1)),/INVALID_SIGNAL_SEALED_BYTES/);
  assert.equal(fs.existsSync(s.file),false);
 }finally{s.close();}
});
