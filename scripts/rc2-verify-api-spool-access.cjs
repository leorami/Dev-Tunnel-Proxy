#!/usr/bin/env node
'use strict';
/**
 * Operator-only READ-ONLY post-start check for a privately pinned RC2 API.
 * Correlates the exact private Compose source manifest and the already
 * provisioned host pin to Docker inspect and an actual non-root Node process
 * inside the pinned API container. Does not read signing secret bytes into
 * this module (loader checks them), mutate queue files, install anything,
 * or report a production GO. No Docker exec -u overrides the API's real UID.
 */
const path=require('node:path');
const {loadVerifiedHostWorkerPin}=require('../utils/rc2-private-host-worker-pin.cjs');
const {readVerifiedBootstrapState}=require('./rc2-provision-private-host-worker.cjs');
const {createApiSpoolIdentityProbe}=require('../utils/rc2-api-spool-identity-probe.cjs');
const CID=/^[0-9a-f]{64}$/;
const blocked=()=>Object.freeze({code:'API_SPOOL_CROSS_UID_BLOCKED',productionChangeAuthorized:false,
 deployed:false,runtimeAttested:false,ownerUatApproved:false});
function exact(a,b){return JSON.stringify(a)===JSON.stringify(b);}
async function verifyProvisionedApiSpoolAccess({stageRoot,apiContainerId,
 execFileImpl,home=process.env.HOME}={}){
 if(typeof stageRoot!=='string'||!path.isAbsolute(stageRoot)||path.normalize(stageRoot)!==stageRoot||
    stageRoot==='/'||stageRoot.endsWith(path.sep)||!CID.test(apiContainerId||''))return blocked();
 try{
  const {manifest,candidate}=await readVerifiedBootstrapState({stageRoot});
  const pin=loadVerifiedHostWorkerPin(path.join(stageRoot,'worker.pin.json'));
  // The pin is source-verified but a stale or replaced copy must not pass.
  const same=pin.proxyContainerId===manifest.proxyContainerId&&
   pin.proxyImage===manifest.proxyImage&&pin.spoolDirectory===path.join(stageRoot,'host-share','spool')&&
   pin.leaseDirectory===path.join(stageRoot,'lease')&&
   pin.secretFile===path.join(stageRoot,'activation.secret')&&
   pin.approvedRoot===manifest.approvedRoot&&exact(pin.expectedMounts,manifest.expectedMounts);
  pin.secret.fill(0);
  if(!same)return blocked();
  const expectedApiDigest=candidate.apiImage.slice(candidate.apiImage.lastIndexOf('@')+1);
  const probe=createApiSpoolIdentityProbe({
   dockerBinary:manifest.dockerBinary,containerId:apiContainerId,image:expectedApiDigest,
   spoolHostDir:candidate.paths.spoolHostDir,secretHostFile:candidate.paths.secretHostFile,
   apiUid:candidate.apiUid,apiGid:candidate.apiGid,home,
   ...(execFileImpl===undefined?{}:{execFileImpl})
  });
  return await probe.inspect();
 }catch{return blocked();}
}
module.exports={verifyProvisionedApiSpoolAccess};
if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length!==2){process.stderr.write('RC2_READONLY_PROBE_INVALID_INVOCATION\n');process.exitCode=2;}
 else verifyProvisionedApiSpoolAccess({stageRoot:args[0],apiContainerId:args[1]}).then(r=>{
  process.stdout.write(r.code+' / NOT_DEPLOYED\n');
  if(r.code!=='API_SPOOL_CROSS_UID_EVIDENCE_ONLY')process.exitCode=2;
 }).catch(()=>{process.stderr.write('API_SPOOL_CROSS_UID_BLOCKED\n');process.exitCode=2;});
}
