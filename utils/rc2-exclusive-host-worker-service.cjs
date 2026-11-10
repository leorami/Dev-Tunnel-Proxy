'use strict';
/**
 * Explicit Mac-host-only worker supervisor, NOT an installer or a daemon start.
 * The caller must already possess reviewed owner authority and a separately
 * pinned fixed-action worker. One 0600 O_EXCL + fsync singleton makes two Mac
 * processes unable to process different request IDs concurrently. An unclean
 * crash OR indeterminate scan leaves the file in place: no automatic reset.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');
const {setTimeout:delay}=require('node:timers/promises');
const LOCK_NAME='host-worker-singleton.lock';
function validPath(p){return typeof p==='string'&&p.length>1&&p[0]==='/'&&p!=='/'&&
 path.posix.normalize(p)===p&&!p.endsWith('/')&&!p.includes('\0');}
async function privateLease(p){
 if(!validPath(p))throw Error('HOST_WORKER_PRIVATE_LEASE_UNSAFE');
 try{
  const st=await fs.lstat(p,{bigint:true});
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077n)!==0n||
   (typeof process.getuid==='function'&&st.uid!==BigInt(process.getuid()))||
   await fs.realpath(p)!==p)throw Error('HOST_WORKER_PRIVATE_LEASE_UNSAFE');
  return st;
 }catch{throw Error('HOST_WORKER_PRIVATE_LEASE_UNSAFE');}
}
async function syncDirectory(p){const d=await fs.open(p,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await d.sync();}finally{await d.close();}}
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function result(code,count=0){return Object.freeze({code,count,productionChangeAuthorized:false,deployed:false});}
function createExclusiveHostWorkerService({leaseDirectory,worker,pollMs=250,wait=delay}={}){
 if(!validPath(leaseDirectory)||!worker||typeof worker.scanOnce!=='function'||
  !Number.isInteger(pollMs)||pollMs<20||pollMs>10000||typeof wait!=='function')
  throw Error('HOST_WORKER_INVALID_CONFIG');
 const file=path.join(leaseDirectory,LOCK_NAME);
 async function acquire(){
  await privateLease(leaseDirectory);
  let fd;
  try{
   fd=await fs.open(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
   await fd.writeFile(JSON.stringify({protocol:'DEVPROXY_HOST_WORKER_V1',pid:process.pid})+'\n');
   await fd.sync();
   await syncDirectory(leaseDirectory);
   const stat=await fd.stat({bigint:true});
   if(!stat.isFile()||stat.nlink!==1n||(stat.mode&0o777n)!==0o600n)
    throw Error('HOST_WORKER_SINGLETON_UNSAFE');
   return {fd,stat};
  }catch(e){
   if(fd)try{await fd.close();}catch{}
   if(e?.code==='EEXIST')throw Error('HOST_WORKER_ALREADY_ACTIVE');
   if(e?.message==='HOST_WORKER_SINGLETON_UNSAFE')throw e;
   throw Error('HOST_WORKER_SINGLETON_UNSAFE');
  }
 }
 async function release(lock){
  try{
   await privateLease(leaseDirectory);
   const current=await fs.lstat(file,{bigint:true});
   const live=await lock.fd.stat({bigint:true});
   if(!same(lock.stat,current)||!same(lock.stat,live))throw Error('HOST_WORKER_SINGLETON_CHANGED');
   await fs.unlink(file);
   await syncDirectory(leaseDirectory);
  }catch{throw Error('HOST_WORKER_SINGLETON_CHANGED');}
  finally{await lock.fd.close();}
 }
 async function scan(){
  let out;
  try{out=await worker.scanOnce();}catch{throw Error('HOST_WORKER_SCAN_INDETERMINATE');}
  if(!Array.isArray(out)||out.length>256||out.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
    typeof x.code!=='string'||(x.status==='HOST_OPERATION_INDETERMINATE')))
   throw Error('HOST_WORKER_SCAN_INDETERMINATE');
  return out.length;
 }
 async function runOnce(){
  const lock=await acquire();
  let good=false;
  try{
   const count=await scan();good=true;
   return result('HOST_WORKER_SCAN_COMPLETE',count);
  }finally{
   if(good)await release(lock);
   else await lock.fd.close(); // UNRESOLVED: intentional persistent quarantine
  }
 }
 async function runUntilStopped({signal}={}){
  if(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function')
   throw Error('HOST_WORKER_INVALID_SIGNAL');
  if(signal.aborted)return result('HOST_WORKER_STOPPED_CLEANLY');
  const lock=await acquire();
  let good=false,count=0;
  try{
   while(!signal.aborted){
    count+=await scan();
    if(signal.aborted)break;
    try{await wait(pollMs,undefined,{signal});}
    catch(e){if(signal.aborted||e?.name==='AbortError')break;throw Error('HOST_WORKER_SCAN_INDETERMINATE');}
   }
   good=true;return result('HOST_WORKER_STOPPED_CLEANLY',count);
  }finally{
   if(good)await release(lock);
   else await lock.fd.close(); // do not clear a potentially inflight action
  }
 }
 return Object.freeze({runOnce,runUntilStopped});
}
module.exports={createExclusiveHostWorkerService};
