'use strict';
// DEVPROXY P0 RC1. Pure, no IO. Only validates redacted, locally attested
// transition metadata. NEVER authorizes an actual runtime mutation.
const RELEASE_SHA='d89c962fb31a962a518f331bae458e63708e7e86';
const ACTIONS=new Set(['up','restart','apply']);
const LIVE_KEYS=new Set(['attested','liveSource','proxyImage','publicHealth',
  'anonymousRoutes','managementPorts','apiDockerSocket',
  'privateConfigPreserved','routeFingerprintPreserved']);
const PLAN_KEYS=new Set(['sourceSha','exactPrivateMounts','sharedConfigDigest',
  'trustedOriginsPreserved','rollbackReady','verifiedDisposable']);
const SOURCE=new Set(['accepted_rc1','owner_checkout','unknown']);
const IMAGE=new Set(['accepted_rc1','different','unknown']);
const HEALTH=new Set(['minimal','full_report','unknown']);
const ROUTES=new Set(['denied','open','unknown']);
const PORTS=new Set(['loopback','all_interfaces','unknown']);
const SOCK=new Set(['rw','ro','absent','unknown']);
function objectOf(value,allowed){
  return value!==null&&typeof value==='object'&&!Array.isArray(value) &&
    Object.keys(value).every(key=>allowed.has(key));
}
function result(code){return Object.freeze({code,mutationAllowed:false,productionChangeAuthorized:false});}
function assessReleaseMutationPlan(input){
  if(!objectOf(input,new Set(['action','live','candidate']))||!ACTIONS.has(input.action))return result('INVALID_INPUT');
  const {live,candidate}=input;
  if(live===null||live===undefined||candidate===null||candidate===undefined)return result('EVIDENCE_INCOMPLETE');
  if(!objectOf(live,LIVE_KEYS)||!objectOf(candidate,PLAN_KEYS))return result('INVALID_INPUT');
  const enums=[
    [SOURCE,live.liveSource],[IMAGE,live.proxyImage],[HEALTH,live.publicHealth],
    [ROUTES,live.anonymousRoutes],[PORTS,live.managementPorts],[SOCK,live.apiDockerSocket]
  ];
  if(enums.some(([s,v])=>v!==undefined&&!s.has(v)) ||
    typeof live.attested!=='boolean' ||
    ['privateConfigPreserved','routeFingerprintPreserved'].some(k=>live[k]!==undefined&&typeof live[k]!=='boolean')||
    (candidate.sourceSha!==undefined&& !/^[a-f0-9]{40}$/.test(candidate.sourceSha)) ||
    [...PLAN_KEYS].filter(k=>k!=='sourceSha').some(k=>candidate[k]!==undefined&&typeof candidate[k]!=='boolean')) {
    return result('INVALID_INPUT');
  }
  if(!live.attested || enums.some(([,v])=>v===undefined||v==='unknown')||
    live.privateConfigPreserved===undefined||live.routeFingerprintPreserved===undefined){
    return result('EVIDENCE_INCOMPLETE');
  }
  // R0 observed a live revert to owner checkout with anonymous private metadata.
  // This is strictly higher priority than any candidate plan's compatibility.
  if(live.liveSource!=='accepted_rc1'||live.proxyImage!=='accepted_rc1'||
    live.publicHealth!=='minimal'||live.anonymousRoutes!=='denied'||
    live.managementPorts!=='loopback'||
    !live.privateConfigPreserved||!live.routeFingerprintPreserved){
    return result('P0_DRIFT_BLOCKED');
  }
  if(candidate.sourceSha!==RELEASE_SHA ||
    [...PLAN_KEYS].filter(k=>k!=='sourceSha').some(k=>candidate[k]!==true)){
    return result('REPLACEMENT_PLAN_BLOCKED');
  }
  // Deliberately not a GO: requires independent live verification and an owner
  // decision before any production restart/recreate/rollback.
  return result('PLAN_COMPATIBLE_OWNER_GATE');
}
module.exports={RELEASE_SHA,assessReleaseMutationPlan};
