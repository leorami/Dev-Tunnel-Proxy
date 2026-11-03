'use strict';
/**
 * NONLIVE v6 composition surface for source review only.
 * Does not start workers, open sockets, touch owner .artifacts, or alter
 * the running v5 API (Unix-socket client + allowConfigEdit:false).
 * Future live wiring requires separate code review, host attestation, and
 * owner authorization for the privileged host worker.
 */
const {createCandidateManifest,CANDIDATE_PATHS,PROTOCOL}=require('./rc1-route-candidate-manifest.cjs');
const {createSignedCandidateRequest,verifySignedCandidateRequest,
  signCandidateReply,verifySignedCandidateReply,ACTION}=require('./rc1-content-bound-activation-request.cjs');
const {provisionPrivateQueue,createSpoolClient,createSpoolHost}=require('./rc1-activation-spool.cjs');
const {createFixedActivationHostWorker}=require('./rc1-fixed-activation-host-worker.cjs');
const {createGuardedNonliveHostWorker}=require('./rc1-v7-guarded-host-worker-nonlive.cjs');
const {createHostOperationQuarantine}=require('./rc1-host-operation-quarantine.cjs');

const NONLIVE=Object.freeze({
  label:'SOURCE_CONTENT_BINDING_V6_NONLIVE',
  productionChangeAuthorized:false,
  deployed:false,
  wiredToProxyConfigAPI:false,
  allowConfigEditRequiredFalse:true,
  transport:'signed-files-over-private-bind-mount',
  replacesUnixSocketAtRuntime:false,
  candidatePaths:CANDIDATE_PATHS,
  protocol:PROTOCOL,
  action:ACTION,
});

function createNonliveV6BindIpcCandidate(){
  return Object.freeze({
    ...NONLIVE,
    createCandidateManifest,
    createSignedCandidateRequest,
    verifySignedCandidateRequest,
    signCandidateReply,
    verifySignedCandidateReply,
    provisionPrivateQueue,
    createSpoolClient,
    createSpoolHost,
    createFixedActivationHostWorker,
    createHostOperationQuarantine,
    createGuardedNonliveHostWorker,
  });
}

module.exports={createNonliveV6BindIpcCandidate,NONLIVE};
