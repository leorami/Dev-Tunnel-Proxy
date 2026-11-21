'use strict';
/**
 * V187 exact deployed-API preimage, source-only, no host or network actions.
 * Initial RED stub: tests must demonstrate observed fallback-before-model
 * priority defect before anyone changes the installed application.
 */
const FLAGS=Object.freeze({
  productionChangeAuthorized:false,apiRestartAuthorized:false,
  hostAttested:false,processLoaded:false,ownerUatAccepted:false,
  healingPerformed:false
});
function compileModelFirstApi(){
  return Object.freeze({ok:false,code:'MODEL_PRIORITY_NOT_IMPLEMENTED',...FLAGS});
}
module.exports=Object.freeze({compileModelFirstApi});
