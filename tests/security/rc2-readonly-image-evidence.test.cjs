'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {inspectPrivateImageArchive}=require('../../utils/rc2-readonly-image-archive.cjs');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-image-evidence-'));
 const parent=path.join(root,'private-rollbacks'),stage=path.join(parent,'rc2-images-evidence');
 fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(stage,{mode:0o700});
 const pin={protocol:'DEVPROXY_RC2_PRIVATE_IMAGE_EXPORT_V1',dockerBinary:'/usr/local/bin/docker',dockerDaemonId:'DAEMON:REVIEWED:EXAMPLE',
  containers:[{role:'proxy',containerId:'a'.repeat(64),imageId:'sha256:'+'c'.repeat(64)},
   {role:'api',containerId:'b'.repeat(64),imageId:'sha256:'+'d'.repeat(64)}],ownerExportAuthorized:true};
 fs.writeFileSync(path.join(stage,'rc2-current-images.private.json'),JSON.stringify(pin)+'\n',{mode:0o600});
 const bytes=Buffer.alloc(1024,0x42),digest=crypto.createHash('sha256').update(bytes).digest('hex');
 const tar=path.join(stage,'rollback-images.tar'),sums=path.join(stage,'SHA256SUMS.private');
 fs.writeFileSync(tar,bytes,{mode:0o600});fs.writeFileSync(sums,digest+'  rollback-images.tar\n',{mode:0o600});
 try{return fn({stage,tar,sums,pin});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('RED: independently verify complete private archive checksum without Docker',()=>fixture(({stage})=>{
 const result=inspectPrivateImageArchive({stageRoot:stage});
 assert.equal(result.code,'RC2_IMAGE_ARCHIVE_CHECKSUM_MATCHES_RESTORE_NOT_VERIFIED');
 assert.equal(result.archiveHashMatches,true);
 assert.equal(result.restoreVerified,false);assert.equal(result.productionChangeAuthorized,false);
 assert.equal(result.liveImageBindingVerified,false);assert.equal(result.deployed,false);
}));
test('RED: changed archive bytes block purported recovery evidence',()=>fixture(({stage,tar})=>{
 fs.writeFileSync(tar,Buffer.alloc(1024,0x43));
 const result=inspectPrivateImageArchive({stageRoot:stage});
 assert.equal(result.code,'RC2_IMAGE_ARCHIVE_INTEGRITY_BLOCKED');assert.equal(result.archiveHashMatches,false);
}));
test('RED: incomplete export without digest is never accepted',()=>fixture(({stage,sums})=>{
 fs.unlinkSync(sums);
 assert.equal(inspectPrivateImageArchive({stageRoot:stage}).code,'RC2_IMAGE_ARCHIVE_INTEGRITY_BLOCKED');
}));
test('RED: hardlinked, public or symlink archive is blocked',()=>fixture(({stage,tar})=>{
 fs.linkSync(tar,tar+'.linked');
 assert.equal(inspectPrivateImageArchive({stageRoot:stage}).archiveHashMatches,false);
 fs.unlinkSync(tar+'.linked');fs.chmodSync(tar,0o644);
 assert.equal(inspectPrivateImageArchive({stageRoot:stage}).archiveHashMatches,false);
 fs.chmodSync(tar,0o600);const backup=tar+'.backup';fs.renameSync(tar,backup);fs.symlinkSync(backup,tar);
 assert.equal(inspectPrivateImageArchive({stageRoot:stage}).archiveHashMatches,false);
}));
test('RED: malformed or altered SHA256SUMS fails closed',()=>fixture(({stage,sums})=>{
 for(const text of ['abc  rollback-images.tar\n','1'.repeat(64)+'  other.tar\n','1'.repeat(64)+'  rollback-images.tar\nextra']){
  fs.writeFileSync(sums,text);
  assert.equal(inspectPrivateImageArchive({stageRoot:stage}).archiveHashMatches,false);
 }
}));
test('RED: hash inspection does not change private archive contents or metadata',()=>fixture(({stage,tar})=>{
 const bytes=fs.readFileSync(tar);const prior=fs.statSync(tar);
 inspectPrivateImageArchive({stageRoot:stage});
 assert.deepEqual(fs.readFileSync(tar),bytes);assert.equal(fs.statSync(tar).mtimeMs,prior.mtimeMs);
}));
