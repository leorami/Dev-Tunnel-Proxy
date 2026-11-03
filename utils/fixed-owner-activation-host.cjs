'use strict';
/**
 * Conservative host-only composition. A trusted operator must separately
 * provision the secret, private Unix socket directory, verified Docker identity,
 * and an active-route verifier. Nothing starts automatically; no deploy/GO.
 */
const path=require('node:path');
const {createAuthenticatedReloadBroker}=require('./owner-authenticated-reload.cjs');
const {createHostBundleDigestVerifier}=require('./host-bundle-digest-verifier.cjs');
const {createHostDockerAdapter}=require('./host-execfile-adapter.cjs');
function createFixedOwnerActivationHost({privateDirectory,approvedOwnerRoot,secret,
 dockerBinary,approvedContainerId,approvedImage,execFileImpl,verifyActiveRoute}={}){
 if(typeof privateDirectory!=='string'||!path.isAbsolute(privateDirectory)||
    !Buffer.isBuffer(secret)||secret.length<32||
    typeof approvedOwnerRoot!=='string'||!path.isAbsolute(approvedOwnerRoot)||
    typeof verifyActiveRoute!=='function')throw Error('INVALID_OWNER_RELOAD_HOST_AUTHORITY');
 const verifyCandidateBundle=createHostBundleDigestVerifier({approvedRoot:approvedOwnerRoot});
 const driver=createHostDockerAdapter({dockerBinary,approvedContainerId,approvedImage,
  ...(execFileImpl?{execFileImpl}:{})});
 return createAuthenticatedReloadBroker({directory:privateDirectory,secret,driver,
  verifyCandidateBundle,verifyActiveRoute});
}
module.exports={createFixedOwnerActivationHost};
