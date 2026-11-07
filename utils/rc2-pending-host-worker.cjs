'use strict';
/**
 * Mac host-only queue selector for the actual v13 HMAC settlement worker.
 * Skip historical request IDs ONLY after a durable 0600 response is observed.
 * Replays without response are CRASH-QUARANTINED, never auto-retired, retried,
 * or bypassed to operate on newer IDs. This prevents an ongoing service from
 * incorrectly processing completed requests every poll interval.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const NONCE=/^[a-f0-9]{32,64}$/;
function valid(p){return typeof p==='string'&&p.startsWith('/')&&p!=='/'&&
 !p.endsWith('/')&&path.posix.normalize(p)===p&&!p.includes('\0');}
async function privateDir(p){
 let s;
 try{s=await fs.lstat(p,{bigint:true});}catch{throw Error('HOST_WORKER_UNSAFE_QUEUE');}
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077n)!==0n||
  (typeof process.getuid==='function'&&s.uid!==BigInt(process.getuid()))||
  await fs.realpath(p)!==p)throw Error('HOST_WORKER_UNSAFE_QUEUE');
}
async function existence(file){
 let s;
 try{s=await fs.lstat(file,{bigint:true});}catch(e){
  if(e?.code==='ENOENT')return false;throw Error('HOST_WORKER_UNSAFE_QUEUE');
 }
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size<1n||s.size>2048n||
  (s.mode&0o777n)!==0o600n||
  (typeof process.getuid==='function'&&s.uid!==BigInt(process.getuid())))
  throw Error('HOST_WORKER_UNSAFE_QUEUE');
 return true;
}
function createPendingOnlyHostWorker({spoolDirectory,leaseDirectory,worker}={}){
 if(!valid(spoolDirectory)||!valid(leaseDirectory)||!worker||
  typeof worker.processOne!=='function'||spoolDirectory===leaseDirectory)
  throw Error('HOST_WORKER_INVALID_QUEUE_CONFIG');
 async function scanOnce(){
  const requests=path.join(spoolDirectory,'requests');
  const responses=path.join(spoolDirectory,'responses');
  const replay=path.join(leaseDirectory,'replay');
  for(const p of [spoolDirectory,leaseDirectory,requests,responses,replay])await privateDir(p);
  let names;
  try{names=await fs.readdir(requests);}catch{throw Error('HOST_WORKER_UNSAFE_QUEUE');}
  const ids=names.filter(n=>/^[a-f0-9]{32,64}\.json$/.test(n)).map(n=>n.slice(0,-5)).sort();
  if(ids.length>64)throw Error('HOST_WORKER_QUEUE_LIMIT');
  const outcomes=[];
  for(const id of ids){
   if(!NONCE.test(id))throw Error('HOST_WORKER_UNSAFE_QUEUE');
   if(!await existence(path.join(requests,id+'.json')))throw Error('HOST_WORKER_UNSAFE_QUEUE');
   // No stale reply can prove a new action, but it prevents repeated execution
   // of completed IDs. Any suspicious file type is an immediate NO-GO.
   if(await existence(path.join(responses,id+'.json')))continue;
   if(await existence(path.join(replay,id)))throw Error('HOST_WORKER_UNRESOLVED_REPLAY');
   let result;
   try{result=await worker.processOne(id);}catch{throw Error('HOST_WORKER_INDETERMINATE');}
   // A content-digest refusal is terminal BEFORE settlement.begin or any host
   // action. Do not turn a signed, durable no-action reply into a worker crash.
   // However, a replay marker means begin() may have executed: quarantine.
   const digestMismatch=result?.status==='CONFIG_SET_DIGEST_MISMATCH';
   if(!result||result.code!=='HOST_PROCESSED'||
     !['RELOAD_AND_VERIFICATION_REPORTED','NGINX_VALIDATION_FAILED',
       'CONFIG_SET_DIGEST_MISMATCH'].includes(result.status)||
     !await existence(path.join(responses,id+'.json')))
    throw Error('HOST_WORKER_INDETERMINATE');
   if(digestMismatch&&await existence(path.join(replay,id)))
    throw Error('HOST_WORKER_INDETERMINATE');
   outcomes.push(Object.freeze({code:result.code,status:result.status}));
  }
  return Object.freeze(outcomes);
 }
 return Object.freeze({scanOnce});
}
module.exports={createPendingOnlyHostWorker};
