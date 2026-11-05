'use strict';
/**
 * In-memory, one-time, session-bound proposal ticket for a narrowly reviewed
 * owner healing action. The caller MUST supply sessionBinding ONLY from the
 * independently validated server session, never from the request body.
 *
 * A ticket proves ONLY that this exact proposal was observed in this API
 * process. It does not prove a human reviewed it or grant host permissions.
 * The authenticated owner must still explicitly request apply; the existing
 * locked preimage CAS, HMAC settlement and independent verification remain.
 * No filesystem, network, Docker, model or persistent secret use.
 */
const crypto=require('node:crypto');
const SESSION=/^[a-f0-9]{64}$/;
const FILE=/^[A-Za-z0-9_-]{1,80}\.conf$/;
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const HASH=/^[a-f0-9]{64}$/;
const TICKET=/^[A-Za-z0-9_-]{43}$/;
const REQUIRED=Object.freeze(['sessionBinding','appName','route','beforeSha256','afterSha256']);
const FLAGS=Object.freeze({ownerApprovalGranted:false,executionAuthorized:false,
 healingPerformed:false,liveAttested:false,productionChangeAuthorized:false});
function denied(status='PROPOSAL_TICKET_REJECTED'){
 return Object.freeze({ok:false,status,...FLAGS});
}
function plainExact(obj,keys){
 try{
  if(obj===null||typeof obj!=='object'||Array.isArray(obj)||
      Object.getPrototypeOf(obj)!==Object.prototype||Reflect.ownKeys(obj).length!==keys.length)return false;
  return keys.every(key=>{
   const d=Object.getOwnPropertyDescriptor(obj,key);
   return d!==undefined&&Object.hasOwn(d,'value');
  });
 }catch{return false;}
}
function extract(obj,keys){
 if(!plainExact(obj,keys))return null;
 try{
  const values=keys.map(key=>Object.getOwnPropertyDescriptor(obj,key).value);
  const [sessionBinding,appName,route,beforeSha256,afterSha256]=values;
  if(typeof sessionBinding!=='string'||!SESSION.test(sessionBinding)||
     typeof appName!=='string'||!FILE.test(appName)||
     typeof route!=='string'||!ROUTE.test(route)||
     typeof beforeSha256!=='string'||!HASH.test(beforeSha256)||
     typeof afterSha256!=='string'||!HASH.test(afterSha256)||
     beforeSha256===afterSha256)return null;
  return {sessionBinding,appName,route,beforeSha256,afterSha256,
    ticket:keys.length===6?values[5]:undefined};
 }catch{return null;}
}
function fingerprint(values){
 return crypto.createHash('sha256').update(JSON.stringify([
  values.appName,values.route,values.beforeSha256,values.afterSha256])).digest();
}
function shaTicket(ticket){return crypto.createHash('sha256').update(ticket,'ascii').digest('hex');}
function safeMatch(left,right){return Buffer.isBuffer(left)&&Buffer.isBuffer(right)&&
 left.length===right.length&&crypto.timingSafeEqual(left,right);}
function createOwnerHealProposalTicketService({now=Date.now,randomBytes=crypto.randomBytes,
  ttlMs=120000,maxPending=128}={}){
 if(typeof now!=='function'||typeof randomBytes!=='function'||
 !Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>300000||
 !Number.isSafeInteger(maxPending)||maxPending<1||maxPending>1024)
 throw Error('INVALID_PROPOSAL_TICKET_CONFIG');
 const pending=new Map();
 const clock=()=>{try{const at=now();return Number.isSafeInteger(at)&&at>0?at:null;}catch{return null;}};
 function prune(at){
  for(const [key,entry] of pending){
   if(at>entry.expiresAt||at<entry.issuedAt)pending.delete(key);
  }
 }
 function issue(input){
  const req=extract(input,REQUIRED);
  if(!req)return denied('INVALID_PROPOSAL_TICKET_INPUT');
  const at=clock();if(at===null)return denied('PROPOSAL_TICKET_CLOCK_UNAVAILABLE');
  prune(at);
  if(pending.size>=maxPending)return denied('PROPOSAL_TICKET_CAP_REACHED');
  let value;
  try{value=randomBytes(32);}catch{return denied('PROPOSAL_TICKET_ENTROPY_UNAVAILABLE');}
  if(!Buffer.isBuffer(value)||value.length!==32)return denied('PROPOSAL_TICKET_ENTROPY_UNAVAILABLE');
  const ticket=value.toString('base64url');
  if(!TICKET.test(ticket))return denied('PROPOSAL_TICKET_ENTROPY_UNAVAILABLE');
  const key=shaTicket(ticket);
  if(pending.has(key))return denied('PROPOSAL_TICKET_ENTROPY_COLLISION');
  pending.set(key,{sessionDigest:Buffer.from(req.sessionBinding,'hex'),
   subjectDigest:fingerprint(req),issuedAt:at,expiresAt:at+ttlMs});
  return Object.freeze({ok:true,status:'PROPOSAL_TICKET_ISSUED',ticket,expiresInMs:ttlMs,...FLAGS});
 }
 function consume(input){
  const req=extract(input,[...REQUIRED,'ticket']);
  if(!req||typeof req.ticket!=='string'||!TICKET.test(req.ticket))return denied();
  const at=clock();if(at===null)return denied('PROPOSAL_TICKET_CLOCK_UNAVAILABLE');
  const key=shaTicket(req.ticket),entry=pending.get(key);
  if(!entry)return denied();
  if(at<entry.issuedAt||at>entry.expiresAt){pending.delete(key);return denied('PROPOSAL_TICKET_EXPIRED');}
  if(!safeMatch(entry.sessionDigest,Buffer.from(req.sessionBinding,'hex'))||
     !safeMatch(entry.subjectDigest,fingerprint(req)))return denied();
  // Consumption is atomic in the JavaScript event loop, before any asynchronous
  // mutation or host request. A failed apply requires a fresh proposal.
  pending.delete(key);
  return Object.freeze({ok:true,status:'PROPOSAL_TICKET_CONSUMED',...FLAGS});
 }
 function revokeAll(){pending.clear();}
 return Object.freeze({issue,consume,revokeAll});
}
module.exports={createOwnerHealProposalTicketService};
