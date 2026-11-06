'use strict';
/**
 * READ-ONLY source and private-path review for a possible future per-user
 * launchd cutover. It does NOT install/stop/start a worker or attest the Mac.
 * Paths are caller supplied; digests MUST originate from an independently
 * reviewed, immutable owner-accepted binary and worker executable.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const FIELDS=Object.freeze(['nodeExecutable','productRoot','privatePinFile',
 'privateLogDirectory','reviewedNodeSha256','reviewedWorkerSha256']);
const WORKER='scripts/rc2-supervised-mac-host-worker.cjs';
const LOGS=Object.freeze(['host-worker.out.log','host-worker.err.log']);
const HASH=/^[a-f0-9]{64}$/;
function result(code){return Object.freeze({code,readOnly:true,installed:false,
 installationAuthorized:false,macProcessAttested:false,workerRunningVerified:false,
 requiresSeparateOwnerGrant:true});}
function plainExact(o){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const keys=Reflect.ownKeys(o);
 return keys.length===FIELDS.length&&FIELDS.every(k=>{
  const d=Object.getOwnPropertyDescriptor(o,k);
  return d&&Object.hasOwn(d,'value')&&typeof d.value==='string';
 });
}
function inside(a,b){return a===b||a.startsWith(b+'/');}
function safePath(v){return v.length>1&&v.length<=1024&&v.startsWith('/')&&
 v!=='/'&&!v.endsWith('/')&&path.posix.normalize(v)===v&&
 !/[\x00-\x1f\x7f]/.test(v);}
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&
 a.gid===b.gid&&a.nlink===b.nlink&&a.mode===b.mode&&a.size===b.size&&
 a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function uidOk(st,allowRoot=false){
 return typeof process.getuid!=='function'||st.uid===BigInt(process.getuid())||
  (allowRoot&&st.uid===0n);
}
async function trustedDir(dir,{privateOnly=false,allowRoot=false}={}){
 const a=await fs.lstat(dir,{bigint:true});
 if(!a.isDirectory()||a.isSymbolicLink()||!uidOk(a,allowRoot)||
  (privateOnly?(a.mode&0o777n)!==0o700n:(a.mode&0o022n)!==0n)||
  await fs.realpath(dir)!==dir)throw Error('UNSAFE_DIRECTORY');
 const b=await fs.lstat(dir,{bigint:true});
 if(!same(a,b))throw Error('DIRECTORY_CHANGED');
}
async function reviewedFile(file,{privateOnly=false,execRequired=false,allowRoot=false,
 reviewedSha256,limit=8*1024*1024}={}){
 const a=await fs.lstat(file,{bigint:true});
 if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||!uidOk(a,allowRoot)||
  a.size<1n||a.size>BigInt(limit)||
  (privateOnly?(a.mode&0o777n)!==0o600n:(a.mode&0o022n)!==0n)||
  (execRequired&&(a.mode&0o111n)===0n)||
  await fs.realpath(file)!==file)throw Error('UNSAFE_FILE');
 if(!reviewedSha256){
  const again=await fs.lstat(file,{bigint:true});
  if(!same(a,again))throw Error('FILE_CHANGED');
  return;
 }
 const h=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await h.stat({bigint:true});
  if(!before.isFile()||!same(a,before))throw Error('FILE_CHANGED');
  const digest=createHash('sha256');let size=0;
  for await(const bytes of h.createReadStream({autoClose:false,highWaterMark:65536})){
   size+=bytes.length;
   if(size>limit)throw Error('UNSAFE_FILE');
   digest.update(bytes);
  }
  const after=await h.stat({bigint:true});
  const named=await fs.lstat(file,{bigint:true});
  if(!same(before,after)||!same(after,named)||BigInt(size)!==after.size||
     digest.digest('hex')!==reviewedSha256)throw Error('FILE_IDENTITY_MISMATCH');
 }finally{await h.close();}
}
async function inspectWorkerLaunchAgentPathProvenance(input={}){
 if(!plainExact(input))return result('LAUNCHAGENT_SOURCE_UNVERIFIED');
 const {nodeExecutable,productRoot,privatePinFile,privateLogDirectory,
  reviewedNodeSha256,reviewedWorkerSha256}=input;
 if([nodeExecutable,productRoot,privatePinFile,privateLogDirectory].some(x=>!safePath(x))||
  !HASH.test(reviewedNodeSha256)||!HASH.test(reviewedWorkerSha256)||
  path.posix.basename(nodeExecutable)!=='node')return result('LAUNCHAGENT_SOURCE_UNVERIFIED');
 if(inside(nodeExecutable,productRoot)||inside(productRoot,nodeExecutable)||
   inside(privatePinFile,productRoot)||inside(privateLogDirectory,productRoot)||
   inside(privatePinFile,privateLogDirectory)||inside(privateLogDirectory,privatePinFile))
  return result('LAUNCHAGENT_PATH_TRUST_BLOCKED');
 const worker=path.join(productRoot,WORKER);
 try{
  await trustedDir(path.dirname(nodeExecutable),{allowRoot:true});
  await reviewedFile(nodeExecutable,{execRequired:true,allowRoot:true,
   reviewedSha256:reviewedNodeSha256,limit:256*1024*1024});
  await trustedDir(productRoot);
  await trustedDir(path.join(productRoot,'scripts'));
  await reviewedFile(worker,{reviewedSha256:reviewedWorkerSha256});
  await trustedDir(path.dirname(privatePinFile),{privateOnly:true});
  // Sensitive bytes are NEVER read: only owner, mode and inode are inspected.
  await reviewedFile(privatePinFile,{privateOnly:true});
  await trustedDir(privateLogDirectory,{privateOnly:true});
  for(const name of LOGS){
   const file=path.join(privateLogDirectory,name);
   try{await reviewedFile(file,{privateOnly:true});}
   catch(e){if(e?.code!=='ENOENT')throw e;}
  }
  return result('LAUNCHAGENT_PATHS_REVIEWED_SOURCE_ONLY');
 }catch{return result('LAUNCHAGENT_PATH_TRUST_BLOCKED');}
}
module.exports={inspectWorkerLaunchAgentPathProvenance};
