'use strict';
/**
 * Read-only comparison of a candidate durable worker module on disk to an
 * independently reviewed Git blob. This does NOT prove that a running process
 * loaded these bytes, or that its transitive JS modules are approved.
 * No Docker, worker control, secret/queue reading, or mutation.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const MAX_BYTES=1024*1024;
const NAME='rc2-pending-host-worker.cjs';
function outcome(code){
 return Object.freeze({code,readOnly:true,processIdentityAttested:false,
  liveLoadedCodeVerified:false,productionChangeAuthorized:false,
  ownerInstallAuthorized:false,requiresProcessCorrelation:true});
}
function plainExact(options){
 if(!options||typeof options!=='object'||Array.isArray(options)||
  Object.getPrototypeOf(options)!==Object.prototype)return false;
 const keys=Reflect.ownKeys(options);
 return keys.length===2&&['approvedRoot','reviewedGitBlobSha'].every(k=>{
  const d=Object.getOwnPropertyDescriptor(options,k);
  return d&&Object.hasOwn(d,'value')&&typeof d.value==='string';
 });
}
function validPath(p){
 return p.length>1&&p.length<=1024&&p.startsWith('/')&&p!=='/'&&
  !p.endsWith('/')&&path.posix.normalize(p)===p&&
  !/[\x00-\x1f\x7f]/.test(p);
}
function same(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&a.gid===b.gid&&
  a.nlink===b.nlink&&a.mode===b.mode&&a.size===b.size&&
  a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
function owner(st){return typeof process.getuid!=='function'||
  st.uid===BigInt(process.getuid());}
async function safeDir(p){
 const a=await fs.lstat(p,{bigint:true});
 if(!a.isDirectory()||a.isSymbolicLink()||!owner(a)||
  (a.mode&0o022n)!==0n||await fs.realpath(p)!==p)throw Error('UNSAFE_STAGE_DIR');
 const b=await fs.lstat(p,{bigint:true});
 if(!same(a,b))throw Error('CHANGED_STAGE_DIR');
}
async function inspectReviewedWorkerSourceStage(options={}){
 if(!plainExact(options))return outcome('STAGE_SOURCE_UNVERIFIED');
 const {approvedRoot,reviewedGitBlobSha}=options;
 if(!validPath(approvedRoot)||!/^[a-f0-9]{40}$/.test(reviewedGitBlobSha))
  return outcome('STAGE_SOURCE_UNVERIFIED');
 const utils=path.join(approvedRoot,'utils');
 const file=path.join(utils,NAME);
 let fd;
 try{
  await safeDir(approvedRoot);
  await safeDir(utils);
  const a=await fs.lstat(file,{bigint:true});
  if(!a.isFile()||a.isSymbolicLink()||!owner(a)||a.nlink!==1n||
   (a.mode&0o022n)!==0n||a.size<1n||a.size>BigInt(MAX_BYTES))
   throw Error('UNSAFE_STAGE_MODULE');
  fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const before=await fd.stat({bigint:true});
  if(!same(a,before)||!before.isFile())throw Error('STAGE_FILE_CHANGED');
  const data=await fd.readFile();
  const after=await fd.stat({bigint:true});
  const named=await fs.lstat(file,{bigint:true});
  if(!same(before,after)||!same(after,named)||BigInt(data.length)!==after.size)
   throw Error('STAGE_FILE_CHANGED');
  await safeDir(utils);
  await safeDir(approvedRoot);
  const gitHash=createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
  return outcome(gitHash===reviewedGitBlobSha?
   'REVIEWED_STAGE_MODULE_MATCH':'REVIEWED_STAGE_MODULE_MISMATCH');
 }catch{return outcome('STAGE_SOURCE_UNSAFE');}
 finally{if(fd)await fd.close();}
}
module.exports={inspectReviewedWorkerSourceStage};
