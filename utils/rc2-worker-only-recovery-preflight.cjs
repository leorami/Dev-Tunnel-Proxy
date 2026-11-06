'use strict';
/**
 * Read-only DOUBLE-SAMPLED Mac host-worker crash-lock recovery preflight.
 * No unlink, process signal, Docker, credentials, server start or owner action.
 * Callbacks MUST be wired to independent trusted Mac read-only probes; their
 * results are NOT themselves a release grant or an atomic unlink capability.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {inspectHostWorkerSingleton}=require('./rc2-host-worker-singleton-inspection.cjs');
const SPOOL_LEAVES=Object.freeze(['requests','responses','prepared','acks','replay']);
const LOCK='host-worker-singleton.lock';
const CODES=Object.freeze({
 SATISFIED:'WORKER_ONLY_PREFLIGHT_SATISFIED',
 BLOCKED:'WORKER_ONLY_PREFLIGHT_BLOCKED',
 UNSAFE:'WORKER_ONLY_PREFLIGHT_UNSAFE',
 UNVERIFIED:'WORKER_ONLY_PREFLIGHT_UNVERIFIED'
});
function result(code){return Object.freeze({code,lockCleared:false,workerStarted:false,
 productionChangeAuthorized:false,ownerMacAttested:false,operatorRecheckRequired:true});}
function pathOK(p){
 return typeof p==='string'&&p.startsWith('/')&&p.length>1&&p!=='/'&&
  !p.endsWith('/')&&path.posix.normalize(p)===p&&!/[\x00-\x1f\x7f]/.test(p);
}
function inside(a,b){return a===b||a.startsWith(b+'/');}
function same(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&a.gid===b.gid&&
  a.mode===b.mode&&a.nlink===b.nlink&&a.size===b.size&&
  a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
async function privateDir(directory){
 const st=await fs.lstat(directory,{bigint:true});
 if(!st.isDirectory()||st.isSymbolicLink()||
   (st.mode&0o777n)!==0o700n||
   (typeof process.getuid==='function'&&st.uid!==BigInt(process.getuid()))||
   await fs.realpath(directory)!==directory)throw Error('UNSAFE_PRIVATE_DIRECTORY');
 return st;
}
async function snapshot(spoolDirectory,leaseDirectory){
 await privateDir(spoolDirectory);await privateDir(leaseDirectory);
 for(const name of SPOOL_LEAVES){
  const d=path.join(spoolDirectory,name);
  await privateDir(d);
  if((await fs.readdir(d)).length!==0)return {code:CODES.BLOCKED};
 }
 const replay=path.join(leaseDirectory,'replay');
 await privateDir(replay);
 if((await fs.readdir(replay)).length!==0)return {code:CODES.BLOCKED};
 const leaseNames=(await fs.readdir(leaseDirectory)).sort();
 if(leaseNames.length!==2||leaseNames[0]!==LOCK||leaseNames[1]!=='replay')
  return {code:CODES.BLOCKED};
 const file=path.join(leaseDirectory,LOCK);
 const st=await fs.lstat(file,{bigint:true});
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||
   (st.mode&0o777n)!==0o600n||
   (typeof process.getuid==='function'&&st.uid!==BigInt(process.getuid()))||
   st.size<1n||st.size>256n||await fs.realpath(file)!==file)
  return {code:CODES.UNSAFE};
 return {code:CODES.SATISFIED,lockStat:st};
}
/**
 * A POSITIVE result only means all supplied READ-ONLY facts agreed twice.
 * The trusted operator must re-attest identity/queue immediately before
 * the one explicitly owner-authorized stale-lock disposition.
 */
async function inspectWorkerOnlyRecoveryPreflight({
 spoolDirectory,leaseDirectory,isPidAlive,countWorkers,attestPin
}={}){
 if(!pathOK(spoolDirectory)||!pathOK(leaseDirectory)||
  inside(spoolDirectory,leaseDirectory)||inside(leaseDirectory,spoolDirectory)||
  typeof isPidAlive!=='function'||typeof countWorkers!=='function'||
  typeof attestPin!=='function')return result(CODES.UNVERIFIED);
 try{
  let firstLock=null;
  for(let pass=0;pass<2;pass++){
   const status=await inspectHostWorkerSingleton({leaseDirectory,isPidAlive});
   if(status.code==='WORKER_SINGLETON_UNSAFE')return result(CODES.UNSAFE);
   if(status.code!=='WORKER_SINGLETON_CRASH_QUARANTINE')return result(CODES.BLOCKED);
   const s=await snapshot(spoolDirectory,leaseDirectory);
   if(s.code!==CODES.SATISFIED)return result(s.code);
   if(firstLock&&!same(firstLock,s.lockStat))return result(CODES.UNSAFE);
   firstLock=s.lockStat;
   const count=await countWorkers(),pin=await attestPin();
   if(!Number.isSafeInteger(count)||count<0||typeof pin!=='boolean')
    return result(CODES.UNVERIFIED);
   if(count!==0||pin!==true)return result(CODES.BLOCKED);
  }
  return result(CODES.SATISFIED);
 }catch{return result(CODES.UNSAFE);}
}
module.exports={inspectWorkerOnlyRecoveryPreflight};
