'use strict';
/**
 * Source-only, fixed-action, HMAC file-spool IPC candidate. Docker Desktop
 * shares owner-approved /app/.artifacts bind data between Mac host and VM:
 * unlike Unix socket passthrough, bounded signed files can cross that mount.
 *
 * NO service starts here. NO Docker, HTTP listener, nginx, or owner-data
 * modification is performed. A separately authorized host worker must own
 * the one fixed action; replay, host identity, and owner GO remain mandatory.
 * Do not install/repoint any live mount to test this code.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest,verifySignedCandidateRequest,
 signCandidateReply,verifySignedCandidateReply}=require('./rc1-content-bound-activation-request.cjs');
const NONCE=/^[0-9a-f]{32,64}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const LEAVES=Object.freeze(['requests','responses','replay']);
function validate(directory,secret){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.normalize(directory)!==directory||
  directory==='/'||directory.endsWith('/')||!Buffer.isBuffer(secret)||secret.length<32||secret.length>128)
  throw Error('INVALID_FILE_SPOOL_CONFIGURATION');
}
async function privateDir(dir){
 let st;
 try{st=await fs.lstat(dir);}catch(e){if(e.code==='ENOENT')throw Error('MISSING_PRIVATE_QUEUE_DIRECTORY');throw e;}
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('UNSAFE_PRIVATE_QUEUE_DIRECTORY');
}
async function ensureTree(dir){
 await privateDir(dir);
 for(const leaf of LEAVES)await privateDir(path.join(dir,leaf));
}
async function provisionPrivateQueue({directory}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.normalize(directory)!==directory||directory==='/'||directory.endsWith('/'))
  throw Error('INVALID_FILE_SPOOL_CONFIGURATION');
 await privateDir(directory);
 for(const leaf of LEAVES){
  const p=path.join(directory,leaf);
  try{await fs.mkdir(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateDir(p);
 }
}
async function syncDir(dir){const d=await fs.open(dir,'r');try{await d.sync();}finally{await d.close();}}
async function writeNoReplace(dir,id,data){
 if(!NONCE.test(id)||typeof data!=='string'||Buffer.byteLength(data)>2048)throw Error('INVALID_SPOOL_MESSAGE');
 await privateDir(dir);
 const final=path.join(dir,id+'.json');
 const temp=path.join(dir,'.tmp-'+crypto.randomBytes(12).toString('hex'));
 let fd;
 try{
  fd=await fs.open(temp,'wx',0o600);
  await fd.writeFile(data);await fd.sync();await fd.close();fd=null;
  await fs.link(temp,final); // atomic no-clobber across crash/races
  await fs.unlink(temp);
  await syncDir(dir);
 }catch(e){
  if(fd)await fd.close();try{await fs.unlink(temp);}catch{}
  if(e.code==='EEXIST')throw Error('REQUEST_ALREADY_EXISTS');throw e;
 }
}
async function readPinnedJson(dir,id){
 if(!NONCE.test(id))throw Error('INVALID_REQUEST_ID');
 await privateDir(dir);
 const file=path.join(dir,id+'.json');
 let st;
 try{st=await fs.lstat(file,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||st.size<=0n||st.size>2048n)
  throw Error('UNSAFE_SPOOL_MESSAGE');
 let fd;
 try{
  fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const a=await fd.stat({bigint:true});
  if(a.dev!==st.dev||a.ino!==st.ino||a.size!==st.size||a.nlink!==1n)throw Error('UNSAFE_SPOOL_MESSAGE');
  const data=await fd.readFile();
  const b=await fd.stat({bigint:true});
  if(b.size!==BigInt(data.length)||b.ino!==st.ino||b.mtimeNs!==a.mtimeNs||b.ctimeNs!==a.ctimeNs)throw Error('UNSAFE_SPOOL_MESSAGE');
  return JSON.parse(data.toString('utf8'));
 }catch(e){if(e instanceof SyntaxError)throw Error('INVALID_SPOOL_JSON');throw e;}
 finally{if(fd)await fd.close();}
}
async function reserveReplay(directory,id){
 const dir=path.join(directory,'replay');await privateDir(dir);
 const p=path.join(dir,id);
 let fd;
 try{fd=await fs.open(p,'wx',0o600);await fd.sync();await fd.close();fd=null;await syncDir(dir);return true;}
 catch(e){if(fd)await fd.close();if(e.code==='EEXIST')return false;throw e;}
}
function createSpoolClient({directory,secret,now=Date.now,nonce}={}){
 validate(directory,secret);if(typeof now!=='function'||typeof nonce!=='function')throw Error('INVALID_FILE_SPOOL_CONFIGURATION');
 async function submit({expectedCandidateSha256}={}){
  await ensureTree(directory);
  const request=createSignedCandidateRequest({secret,expectedCandidateSha256,now,nonce});
  await writeNoReplace(path.join(directory,'requests'),request.requestId,JSON.stringify(request)+'\n');
  return Object.freeze({requestId:request.requestId,expectedCandidateSha256:request.expectedCandidateSha256});
 }
 async function readResult(ticket){
  if(!ticket||!NONCE.test(ticket.requestId||'')||!DIGEST.test(ticket.expectedCandidateSha256||''))
   throw Error('INVALID_RESPONSE_TICKET');
  await ensureTree(directory);
  let response;
  try{response=await readPinnedJson(path.join(directory,'responses'),ticket.requestId);}
  catch{return Object.freeze({status:'BLOCKED_BAD_REPLY',verified:false});}
  if(response===null)return null;
  const request={type:'VALIDATE_AND_RELOAD_CONFIG_SET_V2',requestId:ticket.requestId,
   expectedCandidateSha256:ticket.expectedCandidateSha256};
  const verify=verifySignedCandidateReply({response,request,secret});
  return Object.freeze({status:verify.ok?response.status:'BLOCKED_BAD_REPLY',verified:verify.ok});
 }
 return Object.freeze({submit,readResult});
}
function createSpoolHost({directory,approvedRoot,secret,now=Date.now,executeVerified}={}){
 validate(directory,secret);
 if(typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||typeof now!=='function'||typeof executeVerified!=='function')
  throw Error('INVALID_FILE_SPOOL_CONFIGURATION');
 async function processOne(id){
  if(!NONCE.test(id))return Object.freeze({code:'INVALID_REQUEST_ID'});
  await ensureTree(directory);
  let request;
  try{request=await readPinnedJson(path.join(directory,'requests'),id);}catch{return Object.freeze({code:'REQUEST_NOT_AUTHORIZED'});}
  if(!request||request.requestId!==id||!verifySignedCandidateRequest({request,secret,now}).ok)
   return Object.freeze({code:'REQUEST_NOT_AUTHORIZED'});
  if(!await reserveReplay(directory,id))return Object.freeze({code:'REPLAY_ALREADY_RESERVED'});
  let status='HOST_OPERATION_INDETERMINATE';
  try{
   const m=await createCandidateManifest({approvedRoot});
   if(m.candidateSha256!==request.expectedCandidateSha256)status='CONFIG_SET_DIGEST_MISMATCH';
   else{
    const outcome=await executeVerified(Object.freeze({expectedCandidateSha256:request.expectedCandidateSha256}));
    status=typeof outcome==='string'?outcome:'HOST_OPERATION_INDETERMINATE';
    // Before claiming success, reconfirm the immutable candidate file set.
    const after=await createCandidateManifest({approvedRoot});
    if(after.candidateSha256!==request.expectedCandidateSha256)status='HOST_OPERATION_INDETERMINATE';
   }
  }catch{status='HOST_OPERATION_INDETERMINATE';}
  let signed;
  try{signed=signCandidateReply({secret,request,status});}
  catch{signed=signCandidateReply({secret,request,status:'HOST_OPERATION_INDETERMINATE'});}
  await writeNoReplace(path.join(directory,'responses'),id,JSON.stringify(signed)+'\n');
  return Object.freeze({code:'HOST_PROCESSED'});
 }
 return Object.freeze({processOne});
}
module.exports={provisionPrivateQueue,createSpoolClient,createSpoolHost};
