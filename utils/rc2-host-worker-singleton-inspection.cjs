'use strict';
/**
 * Read-only evidence about the host worker's crash-durable singleton.
 * Does not infer worker process identity from a PID, kill/restart a process,
 * delete a lock, inspect secrets, touch Docker, or make a recovery decision.
 * PID liveness is dependency-injected: this module NEVER probes the host.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');

const LOCK='host-worker-singleton.lock';
const PROTOCOL='DEVPROXY_HOST_WORKER_V1';
const MAX_BYTES=256;
const MAX_PID=2147483647;
function result(code){
 return Object.freeze({code,workerRunningVerified:false,durableSupervisorVerified:false,
  ownerMacAttested:false,productionChangeAuthorized:false,readOnly:true});
}
const UNSAFE='WORKER_SINGLETON_UNSAFE';
function validPath(p){
 return typeof p==='string'&&p.length>1&&p[0]==='/'&&p!=='/'&&
  !p.endsWith('/')&&path.posix.normalize(p)===p&&
  !/[\x00-\x1f\x7f]/.test(p);
}
function same(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
  a.mode===b.mode&&a.uid===b.uid&&a.gid===b.gid&&
  a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs;
}
function privateDirStat(st){
 return st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077n)===0n&&
  (typeof process.getuid!=='function'||st.uid===BigInt(process.getuid()));
}
function lockStat(st){
 return st.isFile()&&!st.isSymbolicLink()&&st.nlink===1n&&
  (st.mode&0o777n)===0o600n&&st.size>0n&&
  st.size<=BigInt(MAX_BYTES)&&
  (typeof process.getuid!=='function'||st.uid===BigInt(process.getuid()));
}
function parseLock(data){
 let obj;
 try{obj=JSON.parse(data.toString('utf8'));}catch{return null;}
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||
  Object.getPrototypeOf(obj)!==Object.prototype)return null;
 const keys=Object.keys(obj);
 if(keys.length!==2||!keys.includes('protocol')||!keys.includes('pid')||
  obj.protocol!==PROTOCOL||!Number.isSafeInteger(obj.pid)||
  obj.pid<1||obj.pid>MAX_PID)return null;
 return obj.pid;
}
async function inspectHostWorkerSingleton({leaseDirectory,isPidAlive}={}){
 if(!validPath(leaseDirectory))return result(UNSAFE);
 let directory;
 try{
  directory=await fs.lstat(leaseDirectory,{bigint:true});
  if(!privateDirStat(directory)||await fs.realpath(leaseDirectory)!==leaseDirectory)
   return result(UNSAFE);
 }catch{return result(UNSAFE);}
 const file=path.join(leaseDirectory,LOCK);
 let stat;
 try{stat=await fs.lstat(file,{bigint:true});}
 catch(e){return result(e?.code==='ENOENT'?'WORKER_SINGLETON_ABSENT':UNSAFE);}
 if(!lockStat(stat))return result(UNSAFE);
 let fd;
 try{
  fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const before=await fd.stat({bigint:true});
  if(!lockStat(before)||!same(stat,before))return result(UNSAFE);
  const bytes=await fd.readFile();
  const after=await fd.stat({bigint:true});
  const named=await fs.lstat(file,{bigint:true});
  const directoryAfter=await fs.lstat(leaseDirectory,{bigint:true});
  if(!same(before,after)||!same(after,named)||!same(directory,directoryAfter)||
   BigInt(bytes.length)!==after.size)return result(UNSAFE);
  const pid=parseLock(bytes);
  if(pid===null)return result(UNSAFE);
  if(typeof isPidAlive!=='function')return result('WORKER_SINGLETON_PID_UNVERIFIED');
  let alive;
  try{alive=await isPidAlive(pid);}
  catch{return result('WORKER_SINGLETON_PID_UNVERIFIED');}
  if(alive===false)return result('WORKER_SINGLETON_CRASH_QUARANTINE');
  if(alive===true)return result('WORKER_SINGLETON_PID_PRESENT_UNVERIFIED');
  return result('WORKER_SINGLETON_PID_UNVERIFIED');
 }catch{return result(UNSAFE);}
 finally{if(fd)await fd.close();}
}
module.exports={inspectHostWorkerSingleton};
