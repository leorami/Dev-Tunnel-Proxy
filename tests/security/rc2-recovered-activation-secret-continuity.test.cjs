'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {compareRecoveredActivationSecret}=require('../../utils/rc2-recovered-activation-secret-continuity.cjs');
function fixture(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'rc2-key-continuity-test-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const backup=path.join(root,'backup'),restored=path.join(root,'restored');
 for(const p of [backup,restored])fs.mkdirSync(p,{mode:0o700});
 const backupSecretPath=path.join(backup,'activation.secret');
 const restoredSecretPath=path.join(restored,'activation.secret');
 const secret=crypto.randomBytes(32);
 for(const file of [backupSecretPath,restoredSecretPath])fs.writeFileSync(file,secret,{mode:0o600,flag:'wx'});
 return {root,backup,restored,backupSecretPath,restoredSecretPath,args:{backupSecretPath,restoredSecretPath}};
}
const verdict=f=>compareRecoveredActivationSecret(f.args);
test('RED: exact byte-continuity is not proof backup is original, nor grant to deploy',t=>{
 const f=fixture(t),v=verdict(f);
 assert.deepEqual(v,{code:'RC2_SECRET_COPIES_IDENTICAL_NOT_AUTHENTICATED',
  copiesIdentical:true,backupProvenanceVerified:false,
  spoolReplayHistoryVerified:false,productionChangeAuthorized:false,
  filesystemModified:false,liveRuntimeAttested:false});
 assert.equal(Object.isFrozen(v),true);
});
test('RED: mismatch returns fixed non-revealing denial, never a fingerprint',t=>{
 const f=fixture(t);fs.writeFileSync(f.restoredSecretPath,crypto.randomBytes(32));
 const v=verdict(f);assert.equal(v.code,'RC2_SECRET_COPIES_DIFFER');
 assert.equal(v.copiesIdentical,false);
 assert.equal(JSON.stringify(v).includes(f.root),false);
});
test('RED: absent original backup must be blocked, not replaced with fresh key',t=>{
 const f=fixture(t);fs.unlinkSync(f.backupSecretPath);
 const v=verdict(f);assert.equal(v.code,'RC2_SECRET_COPY_UNVERIFIABLE');
 assert.equal(v.productionChangeAuthorized,false);
});
test('RED: symlink on either file refuses before reading',t=>{
 const f=fixture(t);
 for(const file of [f.backupSecretPath,f.restoredSecretPath]){
  fs.unlinkSync(file);fs.symlinkSync(path.join(f.root,'victim'),file);
  assert.equal(verdict(f).code,'RC2_SECRET_COPY_UNVERIFIABLE');
  fs.unlinkSync(file);fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600});
 }
});
test('RED: symlinked private parent is rejected',t=>{
 const f=fixture(t),link=path.join(f.root,'linked-parent');
 fs.symlinkSync(f.backup,link);
 assert.equal(compareRecoveredActivationSecret({
  backupSecretPath:path.join(link,'activation.secret'),
  restoredSecretPath:f.restoredSecretPath
 }).code,'RC2_SECRET_COPY_UNVERIFIABLE');
});
test('RED: owner-private files and direct parents require exact modes',t=>{
 const f=fixture(t);
 fs.chmodSync(f.backupSecretPath,0o644);
 assert.equal(verdict(f).code,'RC2_SECRET_COPY_UNVERIFIABLE');
 fs.chmodSync(f.backupSecretPath,0o600);
 fs.chmodSync(f.restored,0o755);
 assert.equal(verdict(f).code,'RC2_SECRET_COPY_UNVERIFIABLE');
});
test('RED: hardlinked secret copies refuse even if bytes match',t=>{
 const f=fixture(t);
 const alias=path.join(f.backup,'alias.secret');fs.linkSync(f.backupSecretPath,alias);
 assert.equal(verdict(f).code,'RC2_SECRET_COPY_UNVERIFIABLE');
});
test('RED: same-file and same-directory comparisons cannot self-attest restoration',t=>{
 const f=fixture(t);
 assert.equal(compareRecoveredActivationSecret({
  backupSecretPath:f.backupSecretPath,restoredSecretPath:f.backupSecretPath
 }).code,'RC2_SECRET_COPY_UNVERIFIABLE');
 const sibling=path.join(f.backup,'second.secret');
 fs.writeFileSync(sibling,fs.readFileSync(f.backupSecretPath),{mode:0o600});
 assert.equal(compareRecoveredActivationSecret({
  backupSecretPath:f.backupSecretPath,restoredSecretPath:sibling
 }).code,'RC2_SECRET_COPY_UNVERIFIABLE');
});
test('RED: empty, predictable or wrong-sized secrets refuse continuity',t=>{
 const f=fixture(t);
 for(const bad of [Buffer.alloc(32),Buffer.alloc(31,1),Buffer.alloc(129,2),Buffer.alloc(32,0xff)]){
  for(const file of [f.backupSecretPath,f.restoredSecretPath])fs.writeFileSync(file,bad);
  assert.equal(verdict(f).code,'RC2_SECRET_COPY_UNVERIFIABLE');
 }
});
test('RED: no hidden owner paths or secrets in returned evidence and no file writes',t=>{
 const f=fixture(t),before=fs.statSync(f.backupSecretPath,{bigint:true});
 const output=verdict(f),after=fs.statSync(f.backupSecretPath,{bigint:true});
 assert.equal(before.mtimeNs,after.mtimeNs);
 assert.equal(JSON.stringify(output).includes(f.root),false);
 assert.equal(output.filesystemModified,false);
});
test('RED: reject prototype/extra-property/getter input and paths containing traversal',t=>{
 const f=fixture(t);
 for(const value of [null,[],false,{},'private']){
  assert.equal(compareRecoveredActivationSecret(value).code,'RC2_SECRET_COPY_UNVERIFIABLE');
 }
 const extra={...f.args,token:'NEVER_ECHO'};
 assert.equal(compareRecoveredActivationSecret(extra).code,'RC2_SECRET_COPY_UNVERIFIABLE');
 const got={...f.args};
 Object.defineProperty(got,'backupSecretPath',{enumerable:true,get(){throw Error('SECRET_LEAK')}});
 assert.equal(compareRecoveredActivationSecret(got).code,'RC2_SECRET_COPY_UNVERIFIABLE');
 assert.equal(compareRecoveredActivationSecret({
  ...f.args,backupSecretPath:f.backupSecretPath.replace('/backup/','/backup/../backup/')
 }).code,'RC2_SECRET_COPY_UNVERIFIABLE');
});
