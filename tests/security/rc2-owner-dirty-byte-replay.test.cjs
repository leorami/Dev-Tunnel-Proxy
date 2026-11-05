'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyOwnerDirtyByteReplay}=require('../../utils/rc2-owner-dirty-byte-replay.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'rc2-owner-dirty-byte-test-'));
function fixture(){
 const root=temp(),liveRoot=path.join(root,'live'),archiveRestoreRoot=path.join(root,'archive'),privateSupplementRoot=path.join(root,'supplement');
 for(const d of [liveRoot,archiveRestoreRoot,privateSupplementRoot])fs.mkdirSync(d,{mode:0o700});
 const values=[
  {path:'docker-compose.yml',contents:'services:\n  proxy: current\n',mode:0o644},
  {path:'docker-compose.override.yml',contents:'services:\n  api: current\n',mode:0o644},
  {path:'scripts/configure.sh',contents:'#!/bin/sh\necho good\n',mode:0o755},
  {path:'scripts/rebuild.sh',contents:'#!/bin/sh\necho safe\n',mode:0o755},
  {path:'scripts/start.sh',contents:'#!/bin/sh\necho started\n',mode:0o755},
  {path:'status/status.html',contents:'<p>preserved UI</p>\n',mode:0o644},
  {path:'smart-build.sh',contents:'#!/bin/sh\necho owner work\n',mode:0o755},
  {path:'.cursor/rules/engineer-status-first.mdc',contents:'Owner protected instructions\n',mode:0o600}
 ];
 function put(root,item){
  const file=path.join(root,...item.path.split('/'));
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,item.contents,{mode:item.mode});fs.chmodSync(file,item.mode);
 }
 for(let i=0;i<values.length;i++){put(liveRoot,values[i]);put(i<6?archiveRestoreRoot:privateSupplementRoot,values[i]);}
 const records=values.map(x=>({path:x.path,sha256:sha(x.contents),mode:x.mode}));
 const args={sourceDirty:true,sourceHead:'a'.repeat(40),expectedDirtyCount:8,
  liveRoot,archiveRestoreRoot,privateSupplementRoot,dirtyFiles:records,
  archiveDirtyPaths:records.slice(0,6).map(x=>x.path),supplementDirtyPaths:records.slice(6).map(x=>x.path)};
 return {root,args,values,put};
}
function clean(f){fs.rmSync(f.root,{recursive:true,force:true});}
const expectBlocked=(r)=>{assert.notEqual(r.code,'OWNER_DIRTY_BYTE_REPLAY_MATCHED');assert.equal(r.ownerWorkByteReplayVerified,false);assert.equal(r.releaseAuthorized,false);assert.equal(r.formalCleanPass,false);};
test('RED: all eight owner dirty files are byte-and-mode identical in two disposable recovery roots',()=>{
 const f=fixture();try{const r=verifyOwnerDirtyByteReplay(f.args);assert.equal(r.code,'OWNER_DIRTY_BYTE_REPLAY_MATCHED');
 assert.equal(r.sourceDirty,true);assert.equal(r.ownerWorkByteReplayVerified,true);assert.equal(r.archivedDirtyCount,6);
 assert.equal(r.supplementDirtyCount,2);assert.equal(r.filesVerified,8);assert.equal(r.formalCleanPass,false);
 assert.equal(r.deployed,false);assert.equal(r.releaseAuthorized,false);assert.equal(r.sourceCurrent,'UNKNOWN');
 assert.equal(r.originalArchiveTarAttested,false);assert.equal(r.dirtyInventoryExhaustiveAttested,false);
 }finally{clean(f);}
});
test('RED: live source drifts after private staging',()=>{
 const f=fixture();try{fs.appendFileSync(path.join(f.args.liveRoot,'smart-build.sh'),'changed\n');expectBlocked(verifyOwnerDirtyByteReplay(f.args));}finally{clean(f);}
});
test('RED: copy drifts after snapshot despite correct filenames',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.args.archiveRestoreRoot,'docker-compose.yml'),'different\n');expectBlocked(verifyOwnerDirtyByteReplay(f.args));}finally{clean(f);}
});
test('RED: cannot verify by names alone with dishonest hashes',()=>{
 const f=fixture();try{f.args.dirtyFiles[0].sha256='f'.repeat(64);expectBlocked(verifyOwnerDirtyByteReplay(f.args));}finally{clean(f);}
});
test('RED: owner file mode changes are not ignored',()=>{
 const f=fixture();try{fs.chmodSync(path.join(f.args.privateSupplementRoot,'smart-build.sh'),0o644);expectBlocked(verifyOwnerDirtyByteReplay(f.args));}finally{clean(f);}
});
test('RED: missing dirty path is not silently treated as recoverable',()=>{
 const f=fixture();try{f.args.supplementDirtyPaths.pop();expectBlocked(verifyOwnerDirtyByteReplay(f.args));}finally{clean(f);}
});
test('RED: duplicated, unexpected or overlapping path classifications are rejected',()=>{
 const f=fixture();try{f.args.supplementDirtyPaths.push('docker-compose.yml');expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 f.args.supplementDirtyPaths.pop();f.args.archiveDirtyPaths.push(f.args.archiveDirtyPaths[0]);expectBlocked(verifyOwnerDirtyByteReplay(f.args));}finally{clean(f);}
});
test('RED: traversal and absolute or malformed relative paths fail without reading outside root',()=>{
 const f=fixture();try{for(const name of ['../secret','.//broken','/etc/passwd','scripts/../passwd','bad\\path','scripts//oops']){
  f.args.dirtyFiles[0].path=name;expectBlocked(verifyOwnerDirtyByteReplay(f.args));}
 }finally{clean(f);}
});
test('RED: symlink leaf inside supplement does not read external bytes',()=>{
 const f=fixture(),secret=temp();try{const file=path.join(f.args.privateSupplementRoot,'smart-build.sh');
 fs.unlinkSync(file);const other=path.join(secret,'other');fs.writeFileSync(other,'PRIVATE USER SECRET');fs.symlinkSync(other,file);
 const r=verifyOwnerDirtyByteReplay(f.args);expectBlocked(r);assert.equal(JSON.stringify(r).includes('PRIVATE USER SECRET'),false);
 }finally{clean(f);fs.rmSync(secret,{recursive:true,force:true});}
});
test('RED: symlink parent inside extracted owner tree rejected',()=>{
 const f=fixture();try{const from=path.join(f.args.archiveRestoreRoot,'scripts'),to=path.join(f.root,'outside');
 fs.renameSync(from,to);fs.symlinkSync(to,from);expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 }finally{clean(f);}
});
test('RED: private supplement stage must be owner private and distinct from live root',()=>{
 const f=fixture();try{fs.chmodSync(f.args.privateSupplementRoot,0o755);expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 fs.chmodSync(f.args.privateSupplementRoot,0o700);
 f.args.privateSupplementRoot=f.args.liveRoot;expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 }finally{clean(f);}
});
test('RED: dirty flag false, mismatched source HEAD and count cannot be promoted to green',()=>{
 const f=fixture();try{f.args.sourceDirty=false;expectBlocked(verifyOwnerDirtyByteReplay(f.args));f.args.sourceDirty=true;
 f.args.sourceHead='zzz';expectBlocked(verifyOwnerDirtyByteReplay(f.args));f.args.sourceHead='a'.repeat(40);
 f.args.expectedDirtyCount=7;expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 }finally{clean(f);}
});
test('RED: hardlinked source leaf and oversized user file fail',()=>{
 const f=fixture();try{const target=path.join(f.args.liveRoot,'smart-build.sh');fs.linkSync(target,path.join(f.args.liveRoot,'duplicate'));
 expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 fs.unlinkSync(path.join(f.args.liveRoot,'duplicate'));
 f.args.dirtyFiles[0].sha256='0'.repeat(64);expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 }finally{clean(f);}
});
test('RED: outputs never contain source paths, owner file contents or secret hashes',()=>{
 const f=fixture();try{const r=verifyOwnerDirtyByteReplay(f.args);const serialized=JSON.stringify(r);
 for(const item of f.values){assert.equal(serialized.includes(item.path),false);assert.equal(serialized.includes(item.contents.trim()),false);}
 assert.equal(serialized.includes(f.args.sourceHead),false);
 }finally{clean(f);}
});
test('RED: invalid dirty-flag input must not be echoed as an asserted dirty-source fact',()=>{
 const f=fixture();try{f.args.sourceDirty=false;const r=verifyOwnerDirtyByteReplay(f.args);
  assert.equal(r.ownerWorkByteReplayVerified,false);
  assert.notEqual(r.sourceDirty,true);
  assert.equal(r.formalCleanPass,false);
 }finally{clean(f);}
});
test('RED: restoring from a descendant of live root is not independent recovery',()=>{
 const f=fixture();try{
  f.args.archiveRestoreRoot=path.join(f.args.liveRoot,'staged');
  fs.mkdirSync(f.args.archiveRestoreRoot);
  expectBlocked(verifyOwnerDirtyByteReplay(f.args));
 }finally{clean(f);}
});
