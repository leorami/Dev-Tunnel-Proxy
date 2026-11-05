'use strict';
/**
 * Internal fixed-action Mac host settlement constructor, NOT an executable
 * worker entrypoint and NOT a pin reader. The approved code path is
 * scripts/rc2-supervised-mac-host-worker.cjs, which loads strictly verified
 * private pins and holds the crash-durable exclusive singleton before scans.
 * No network listener or docker.sock bind is created here.
 */
const fsp=require('node:fs/promises');
const path=require('node:path');
const {createMountLockedHostDockerDriver}=require('./rc1-host-mount-locked-docker-driver.cjs');
const {createCrossProcessSettlementHost,provisionSettlementSpool}=require('./rc2-cross-process-settlement.cjs');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');

const NONCE=/^[0-9a-f]{32,64}$/;

// Historic direct pin reading is intentionally retired: it was less strict
// than loadVerifiedHostWorkerPin and bypassed the exclusive singleton.
// The only supported executable entrypoint is scripts/rc2-supervised-mac-host-worker.cjs.

function createMacHostSettlementWorkerFromPin(pin){
 const driver=createMountLockedHostDockerDriver({
  dockerBinary:pin.dockerBinary,
  approvedContainerId:pin.proxyContainerId,
  approvedImage:pin.proxyImage,
  expectedMounts:pin.expectedMounts,
  home:process.env.HOME,
  authorizeFixedHostAction:async(action)=>{
   if(action!=='nginx-test'&&action!=='nginx-reload')return false;
   return pin.authorizeFixedHostAction===true;
  }
 });
 async function executeFixedHostAction({expectedCandidateSha256}={}){
  if(typeof expectedCandidateSha256!=='string'||!/^[0-9a-f]{64}$/.test(expectedCandidateSha256))
   return false;
  if(await driver.attest()!==true)return false;
  if(await driver.execute('nginx-test')!==0)return false;
  if(await driver.attest()!==true)return false;
  if(await driver.execute('nginx-reload')!==0)return false;
  if(await driver.attest()!==true)return false;
  const after=await createCandidateManifest({approvedRoot:pin.approvedRoot});
  if(after.candidateSha256!==expectedCandidateSha256)return false;
  return true;
 }
 async function verifyHostPrepared(digest){
  if(await driver.attest()!==true)return false;
  const m=await createCandidateManifest({approvedRoot:pin.approvedRoot});
  return m.candidateSha256===digest;
 }
 async function verifyActiveRoute(digest){
  // Active-route proof is candidate digest continuity after attested reload.
  // Full HTTP origin probes remain a separate Origin-five gate.
  return verifyHostPrepared(digest);
 }
 const host=createCrossProcessSettlementHost({
  spoolDirectory:pin.spoolDirectory,
  leaseDirectory:pin.leaseDirectory,
  approvedRoot:pin.approvedRoot,
  secret:pin.secret,
  executeFixedHostAction,
  verifyHostPrepared,
  verifyActiveRoute,
  // Docker Desktop host↔container bind visibility can lag; keep ACK wait inside API budget.
  ackTimeoutMs:20000
 });
 return Object.freeze({
  async processOne(id){return host.processOne(id);},
  async scanOnce(){
   await provisionSettlementSpool({directory:pin.spoolDirectory});
   const names=await fsp.readdir(path.join(pin.spoolDirectory,'requests'));
   const ids=names.filter(n=>/^[0-9a-f]{32,64}\.json$/.test(n)).map(n=>n.slice(0,-5));
   const out=[];
   for(const id of ids){
    if(!NONCE.test(id))continue;
    out.push(await host.processOne(id));
   }
   return Object.freeze(out);
  },
  driver
 });
}

async function main(){
  // Never load even an operator-supplied pin, touch the private spool, or
  // execute a fixed Docker action outside the audited exclusive supervisor.
  throw Error('HOST_WORKER_SUPERVISOR_REQUIRED');
}

module.exports={createMacHostSettlementWorkerFromPin,main};
if(require.main===module){
  process.stderr.write('HOST_WORKER_SUPERVISOR_REQUIRED\n');
  process.exitCode=2;
}
