'use strict';
/**
 * Narrow owner-approved Next.js redirect-loop repair.
 * Proposals come from calliope-redirect-loop-proposal.cjs; writes go ONLY through
 * reviewed production-route-mutation.editApp + injected HMAC activation.
 * No shell, Docker, filesystem, or free-form model text execution here.
 */
const crypto=require('node:crypto');
const {proposeNextjsRedirectLoopRepair}=require('./calliope-redirect-loop-proposal.cjs');

const HEAL_STATUS=Object.freeze({
  OBSERVED:'OBSERVED',
  PROPOSED:'PROPOSED',
  OWNER_APPROVED:'OWNER_APPROVED',
  APPLIED:'APPLIED',
  VERIFIED:'VERIFIED',
  FAILED:'FAILED',
  NOT_AVAILABLE:'NOT_AVAILABLE',
  NEW_ABILITY_REQUESTED:'NEW_ABILITY_REQUESTED'
});
const APP=/^[A-Za-z0-9_-]{1,80}\.conf$/;
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const SHA64=/^[a-f0-9]{64}$/;
const HEX=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');

function base(status,extra={}){
 return Object.freeze({
  status,healingPerformed:false,executionAuthorized:false,ownerApprovalGranted:false,
  liveAttested:false,productionChangeAuthorized:false,...extra
 });
}
function exactPlain(o,keys){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).length===keys.length&&
  keys.every(k=>Object.hasOwn(o,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}

function observeRedirectLoop({source,route}={}){
 if(typeof source!=='string'||typeof route!=='string'||!ROUTE.test(route)||
    !source.length||Buffer.byteLength(source,'utf8')>256*1024||/[\u0000\u000d]/.test(source))
  return base(HEAL_STATUS.FAILED,{code:'INVALID_OBSERVE_INPUT'});
 const proposal=proposeNextjsRedirectLoopRepair({source,route});
 if(proposal.status==='PATCH_PROPOSAL_ONLY')
  return base(HEAL_STATUS.OBSERVED,{
   route,sourceSha256:proposal.beforeSha256,issueType:'nextjs_redirect_loop',
   evidence:Object.freeze({brokenProxyPass:true})
  });
 if(proposal.status==='NO_KNOWN_REDIRECT_LOOP')
  return base(HEAL_STATUS.NOT_AVAILABLE,{code:'NO_KNOWN_REDIRECT_LOOP',route,sourceSha256:HEX(source)});
 return base(HEAL_STATUS.NOT_AVAILABLE,{code:proposal.status,route,sourceSha256:HEX(source)});
}

function proposeRepair({source,route}={}){
 const observed=observeRedirectLoop({source,route});
 if(observed.status!==HEAL_STATUS.OBSERVED)return observed;
 const proposal=proposeNextjsRedirectLoopRepair({source,route});
 if(proposal.status!=='PATCH_PROPOSAL_ONLY')
  return base(HEAL_STATUS.NOT_AVAILABLE,{code:proposal.status,route});
 return base(HEAL_STATUS.PROPOSED,{
  route,changeType:proposal.changeType,beforeSha256:proposal.beforeSha256,
  afterSha256:proposal.afterSha256,candidateConfig:proposal.candidateConfig,
  requiredVerification:proposal.requiredVerification,
  executionPath:proposal.executionPath,issueType:'nextjs_redirect_loop'
 });
}

function approveProposedRepair(proposed,{ownerApproval}={}){
 if(!proposed||proposed.status!==HEAL_STATUS.PROPOSED)
  return base(HEAL_STATUS.FAILED,{code:'PROPOSAL_REQUIRED'});
 if(!exactPlain(ownerApproval,['granted','scope','route','appName','beforeSha256','afterSha256'])||
    ownerApproval.granted!==true||ownerApproval.scope!=='nextjs_redirect_loop'||
    ownerApproval.route!==proposed.route||typeof ownerApproval.appName!=='string'||
    !APP.test(ownerApproval.appName)||ownerApproval.beforeSha256!==proposed.beforeSha256||
    ownerApproval.afterSha256!==proposed.afterSha256)
  return base(HEAL_STATUS.FAILED,{code:'OWNER_APPROVAL_REJECTED',route:proposed.route});
 return base(HEAL_STATUS.OWNER_APPROVED,{
  route:proposed.route,appName:ownerApproval.appName,changeType:proposed.changeType,
  beforeSha256:proposed.beforeSha256,afterSha256:proposed.afterSha256,
  candidateConfig:proposed.candidateConfig,requiredVerification:proposed.requiredVerification,
  ownerApprovalGranted:true,issueType:'nextjs_redirect_loop'
 });
}

/**
 * Apply an OWNER_APPROVED exact-diff through mutation.editApp only.
 * readCurrentSource() MUST return the live bytes at mutation time for TOCTOU.
 */
async function applyApprovedRepair(approved,{mutation,readCurrentSource}={}){
 if(!approved||approved.status!==HEAL_STATUS.OWNER_APPROVED||approved.ownerApprovalGranted!==true)
  return base(HEAL_STATUS.FAILED,{code:'OWNER_APPROVAL_REQUIRED'});
 if(!mutation||typeof mutation.editApp!=='function'||typeof readCurrentSource!=='function')
  return base(HEAL_STATUS.FAILED,{code:'MUTATION_SEAM_REQUIRED'});
 let current;
 try{current=await readCurrentSource();}catch{
  return base(HEAL_STATUS.FAILED,{code:'CURRENT_SOURCE_UNREADABLE',route:approved.route});
 }
 if(typeof current!=='string'||HEX(current)!==approved.beforeSha256)
  return base(HEAL_STATUS.FAILED,{
   code:'TOCTOU_BEFORE_SHA_MISMATCH',route:approved.route,
   expectedBeforeSha256:approved.beforeSha256,
   actualBeforeSha256:typeof current==='string'?HEX(current):null
  });
 const replay=proposeNextjsRedirectLoopRepair({source:current,route:approved.route});
 if(replay.status!=='PATCH_PROPOSAL_ONLY'||
    replay.beforeSha256!==approved.beforeSha256||
    replay.afterSha256!==approved.afterSha256||
    replay.candidateConfig!==approved.candidateConfig)
  return base(HEAL_STATUS.FAILED,{code:'PROPOSAL_REPLAY_REJECTED',route:approved.route});
 let result;
 try{result=await mutation.editApp(approved.appName,approved.candidateConfig);}
 catch{return base(HEAL_STATUS.FAILED,{code:'EDIT_APP_THREW',route:approved.route});}
 if(!result||result.ok!==true||result.httpStatus!==200)
  return base(HEAL_STATUS.FAILED,{
   code:'EDIT_APP_REJECTED',route:approved.route,
   mutationCode:result&&result.code,httpStatus:result&&result.httpStatus
  });
 return base(HEAL_STATUS.APPLIED,{
  route:approved.route,appName:approved.appName,beforeSha256:approved.beforeSha256,
  afterSha256:approved.afterSha256,ownerApprovalGranted:true,
  mutationCode:result.code,issueType:'nextjs_redirect_loop'
 });
}

async function verifyAppliedRepair(applied,{verify}={}){
 if(!applied||applied.status!==HEAL_STATUS.APPLIED)
  return base(HEAL_STATUS.FAILED,{code:'APPLY_REQUIRED'});
 if(typeof verify!=='function')
  return base(HEAL_STATUS.FAILED,{code:'VERIFIER_REQUIRED'});
 let report;
 try{report=await verify(applied);}catch{
  return base(HEAL_STATUS.FAILED,{code:'VERIFIER_THREW',route:applied.route});
 }
 if(!exactPlain(report,['ok','nginxSyntaxOk','assetStatus','redirectLoop','unrelatedRoutesIntact'])||
    report.ok!==true||report.nginxSyntaxOk!==true||report.assetStatus!==200||
    report.redirectLoop!==false||report.unrelatedRoutesIntact!==true)
  return base(HEAL_STATUS.FAILED,{
   code:'VERIFICATION_FAILED',route:applied.route,report:report||null
  });
 return base(HEAL_STATUS.VERIFIED,{
  route:applied.route,appName:applied.appName,beforeSha256:applied.beforeSha256,
  afterSha256:applied.afterSha256,ownerApprovalGranted:true,healingPerformed:true,
  issueType:'nextjs_redirect_loop',verification:Object.freeze({...report})
 });
}

function requestNewAbility(id){
 if(typeof id!=='string'||!/^[a-z][a-z0-9_.-]{2,95}$/.test(id))
  return base(HEAL_STATUS.FAILED,{code:'INVALID_ABILITY_ID'});
 return base(HEAL_STATUS.NEW_ABILITY_REQUESTED,{
  requestedAbilityId:id,runnable:false
 });
}

module.exports={
 HEAL_STATUS,observeRedirectLoop,proposeRepair,approveProposedRepair,
 applyApprovedRepair,verifyAppliedRepair,requestNewAbility
};
