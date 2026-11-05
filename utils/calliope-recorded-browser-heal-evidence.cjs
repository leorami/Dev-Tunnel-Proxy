'use strict';
/**
 * Pure evaluator for already-recorded browser evidence, NOT a browser runner.
 * Does not access filesystem, network, Docker, secrets, approval, or host state.
 * A matching before/after trace is evidence to review, NOT live attestation,
 * proof of installed healing, or authorization to mutate a configuration.
 */
const crypto=require('node:crypto');
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const RESERVED=new Set(['devproxy','admin','status','reports','dashboard','health','api']);
const CAPTURE=/^[0-9a-f]{32}$/;
const JS_MIME=/^(?:application|text)\/javascript(?:; charset=utf-8)?$/i;
const REDIRECT=new Set([301,302,303,307,308]);
function exact(value,keys){
 if(value===null||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)!==Object.prototype)return false;
 const own=Reflect.ownKeys(value);
 return own.length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&
   Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}
function validAsset(path,route){
 if(typeof path!=='string'||path.length>255)return false;
 const prefix=`/${route}/_next/static/`;
 if(!path.startsWith(prefix))return false;
 const rest=path.slice(prefix.length),segments=rest.split('/');
 if(segments.length>10||segments.some(x=>!x||x==='.'||x==='..'||!/^[a-zA-Z0-9._-]{1,80}$/.test(x)))return false;
 return /\.js$/.test(segments.at(-1));
}
function validResponse(response,route){
 return exact(response,['path','status','location','contentType'])&&
   validAsset(response.path,route)&&
   Number.isSafeInteger(response.status)&&response.status>=100&&response.status<=599&&
   (response.location===null||validAsset(response.location,route))&&
   (response.contentType===null||(typeof response.contentType==='string'&&
    response.contentType.length<=80&&/^[a-zA-Z0-9/+;= ._-]+$/.test(response.contentType)));
}
function validCapture(record,route){
 return exact(record,['captureId','assetPath','responses','browserError','consoleErrors'])&&
   typeof record.captureId==='string'&&CAPTURE.test(record.captureId)&&
   validAsset(record.assetPath,route)&&
   Array.isArray(record.responses)&&record.responses.length>=1&&record.responses.length<=16&&
   record.responses.every(r=>validResponse(r,route))&&
   (record.browserError===null||record.browserError==='ERR_TOO_MANY_REDIRECTS')&&
   Array.isArray(record.consoleErrors)&&record.consoleErrors.length<=8&&
   record.consoleErrors.every(e=>typeof e==='string'&&e.length<=128&&
      !/[\u0000-\u001f\u007f]/.test(e));
}
const outcome=(status,extra={})=>Object.freeze({
 status,healingPerformed:false,ownerApprovalGranted:false,
 liveAttested:false,releaseGateSatisfied:false,networkTransferAuthorized:false,...extra
});
function beforeCycled(record){
 if(record.browserError!=='ERR_TOO_MANY_REDIRECTS'||record.responses.length<3)return false;
 const seen=new Set();
 let loop=false;
 for(let i=0;i<record.responses.length;i++){
  const current=record.responses[i];
  if(!REDIRECT.has(current.status)||!current.location)return false;
  if(i+1<record.responses.length&&current.location!==record.responses[i+1].path)return false;
  if(seen.has(current.path))loop=true;
  seen.add(current.path);
 }
 return loop&&record.responses[0].path===record.assetPath;
}
function afterServed(record){
 if(record.browserError!==null||record.consoleErrors.length>0||
    record.responses.length>8||record.responses[0].path!==record.assetPath)return false;
 const seen=new Set();
 for(let i=0;i<record.responses.length;i++){
  const r=record.responses[i];
  if(seen.has(r.path))return false;
  seen.add(r.path);
  if(i===record.responses.length-1){
    return r.status===200&&r.location===null&&typeof r.contentType==='string'&&
      JS_MIME.test(r.contentType);
  }
  if(!REDIRECT.has(r.status)||!r.location||r.location!==record.responses[i+1].path||
     r.contentType!==null)return false;
 }
 return false;
}
function assessRecordedBrowserHealEvidence(input){
 if(!exact(input,['route','before','after'])||typeof input.route!=='string'||
    (!ROUTE.test(input.route)||RESERVED.has(input.route))||!validCapture(input.before,input.route)||
    !validCapture(input.after,input.route))return outcome('INVALID_RECORDED_BROWSER_EVIDENCE');
 const {before,after}=input;
 const broken=beforeCycled(before);
 const healthy=afterServed(after);
 if(before.captureId===after.captureId||before.assetPath!==after.assetPath||
    !broken||!healthy)return outcome('RECORDED_EVIDENCE_INSUFFICIENT');
 const evidenceDigest=crypto.createHash('sha256').update(JSON.stringify([
  input.route,before,after
 ])).digest('hex');
 return outcome('RECORDED_REPAIR_NEEDS_LIVE_ATTESTATION',{
   beforeLoopObserved:true,afterJsServed:true,evidenceDigest
 });
}
module.exports={assessRecordedBrowserHealEvidence};
