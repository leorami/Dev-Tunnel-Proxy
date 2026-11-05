'use strict';
/**
 * Smallest owner-used Calliope skill: reviewed Next.js redirect-loop repair.
 * Authenticates via caller-supplied session assertion only; performs propose →
 * owner-bound approve → CAS editApp. Does not run Docker, shell, OpenAI, or
 * install new capabilities. Browser/nginx proof remains a separate disposable
 * attestation step — this skill never sets liveAttested.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {
 proposeRepair,approveProposedRepair,applyApprovedRepair,HEAL_STATUS
}=require('./calliope-first-safe-heal.cjs');

const APP=/^[A-Za-z0-9_-]{1,80}\.conf$/;
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const SHA64=/^[a-f0-9]{64}$/;

function deny(code,httpStatus=400){
 return Object.freeze({
  ok:false,httpStatus,code,healingPerformed:false,liveAttested:false,
  productionChangeAuthorized:false,executionAuthorized:false,
  skill:'nginx.nextjs_redirect.owner_apply',lessonVerified:false
 });
}

async function runOwnerNextjsRedirectHealSkill({
 authenticated,appsDir,appName,route,beforeSha256,afterSha256,mutation
}={}){
 if(authenticated!==true)return deny('OWNER_SESSION_REQUIRED',401);
 if(typeof appsDir!=='string'||!path.isAbsolute(appsDir)||!APP.test(appName)||!ROUTE.test(route)||
    typeof beforeSha256!=='string'||!SHA64.test(beforeSha256)||
    typeof afterSha256!=='string'||!SHA64.test(afterSha256)||
    !mutation||typeof mutation.editApp!=='function')
  return deny('INVALID_OWNER_HEAL_INPUT');
 const file=path.join(appsDir,appName);
 let source;
 try{
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>256*1024)return deny('UNSAFE_APP_TARGET');
  source=await fs.readFile(file,'utf8');
 }catch{return deny('APP_SOURCE_UNREADABLE',404);}
 const proposed=proposeRepair({source,route});
 if(proposed.status!==HEAL_STATUS.PROPOSED)return deny(proposed.code||'NOT_PROPOSABLE',422);
 if(proposed.beforeSha256!==beforeSha256||proposed.afterSha256!==afterSha256)
  return deny('OWNER_HASH_MISMATCH',409);
 const approved=approveProposedRepair(proposed,{ownerApproval:{
  granted:true,scope:'nextjs_redirect_loop',route,appName,
  beforeSha256,afterSha256
 }});
 if(approved.status!==HEAL_STATUS.OWNER_APPROVED)return deny(approved.code||'APPROVAL_FAILED');
 const applied=await applyApprovedRepair(approved,{
  mutation,readCurrentSource:async()=>fs.readFile(file,'utf8')
 });
 if(applied.status!==HEAL_STATUS.APPLIED){
  return Object.freeze({
   ok:false,httpStatus:applied.httpStatus||409,code:applied.code||'APPLY_FAILED',
   healingPerformed:false,liveAttested:false,productionChangeAuthorized:false,
   skill:'nginx.nextjs_redirect.owner_apply',lessonVerified:false,
   casEnforced:true
  });
 }
 return Object.freeze({
  ok:true,httpStatus:200,code:'OWNER_REVIEWED_REPAIR_APPLIED',
  status:HEAL_STATUS.APPLIED,route,appName,
  beforeSha256,afterSha256,casEnforced:true,
  healingPerformed:false, // requires separate disposable real browser+nginx verify
  liveAttested:false,productionChangeAuthorized:false,
  skill:'nginx.nextjs_redirect.owner_apply',
  lessonId:'nextjs_redirect_loop',
  lessonVerified:'PENDING_DISPOSABLE_BROWSER_PROOF',
  mutationCode:applied.mutationCode
 });
}

module.exports={runOwnerNextjsRedirectHealSkill};
