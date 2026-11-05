'use strict';
/**
 * Read-only, byte-exact comparison of an explicitly inventoried dirty source
 * checkout with TWO existing disposable recovery roots (archive + supplement).
 *
 * This module cannot establish the completeness of the caller's Git inventory,
 * the original tar's authenticity, Docker/host recovery, current source SHA,
 * or owner authorization to deploy. It deliberately never declares cutover GO.
 * No subprocess, Git command, tar extraction, shell, network, writes, secrets,
 * filenames, paths, hashes, or raw contents appear in its response.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const SHA=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const MAX_FILE=32*1024*1024;
const MAX_FILES=256;
const MAX_TOTAL=256*1024*1024;
const FLAGS=Object.freeze({
 sourceDirty:null,formalCleanPass:false,releaseAuthorized:false,
 productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
 sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN',
 originalArchiveTarAttested:false,dirtyInventoryExhaustiveAttested:false,
 secureNonrootCandidateRestoreAttested:false,originFiveAfterAttested:false
});
function blocked(code='OWNER_DIRTY_BYTE_REPLAY_BLOCKED'){
 return Object.freeze({code,ownerWorkByteReplayVerified:false,filesVerified:0,
  ...FLAGS});
}
function exact(obj,keys){
 try{return !!obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.getPrototypeOf(obj)===Object.prototype&&Reflect.ownKeys(obj).length===keys.length&&
  keys.every(key=>{
   const d=Object.getOwnPropertyDescriptor(obj,key);
   return !!d&&Object.hasOwn(d,'value');
  });}catch{return false;}
}
function safeRelative(value){
 return typeof value==='string'&&value.length>=1&&value.length<=512&&
  !value.startsWith('/')&&!value.endsWith('/')&&!value.includes('\\')&&
  !/[\x00-\x1f\x7f]/.test(value)&&path.posix.normalize(value)===value&&
  value.split('/').every(part=>part.length>0&&part!=='.'&&part!=='..');
}
function inspectRoot(root,privateOnly){
 if(typeof root!=='string'||root.length>2048||!path.isAbsolute(root)||
  root==='/'||root.endsWith('/')||path.normalize(root)!==root||
  /[\x00-\x1f\x7f]/.test(root))return null;
 try{
  const before=fs.lstatSync(root,{bigint:true});
  if(!before.isDirectory()||before.isSymbolicLink()||
     (privateOnly&&(before.mode&0o777n)!==0o700n)||
     (typeof process.getuid==='function'&&before.uid!==BigInt(process.getuid())))return null;
  const real=fs.realpathSync(root);
  const after=fs.lstatSync(real,{bigint:true});
  if(!after.isDirectory()||after.isSymbolicLink()||before.dev!==after.dev||before.ino!==after.ino)return null;
  return {root,real};
 }catch{return null;}
}
function overlaps(a,b){
 const rel=path.relative(a,b);
 return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));
}
function sameFile(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&a.uid===b.uid&&
  a.mode===b.mode&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
function hashOwnerFile(root,rel,expected){
 let file=root;
 const parts=rel.split('/');
 for(let i=0;i<parts.length;i++){
  file=path.join(file,parts[i]);
  const st=fs.lstatSync(file,{bigint:true});
  if(st.isSymbolicLink())throw Error('UNSAFE');
  if(i<parts.length-1){if(!st.isDirectory())throw Error('UNSAFE');}
  else if(!st.isFile()||st.nlink!==1n||st.size>BigInt(MAX_FILE)||
    (st.mode&0o777n)!==BigInt(expected.mode)||
    (typeof process.getuid==='function'&&st.uid!==BigInt(process.getuid())))throw Error('UNSAFE');
 }
 let fd;
 try{
  const a=fs.lstatSync(file,{bigint:true});
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  const b=fs.fstatSync(fd,{bigint:true});
  if(!sameFile(a,b)||b.size<0n||b.size>BigInt(MAX_FILE))throw Error('UNSAFE');
  const hash=crypto.createHash('sha256');const buf=Buffer.alloc(64*1024);let n=0;
  for(;;){const count=fs.readSync(fd,buf,0,buf.length,null);if(!count)break;
   n+=count;if(n>MAX_FILE)throw Error('UNSAFE');hash.update(buf.subarray(0,count));}
  const c=fs.fstatSync(fd,{bigint:true}),d=fs.lstatSync(file,{bigint:true});
  if(!sameFile(b,c)||!sameFile(c,d)||BigInt(n)!==c.size||
    hash.digest('hex')!==expected.sha256)throw Error('MISMATCH');
  return n;
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function verifyOwnerDirtyByteReplay({
 sourceDirty,sourceHead,expectedDirtyCount,dirtyFiles,
 archiveDirtyPaths,supplementDirtyPaths,liveRoot,archiveRestoreRoot,privateSupplementRoot
}={}){
 if(sourceDirty!==true||!GIT_SHA.test(sourceHead)||
  !Number.isSafeInteger(expectedDirtyCount)||expectedDirtyCount<1||expectedDirtyCount>MAX_FILES||
  !Array.isArray(dirtyFiles)||dirtyFiles.length!==expectedDirtyCount||
  !Array.isArray(archiveDirtyPaths)||!Array.isArray(supplementDirtyPaths)||
  dirtyFiles.length>MAX_FILES)return blocked('OWNER_DIRTY_BYTE_REPLAY_INPUT_INVALID');
 const expected=new Map();let sourceBudget=0;
 for(const r of dirtyFiles){
  if(!exact(r,['path','sha256','mode'])||!safeRelative(r.path)||
    !SHA.test(r.sha256)||!Number.isInteger(r.mode)||r.mode<0||r.mode>0o777||
    expected.has(r.path))return blocked('OWNER_DIRTY_BYTE_REPLAY_INPUT_INVALID');
  expected.set(r.path,r);
 }
 if(archiveDirtyPaths.length+supplementDirtyPaths.length!==dirtyFiles.length||
    supplementDirtyPaths.length===0||archiveDirtyPaths.length===0)return blocked('OWNER_DIRTY_BYTE_REPLAY_INPUT_INVALID');
 const channels=new Map();
 for(const [kind,items] of [['archive',archiveDirtyPaths],['supplement',supplementDirtyPaths]]){
  for(const p of items){
   if(!safeRelative(p)||channels.has(p)||!expected.has(p))return blocked('OWNER_DIRTY_BYTE_REPLAY_INPUT_INVALID');
   channels.set(p,kind);
  }
 }
 if(channels.size!==expected.size)return blocked('OWNER_DIRTY_BYTE_REPLAY_INPUT_INVALID');
 const live=inspectRoot(liveRoot,false),archive=inspectRoot(archiveRestoreRoot,false),
  supplement=inspectRoot(privateSupplementRoot,true);
 if(!live||!archive||!supplement||
    overlaps(live.real,archive.real)||overlaps(archive.real,live.real)||
    overlaps(live.real,supplement.real)||overlaps(supplement.real,live.real)||
    overlaps(archive.real,supplement.real)||overlaps(supplement.real,archive.real))
  return blocked('OWNER_DIRTY_BYTE_REPLAY_ROOTS_UNSAFE');
 try{
  for(const [rel,r] of expected){
   const liveBytes=hashOwnerFile(live.root,rel,r);
   const restore=channels.get(rel)==='archive'?archive.root:supplement.root;
   const restoredBytes=hashOwnerFile(restore,rel,r);
   if(liveBytes!==restoredBytes)return blocked('OWNER_DIRTY_BYTE_REPLAY_MISMATCH');
   sourceBudget+=liveBytes+restoredBytes;
   if(sourceBudget>MAX_TOTAL)return blocked('OWNER_DIRTY_BYTE_REPLAY_BUDGET_EXCEEDED');
  }
 }catch{return blocked('OWNER_DIRTY_BYTE_REPLAY_MISMATCH');}
 // This proves ONLY bytes and modes across explicitly named files. It does not
 // verify that these were ALL dirty paths, that extracted bytes came from the
 // recorded tar, or that the secure nonroot candidate can be restored.
 return Object.freeze({
  code:'OWNER_DIRTY_BYTE_REPLAY_MATCHED',ownerWorkByteReplayVerified:true,
  dirtyCount:dirtyFiles.length,archivedDirtyCount:archiveDirtyPaths.length,
  supplementDirtyCount:supplementDirtyPaths.length,filesVerified:dirtyFiles.length,
  ...FLAGS,sourceDirty:true
 });
}
module.exports={verifyOwnerDirtyByteReplay};
