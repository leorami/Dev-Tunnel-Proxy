'use strict';
/**
 * V193 source-only trust boundary: an authenticated agent envelope plus an
 * independently injected server-held grant and pinned artifact manifest may
 * identify inert metadata. No file reads, exports, owner approval or execution.
 *
 * CRITICAL: The caller must independently verify owner consent and the real
 * server provenance of trustedGrants/artifacts before ever considering runtime
 * integration. Passing an object into this factory DOES NOT prove consent.
 */
const {createCalliopeAgentEnvelopeVerifier}=require('./calliope-agent-envelope.cjs');

const NAME=/^[a-z][a-z0-9-]{0,47}$/;
const HASH=/^[a-f0-9]{64}$/;
const SOURCE_SHA=/^[a-f0-9]{40}$/;
const PURPOSE='artifact.describe';
const ACCEPTED_TYPES=new Set(['image/png','image/jpeg','application/pdf',
  'application/json','text/plain']);
const FLAGS=Object.freeze({ownerApprovalGranted:false,exportAuthorized:false,
  executionAuthorized:false,healingPerformed:false,liveAttested:false,
  productionChangeAuthorized:false});
const DENY=Object.freeze({ok:false,status:'DESCRIPTOR_REJECTED',...FLAGS});
const ARTIFACT=['project','artifactSha256','sourceCommit','mediaType',
  'byteLength','capturedAtMs'];
const GRANT=['sender','project','purpose','artifactSha256','sourceCommit',
  'issuedAtMs','expiresAtMs'];

function strictValues(input,keys){
  try{
    if(input===null||typeof input!=='object'||Array.isArray(input)||
       Object.getPrototypeOf(input)!==Object.prototype||
       Reflect.ownKeys(input).length!==keys.length)return null;
    const values=Object.create(null);
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(input,key);
      if(!d||!Object.hasOwn(d,'value'))return null;
      values[key]=d.value;
    }
    return values;
  }catch{return null;}
}
function artifactRecord(input){
  const r=strictValues(input,ARTIFACT);
  if(!r||typeof r.project!=='string'||!NAME.test(r.project)||
    typeof r.artifactSha256!=='string'||!HASH.test(r.artifactSha256)||
    typeof r.sourceCommit!=='string'||!SOURCE_SHA.test(r.sourceCommit)||
    !ACCEPTED_TYPES.has(r.mediaType)||
    !Number.isSafeInteger(r.byteLength)||r.byteLength<1||r.byteLength>5*1024*1024||
    !Number.isSafeInteger(r.capturedAtMs)||r.capturedAtMs<=0)
    throw Error('INVALID_ARTIFACT_MANIFEST');
  return Object.freeze({...r});
}
function grantRecord(input){
  const r=strictValues(input,GRANT);
  if(!r||typeof r.sender!=='string'||!NAME.test(r.sender)||
    typeof r.project!=='string'||!NAME.test(r.project)||
    r.purpose!==PURPOSE||
    typeof r.artifactSha256!=='string'||!HASH.test(r.artifactSha256)||
    typeof r.sourceCommit!=='string'||!SOURCE_SHA.test(r.sourceCommit)||
    !Number.isSafeInteger(r.issuedAtMs)||r.issuedAtMs<=0||
    !Number.isSafeInteger(r.expiresAtMs)||r.expiresAtMs<=r.issuedAtMs||
    r.expiresAtMs-r.issuedAtMs>10*60*1000)
    throw Error('INVALID_TRUSTED_GRANT_RECORD');
  return Object.freeze({...r});
}
function createCalliopeArtifactDescriptorGate({
  identities,artifacts=[],trustedGrants=[],now=Date.now
}={}){
  if(typeof now!=='function'||!Array.isArray(artifacts)||
     artifacts.length>512||!Array.isArray(trustedGrants)||
     trustedGrants.length>512)
    throw Error('INVALID_DESCRIPTOR_GATE_CONFIG');
  // Real Ed25519 verification stays internal. An externally supplied claim
  // like {verified:true} cannot substitute for an authentic signed envelope.
  const identityVerifier=createCalliopeAgentEnvelopeVerifier({identities,now});
  const manifest=new Map(),grants=new Map();
  for(const input of artifacts){
    const row=artifactRecord(input);
    const key=row.project+'\0'+row.artifactSha256;
    if(manifest.has(key))throw Error('DUPLICATE_ARTIFACT_MANIFEST');
    manifest.set(key,row);
  }
  for(const input of trustedGrants){
    const row=grantRecord(input);
    const key=row.sender+'\0'+row.project+'\0'+row.artifactSha256;
    if(grants.has(key))throw Error('DUPLICATE_TRUSTED_GRANT');
    grants.set(key,row);
  }
  function describe(signedEnvelope){
    const verified=identityVerifier.verifyEnvelope(signedEnvelope);
    if(!verified.ok)return DENY;
    let at;
    try{at=now();}catch{return DENY;}
    if(!Number.isSafeInteger(at)||at<=0)return DENY;
    const row=manifest.get(verified.project+'\0'+verified.artifactSha256);
    const grant=grants.get(verified.sender+'\0'+verified.project+'\0'+verified.artifactSha256);
    if(!row||!grant||verified.purpose!==PURPOSE||
      grant.purpose!==PURPOSE||grant.sourceCommit!==row.sourceCommit||
      grant.issuedAtMs>at||grant.expiresAtMs<=at||row.capturedAtMs>at)
      return DENY;
    // No path, no file metadata beyond the allowlisted inert descriptor,
    // no grant record, and no claim that a human approved this read.
    const descriptor=Object.freeze({mediaType:row.mediaType,byteLength:row.byteLength,
      sourceCommit:row.sourceCommit,capturedAtMs:row.capturedAtMs});
    return Object.freeze({ok:true,status:'DESCRIPTOR_CANDIDATE_ONLY',
      sender:verified.sender,project:verified.project,
      artifactSha256:verified.artifactSha256,descriptor,...FLAGS});
  }
  return Object.freeze({describe});
}
module.exports=Object.freeze({createCalliopeArtifactDescriptorGate});
