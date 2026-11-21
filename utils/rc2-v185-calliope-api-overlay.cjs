'use strict';
/**
 * SOURCE-ONLY preimage-compatible local-brain API proposal.
 * Returns no host authorization and never writes/loads code.
 * RED stub to freeze tests before implementation.
 */
function buildCalliopeInstalledApiOverlay(){
  return Object.freeze({
    ok:false, code:'OVERLAY_CONTRACT_UNIMPLEMENTED',
    productionChangeAuthorized:false,hostAttested:false,
    apiRestartAuthorized:false,protectedMergeAuthorized:false
  });
}
module.exports=Object.freeze({buildCalliopeInstalledApiOverlay});
