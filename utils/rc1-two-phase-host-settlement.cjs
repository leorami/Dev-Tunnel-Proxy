'use strict';
/**
 * NONLIVE v12 split-phase host settlement. A trusted host must retain a durable
 * fence from BEFORE its fixed nginx action through an authenticated API
 * postcheck ACK, and issue final success only after its own second check.
 * It performs NO Docker operation, starts NO worker, and conveys NO owner GO.
 * A mutable host filesystem / noncooperating writer remains a distinct threat.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const {verifySignedCandidateRequest}=require('./rc1-content-bound-activation-request.cjs');
const HEX64=/^[0-9a-f]{64}$/;
const ID=/^[0-9a-f]{32,64}$/;
const INFLIGHT='host-settlement-inflight.json';
const PREPARED='host-settlement-prepared.json';
const WINDOW_MS=45000;
const PREP_STATUS='HOST_PREPARED_AWAITING_API_SETTLEMENT';
const FINAL_STATUS='HOST_SETTLEMENT_CLOSED';
function safeDirValue(dir){return typeof dir==='string'&&path.isAbsolute(dir)&&path.normalize(dir)===dir&&dir!=='/'&&!dir.endsWith('/')&&!dir.includes('\0');}
function ensureSecret(s){if(!Buffer.isBuffer(s)||s.length<32||s.length>128)throw Error('INVALID_SETTLEMENT_SECRET');}
function mac(secret,scope,parts){return crypto.createHmac('sha256',secret).update([scope,...parts].join('\0'),'utf8').digest('hex');}
function sameHex(a,b){return typeof a==='string'&&typeof b==='string'&&HEX64.test(a)&&HEX64.test(b)&&crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
function owned(o,keys){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));}
async function privateDir(dir){
 const st=await fs.lstat(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(typeof process.getuid==='function'&&st.uid!==process.getuid())||await fs.realpath(dir)!==dir)throw Error('UNSAFE_HOST_SETTLEMENT_DIRECTORY');
}
async function directorySync(dir){const h=await fs.open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function pinRead(dir,leaf){
 await privateDir(dir);
 const file=path.join(dir,leaf);let start;
 try{start=await fs.lstat(file,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!start.isFile()||start.isSymbolicLink()||start.nlink!==1n||(start.mode&0o777n)!==0o600n||start.size<2n||start.size>2048n)throw Error('UNSAFE_SETTLEMENT_MARKER');
 const h=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await h.stat({bigint:true});
  if(opened.dev!==start.dev||opened.ino!==start.ino||opened.size!==start.size)throw Error('SETTLEMENT_MARKER_CHANGED');
  const buf=await h.readFile();const after=await h.stat({bigint:true});const end=await fs.lstat(file,{bigint:true});
  if(buf.length!==Number(start.size)||after.dev!==start.dev||after.ino!==start.ino||after.mtimeNs!==start.mtimeNs||after.ctimeNs!==start.ctimeNs||end.dev!==start.dev||end.ino!==start.ino||end.size!==start.size)throw Error('SETTLEMENT_MARKER_CHANGED');
  let data;try{data=JSON.parse(buf.toString('utf8'));}catch{throw Error('INVALID_SETTLEMENT_MARKER');}
  return Object.freeze({data,dev:start.dev,ino:start.ino});
 }finally{await h.close();}
}
async function createExclusive(dir,leaf,body){
 await privateDir(dir);
 const full=path.join(dir,leaf);let fd;
 try{
  fd=await fs.open(full,'wx',0o600);await fd.writeFile(JSON.stringify(body)+'\n');await fd.sync();await fd.close();fd=null;
  await directorySync(dir);
 }catch(e){if(fd)await fd.close();throw e;}
}
async function unlinkPinned(dir,leaf,identity){
 if(!identity)throw Error('SETTLEMENT_MARKER_MISSING');
 const now=await fs.lstat(path.join(dir,leaf),{bigint:true});
 if(!now.isFile()||now.isSymbolicLink()||now.nlink!==1n||(now.mode&0o777n)!==0o600n||now.dev!==identity.dev||now.ino!==identity.ino)throw Error('SETTLEMENT_MARKER_CHANGED');
 await fs.unlink(path.join(dir,leaf));await directorySync(dir);
}
function preparedMAC(secret,item){return mac(secret,'devproxy-v12-host-prepared',[item.requestId,item.candidateSha256,item.challenge]);}
function ackMAC(secret,ack){return mac(secret,'devproxy-v12-api-settle',[ack.requestId,ack.candidateSha256,ack.challenge,ack.preparedMac,String(ack.ts)]);}
function finalMAC(secret,final){return mac(secret,'devproxy-v12-host-final',[final.status,final.requestId,final.candidateSha256,final.challenge,final.preparedMac]);}
function validPrepared(prepared,secret){
 if(!owned(prepared,['status','requestId','candidateSha256','challenge','preparedMac','productionChangeAuthorized','liveAttested'])||
  prepared.status!==PREP_STATUS||!ID.test(prepared.requestId)||!HEX64.test(prepared.candidateSha256)||!ID.test(prepared.challenge)||
  prepared.productionChangeAuthorized!==false||prepared.liveAttested!==false)return false;
 return sameHex(prepared.preparedMac,preparedMAC(secret,prepared));
}
function signedPrepared({requestId,candidateSha256,challenge},secret){
 const p={status:PREP_STATUS,requestId,candidateSha256,challenge,productionChangeAuthorized:false,liveAttested:false};
 return Object.freeze({...p,preparedMac:preparedMAC(secret,p)});
}
async function createVerifiedApiSettlementAck({prepared,secret,approvedRoot,now=Date.now}={}){
 ensureSecret(secret);if(!validPrepared(prepared,secret)||typeof now!=='function')throw Error('UNTRUSTED_HOST_PREPARATION');
 const measured=await createCandidateManifest({approvedRoot});
 if(!sameHex(measured.candidateSha256,prepared.candidateSha256))throw Error('API_SETTLEMENT_CANDIDATE_CHANGED');
 const ts=now();if(!Number.isSafeInteger(ts))throw Error('INVALID_SETTLEMENT_TIME');
 const ack={kind:'API_SETTLEMENT_ACK_V12',requestId:prepared.requestId,candidateSha256:prepared.candidateSha256,
  challenge:prepared.challenge,preparedMac:prepared.preparedMac,ts};
 return Object.freeze({...ack,mac:ackMAC(secret,ack)});
}
function verifySignedFinalSettlement({response,prepared,secret}={}){
 try{ensureSecret(secret);}catch{return Object.freeze({ok:false,code:'UNTRUSTED_FINAL_SETTLEMENT'});}
 const ok=validPrepared(prepared,secret)&&
  owned(response,['status','requestId','candidateSha256','challenge','preparedMac','productionChangeAuthorized','liveAttested','finalMac'])&&
  response.status===FINAL_STATUS&&response.requestId===prepared.requestId&&response.candidateSha256===prepared.candidateSha256&&
  response.challenge===prepared.challenge&&response.preparedMac===prepared.preparedMac&&
  response.productionChangeAuthorized===false&&response.liveAttested===false&&
  sameHex(response.finalMac,finalMAC(secret,response));
 return Object.freeze({ok:!!ok,code:ok?'SIGNED_FINAL_SETTLEMENT_VERIFIED':'UNTRUSTED_FINAL_SETTLEMENT'});
}
function createTwoPhaseHostSettlement({directory,approvedRoot,secret,now=Date.now,
 verifyHostPrepared,verifyActiveRoute,nonce=()=>crypto.randomBytes(16).toString('hex')}={}){
 ensureSecret(secret);
 if(!safeDirValue(directory)||!safeDirValue(approvedRoot)||typeof now!=='function'||typeof nonce!=='function'||
  typeof verifyHostPrepared!=='function'||typeof verifyActiveRoute!=='function')throw Error('INVALID_HOST_SETTLEMENT_CONFIGURATION');
 async function validateDirectories(){await privateDir(directory);await privateDir(path.join(directory,'replay'));}
 async function validatedMarker(){
  const m=await pinRead(directory,INFLIGHT);
  if(!m||!owned(m.data,['requestId','candidateSha256','challenge'])||!ID.test(m.data.requestId)||!HEX64.test(m.data.candidateSha256)||!ID.test(m.data.challenge))throw Error('HOST_SETTLEMENT_QUARANTINED');
  return m;
 }
 async function begin({request}={}){
  await validateDirectories();
  const verified=verifySignedCandidateRequest({request,secret,now});
  if(!verified.ok)throw Error('UNAUTHENTICATED_HOST_SETTLEMENT_REQUEST');
  const before=await createCandidateManifest({approvedRoot});
  if(!sameHex(before.candidateSha256,request.expectedCandidateSha256))throw Error('SETTLEMENT_CANDIDATE_CHANGED');
  const replayFile=path.join(directory,'replay',request.requestId);
  let handle;
  try{handle=await fs.open(replayFile,'wx',0o600);await handle.sync();await handle.close();handle=null;await directorySync(path.join(directory,'replay'));}
  catch(e){if(handle)await handle.close();throw Error(e.code==='EEXIST'?'HOST_SETTLEMENT_REPLAY_DENIED':'HOST_SETTLEMENT_REPLAY_UNCERTAIN');}
  const challenge=nonce();if(!ID.test(challenge))throw Error('INVALID_SETTLEMENT_CHALLENGE');
  try{
   await createExclusive(directory,INFLIGHT,{requestId:request.requestId,candidateSha256:before.candidateSha256,challenge});
   if(await pinRead(directory,PREPARED))throw Error('HOST_SETTLEMENT_QUARANTINED');
   const after=await createCandidateManifest({approvedRoot});
   if(!sameHex(after.candidateSha256,before.candidateSha256))throw Error('SETTLEMENT_CANDIDATE_CHANGED');
   return Object.freeze({status:'HOST_SETTLEMENT_HELD',requestId:request.requestId,productionChangeAuthorized:false,liveAttested:false});
  }catch(e){throw Error(e.code==='EEXIST'?'HOST_SETTLEMENT_QUARANTINED':e.message);}
 }
 async function prepare({requestId}={}){
  await validateDirectories();const marker=await validatedMarker();
  if(marker.data.requestId!==requestId||await pinRead(directory,PREPARED))throw Error('HOST_SETTLEMENT_QUARANTINED');
  const digest=marker.data.candidateSha256;
  if(await verifyHostPrepared(digest)!==true||await verifyActiveRoute(digest)!==true)throw Error('HOST_SETTLEMENT_INDETERMINATE');
  const after=await createCandidateManifest({approvedRoot});
  if(!sameHex(after.candidateSha256,digest))throw Error('HOST_SETTLEMENT_CANDIDATE_CHANGED');
  // Persist proof of preparation BEFORE emitting a reply to the API.
  const signed=signedPrepared(marker.data,secret);
  await createExclusive(directory,PREPARED,{preparedMac:signed.preparedMac});
  return signed;
 }
 async function settle({ack}={}){
  await validateDirectories();const marker=await validatedMarker();const saved=await pinRead(directory,PREPARED);
  if(!saved||!owned(saved.data,['preparedMac']))throw Error('HOST_SETTLEMENT_NOT_PREPARED');
  const p=signedPrepared(marker.data,secret);
  const current=now();
  if(!owned(ack,['kind','requestId','candidateSha256','challenge','preparedMac','ts','mac'])||
     ack.kind!=='API_SETTLEMENT_ACK_V12'||ack.requestId!==p.requestId||ack.candidateSha256!==p.candidateSha256||
     ack.challenge!==p.challenge||ack.preparedMac!==p.preparedMac||saved.data.preparedMac!==p.preparedMac||
     !Number.isSafeInteger(ack.ts)||!Number.isSafeInteger(current)||Math.abs(ack.ts-current)>WINDOW_MS||
     !sameHex(ack.mac,ackMAC(secret,ack)))throw Error('UNTRUSTED_API_SETTLEMENT_ACK');
  // HOST must independently recheck identity and route AFTER API's postcheck.
  if(await verifyHostPrepared(p.candidateSha256)!==true||await verifyActiveRoute(p.candidateSha256)!==true)
    throw Error('HOST_SETTLEMENT_INDETERMINATE');
  const after=await createCandidateManifest({approvedRoot});
  if(!sameHex(after.candidateSha256,p.candidateSha256))throw Error('HOST_SETTLEMENT_CANDIDATE_CHANGED');
  // No automated recovery. Failures during release leave marker quarantined.
  await unlinkPinned(directory,PREPARED,saved);await unlinkPinned(directory,INFLIGHT,marker);
  const r={status:FINAL_STATUS,requestId:p.requestId,candidateSha256:p.candidateSha256,challenge:p.challenge,
   preparedMac:p.preparedMac,productionChangeAuthorized:false,liveAttested:false};
  return Object.freeze({...r,finalMac:finalMAC(secret,r)});
 }
 return Object.freeze({begin,prepare,settle});
}
module.exports={createTwoPhaseHostSettlement,createVerifiedApiSettlementAck,verifySignedFinalSettlement};
