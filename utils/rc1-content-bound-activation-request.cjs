'use strict';
/**
 * Additive v2 HMAC request/reply codec for fixed Dev Proxy activation.
 * This is NOT the live v5 protocol: v5 binds only apps.generated.conf.
 * The v2 envelope binds the whole fixed nginx configuration set digest.
 * An authenticated envelope is NOT owner GO, Docker authority, or a reload.
 */
const crypto=require('node:crypto');
const ACTION='VALIDATE_AND_RELOAD_CONFIG_SET_V2';
const HEX=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32,64}$/;
const STATUSES=new Set([
 'RELOAD_AND_VERIFICATION_REPORTED','BLOCKED_AUTH','BLOCKED_REPLAY',
 'BLOCKED_BUSY','BLOCKED_INVALID_REQUEST','BLOCKED_UNAVAILABLE',
 'BLOCKED_CONTAINER_IDENTITY','NGINX_VALIDATION_FAILED','NGINX_RELOAD_FAILED',
 'ACTIVE_ROUTE_UNVERIFIED','HOST_OPERATION_INDETERMINATE',
 'BLOCKED_QUARANTINED','CONFIG_SET_DIGEST_MISMATCH'
]);
function secretValid(secret){return Buffer.isBuffer(secret)&&secret.length>=32&&secret.length<=128;}
function keysExactly(r,keys){
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.getPrototypeOf(r)!==Object.prototype)return false;
 const found=Reflect.ownKeys(r);
 return found.length===keys.length&&found.every(x=>typeof x==='string'&&keys.includes(x)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(r,x),'value'));
}
function hmac(secret,items){return crypto.createHmac('sha256',secret).update(items.join('\0'),'utf8').digest('hex');}
function requestMAC(secret,r){return hmac(secret,['devproxy-config-set-v2-request',r.type,r.requestId,String(r.ts),r.expectedCandidateSha256]);}
function replyMAC(secret,req,status){return hmac(secret,['devproxy-config-set-v2-reply',req.requestId,req.expectedCandidateSha256,status,'false','false']);}
function compareHex(actual,wanted){
 if(typeof actual!=='string'||!HEX.test(actual)||!HEX.test(wanted))return false;
 return crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(wanted,'hex'));
}
function createSignedCandidateRequest({secret,expectedCandidateSha256,now=Date.now,
 nonce=()=>crypto.randomBytes(16).toString('hex')}={}){
 if(!secretValid(secret)||typeof expectedCandidateSha256!=='string'||!HEX.test(expectedCandidateSha256)||
    typeof now!=='function'||typeof nonce!=='function')throw Error('INVALID_SIGNING_CONFIGURATION');
 const requestId=nonce(),ts=now();
 if(typeof requestId!=='string'||!NONCE.test(requestId)||!Number.isSafeInteger(ts))
  throw Error('INVALID_SIGNING_CONFIGURATION');
 const r={type:ACTION,requestId,ts,expectedCandidateSha256};
 return Object.freeze({...r,mac:requestMAC(secret,r)});
}
function verifySignedCandidateRequest({request,secret,now=Date.now,seenNonces}={}){
 const failed=code=>Object.freeze({ok:false,code});
 if(!secretValid(secret)||typeof now!=='function'||
  !keysExactly(request,['type','requestId','ts','expectedCandidateSha256','mac'])||
  request.type!==ACTION||typeof request.requestId!=='string'||!NONCE.test(request.requestId)||
  !Number.isSafeInteger(request.ts)||!HEX.test(request.expectedCandidateSha256)||!HEX.test(request.mac))
  return failed('INVALID_CONTENT_BOUND_REQUEST');
 const ts=now();
 if(!Number.isSafeInteger(ts)||Math.abs(ts-request.ts)>45000)return failed('STALE_CONTENT_BOUND_REQUEST');
 if(seenNonces&&typeof seenNonces.has==='function'&&seenNonces.has(request.requestId))return failed('CONTENT_BOUND_REPLAY');
 if(!compareHex(request.mac,requestMAC(secret,request)))return failed('CONTENT_BOUND_AUTH_FAILED');
 return Object.freeze({ok:true,code:'CONTENT_BOUND_REQUEST_VERIFIED'});
}
function signCandidateReply({secret,request,status}={}){
 if(!secretValid(secret)||!request||request.type!==ACTION||!NONCE.test(request.requestId||'')||
    !HEX.test(request.expectedCandidateSha256||''))throw Error('INVALID_REPLY_CONFIGURATION');
 if(!STATUSES.has(status))throw Error('INVALID_REPLY_STATUS');
 return Object.freeze({status,productionChangeAuthorized:false,liveAttested:false,
  requestId:request.requestId,expectedCandidateSha256:request.expectedCandidateSha256,
  replyMac:replyMAC(secret,request,status)});
}
function verifySignedCandidateReply({response,request,secret}={}){
 const failed=code=>Object.freeze({ok:false,code});
 if(!secretValid(secret)||!request||request.type!==ACTION||!NONCE.test(request.requestId||'')||
  !HEX.test(request.expectedCandidateSha256||'')||
  !keysExactly(response,['status','productionChangeAuthorized','liveAttested',
    'requestId','expectedCandidateSha256','replyMac'])||
  !STATUSES.has(response.status)||response.productionChangeAuthorized!==false||response.liveAttested!==false||
  response.requestId!==request.requestId||response.expectedCandidateSha256!==request.expectedCandidateSha256||
  !compareHex(response.replyMac,replyMAC(secret,request,response.status)))return failed('UNTRUSTED_CONTENT_BOUND_REPLY');
 return Object.freeze({ok:true,code:'CONTENT_BOUND_REPLY_VERIFIED',status:response.status});
}
module.exports={ACTION,createSignedCandidateRequest,verifySignedCandidateRequest,signCandidateReply,verifySignedCandidateReply};
