'use strict';
/**
 * A host-only crash fence for the EXACT fixed nginx validation/reload action.
 * This is not a worker, a listener, a Docker adapter, owner GO, or recovery.
 * It protects cooperating invocations of a separately authorized host worker.
 * Any ambiguous outcome retains a private durable quarantine marker. No
 * code path automatically steals a stale marker, rewrites owner data, or
 * performs Docker operations. Do not install as a service by importing it.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const LEAF='host-operation-inflight';
const VERIFIED=Object.freeze(['status','containerIdentityVerified','activeRouteVerified','candidateDigestVerified']);
function outcome(status){return Object.freeze({status,productionChangeAuthorized:false,liveAttested:false,performedDockerAction:false});}
function validateDirectory(directory){
 return typeof directory==='string'&&path.isAbsolute(directory)&&path.normalize(directory)===directory&&
 directory!=='/'&&!directory.endsWith('/')&&!directory.includes('\0');
}
async function safeDirectory(dir){
 const st=await fs.lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid())||await fs.realpath(dir)!==dir)
   throw Error('HOST_WORKSPACE_UNSAFE');
}
async function syncDirectory(dir){
 const d=await fs.open(dir,'r');
 try{await d.sync();}finally{await d.close();}
}
function trustedVerified(result){
 if(!result||typeof result!=='object'||Array.isArray(result)||Object.getPrototypeOf(result)!==Object.prototype)
  return false;
 const actual=Reflect.ownKeys(result);
 if(actual.length!==VERIFIED.length||actual.some(k=>typeof k!=='string'||!VERIFIED.includes(k)||
    !Object.hasOwn(Object.getOwnPropertyDescriptor(result,k),'value')))return false;
 return result.status==='RELOAD_AND_VERIFICATION_REPORTED'&&result.containerIdentityVerified===true&&
  result.activeRouteVerified===true&&result.candidateDigestVerified===true;
}
function createHostOperationQuarantine({directory,timeoutMs=12000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<25||timeoutMs>20000||!validateDirectory(directory))throw Error('INVALID_HOST_QUARANTINE_CONFIG');
 const markerPath=path.join(directory,LEAF);
 async function run(operation){
  if(typeof operation!=='function')return outcome('HOST_OPERATION_INVALID');
  try{await safeDirectory(directory);}catch{return outcome('HOST_WORKSPACE_UNSAFE');}
  let fd,initial;
  try{
   fd=await fs.open(markerPath,'wx',0o600);
   await fd.writeFile('devproxy-fixed-host-operation-v1\n');
   await fd.sync();
   initial=await fd.stat({bigint:true});
   if(!initial.isFile()||initial.nlink!==1n||(initial.mode&0o777n)!==0o600n)
    throw Error('UNSAFE_INFLIGHT_MARKER');
   await fd.close();fd=null;
   // Durability before any privileged host callback is the security boundary.
   await syncDirectory(directory);
  }catch(e){
   if(fd){try{await fd.close();}catch{}}
   // If the marker was created but persistence failed, NEVER auto-delete it.
   return outcome(e.code==='EEXIST'?'HOST_OPERATION_QUARANTINED':'HOST_OPERATION_INDETERMINATE');
  }
  try{
   const abort=new AbortController();
   let timer;
   const observed=await Promise.race([
     Promise.resolve().then(()=>operation(abort.signal)),
     new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('HOST_DEADLINE_EXPIRED'));},timeoutMs);})
   ]).finally(()=>clearTimeout(timer));
   if(abort.signal.aborted||!trustedVerified(observed))return outcome('HOST_OPERATION_INDETERMINATE');
   const current=await fs.lstat(markerPath,{bigint:true});
   if(!current.isFile()||current.isSymbolicLink()||current.nlink!==1n||
      current.dev!==initial.dev||current.ino!==initial.ino||
      (current.mode&0o777n)!==0o600n)return outcome('HOST_OPERATION_INDETERMINATE');
   await fs.unlink(markerPath);
   await syncDirectory(directory);
   return outcome('VERIFIED_HOST_OPERATION');
  }catch{return outcome('HOST_OPERATION_INDETERMINATE');}
 }
 return Object.freeze({run});
}
module.exports={createHostOperationQuarantine};
