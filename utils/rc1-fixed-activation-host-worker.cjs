'use strict';
/**
 * Explicitly-invoked, fixed-action host worker for the shared bind-mount
 * HMAC transport. Source-only: no process/socket/server is auto-started.
 * Actual approved Docker driver must be provided by the trusted Mac host;
 * the web API and spool input cannot supply shell commands or Docker args.
 * A failed/uncertain reload requires operator investigation, not auto retry.
 */
const {createSpoolHost}=require('./rc1-activation-spool.cjs');
function createFixedActivationHostWorker({directory,approvedRoot,secret,driver,
 verifyActiveRoute,now=Date.now,timeoutMs=12000}={}){
 if(!driver||typeof driver.attest!=='function'||typeof driver.execute!=='function'||
   typeof verifyActiveRoute!=='function'||typeof now!=='function'||
   !Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>20000)
  throw Error('INVALID_FIXED_HOST_WORKER_CONFIG');
 async function executeVerified({expectedCandidateSha256}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  async function bounded(fn){
   if(controller.signal.aborted)throw Error('HOST_DEADLINE_EXPIRED');
   return await new Promise((resolve,reject)=>{
    const onAbort=()=>reject(Error('HOST_DEADLINE_EXPIRED'));
    controller.signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve().then(()=>fn(controller.signal)).then(v=>{
     controller.signal.removeEventListener('abort',onAbort);resolve(v);
    },err=>{controller.signal.removeEventListener('abort',onAbort);reject(err);});
   });
  }
  try{
   if(await bounded(signal=>driver.attest(signal))!==true)return 'BLOCKED_CONTAINER_IDENTITY';
   if(await bounded(signal=>driver.execute('nginx-test',signal))!==0)return 'NGINX_VALIDATION_FAILED';
   if(await bounded(signal=>driver.attest(signal))!==true)return 'BLOCKED_CONTAINER_IDENTITY';
   if(await bounded(signal=>driver.execute('nginx-reload',signal))!==0)return 'NGINX_RELOAD_FAILED';
   if(await bounded(signal=>driver.attest(signal))!==true)return 'BLOCKED_CONTAINER_IDENTITY';
   if(await bounded(signal=>verifyActiveRoute(signal,expectedCandidateSha256))!==true)return 'ACTIVE_ROUTE_UNVERIFIED';
   return 'RELOAD_AND_VERIFICATION_REPORTED';
  }catch{return 'HOST_OPERATION_INDETERMINATE';}
  finally{clearTimeout(timer);}
 }
 return createSpoolHost({directory,approvedRoot,secret,executeVerified,now});
}
module.exports={createFixedActivationHostWorker};
