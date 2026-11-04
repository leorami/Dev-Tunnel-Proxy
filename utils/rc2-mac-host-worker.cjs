'use strict';
/**
 * Explicitly invoked Mac-host fixed-action settlement worker.
 * Reads operator-private pins from a 0600 JSON file (never from GitHub).
 * No network listener. No docker.sock mount. No automatic production GO.
 *
 * Pin file shape (paths redacted in receipts):
 * {
 *   "dockerBinary":"/usr/local/bin/docker",
 *   "proxyContainerId":"<64hex>",
 *   "proxyImage":"sha256:<64hex>",
 *   "expectedMounts":[{destination,source,readOnly}],
 *   "spoolDirectory":"/abs/private/spool",
 *   "leaseDirectory":"/abs/private/lease",
 *   "approvedRoot":"/abs/product-or-overlay-root",
 *   "secretFile":"/abs/private/secret",
 *   "authorizeFixedHostAction": true   // must be literal true in pin; still not owner GO
 * }
 */
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {createMountLockedHostDockerDriver}=require('./rc1-host-mount-locked-docker-driver.cjs');
const {createCrossProcessSettlementHost,provisionSettlementSpool}=require('./rc2-cross-process-settlement.cjs');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');

const CID=/^[a-f0-9]{64}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const NONCE=/^[0-9a-f]{32,64}$/;

function loadPrivatePin(pinPath){
 if(typeof pinPath!=='string'||!path.isAbsolute(pinPath)||path.normalize(pinPath)!==pinPath)
  throw Error('INVALID_HOST_WORKER_PIN_PATH');
 const st=fs.lstatSync(pinPath);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0)
  throw Error('UNSAFE_HOST_WORKER_PIN_FILE');
 const raw=fs.readFileSync(pinPath,'utf8');
 const pin=JSON.parse(raw);
 if(!pin||typeof pin!=='object'||Array.isArray(pin))throw Error('INVALID_HOST_WORKER_PIN');
 if(pin.authorizeFixedHostAction!==true)throw Error('HOST_ACTION_NOT_PIN_AUTHORIZED');
 if(!CID.test(pin.proxyContainerId||'')||!IMAGE.test(pin.proxyImage||'')||
    typeof pin.dockerBinary!=='string'||typeof pin.spoolDirectory!=='string'||
    typeof pin.leaseDirectory!=='string'||typeof pin.approvedRoot!=='string'||
    typeof pin.secretFile!=='string'||!Array.isArray(pin.expectedMounts))
  throw Error('INVALID_HOST_WORKER_PIN');
 const secretSt=fs.lstatSync(pin.secretFile);
 if(!secretSt.isFile()||secretSt.isSymbolicLink()||secretSt.nlink!==1||(secretSt.mode&0o077)!==0)
  throw Error('UNSAFE_HOST_WORKER_SECRET');
 const secret=fs.readFileSync(pin.secretFile);
 if(!Buffer.isBuffer(secret)||secret.length<32||secret.length>128)throw Error('INVALID_HOST_WORKER_SECRET');
 return Object.freeze({...pin,secret});
}

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
  verifyActiveRoute
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

async function main(argv=process.argv.slice(2)){
 const pinPath=argv[0]||process.env.DEVPROXY_HOST_WORKER_PIN;
 if(!pinPath){
  process.stderr.write('usage: node utils/rc2-mac-host-worker.cjs /abs/private/pin.json\n');
  process.exit(2);
 }
 const pin=loadPrivatePin(pinPath);
 await provisionSettlementSpool({directory:pin.spoolDirectory});
 const worker=createMacHostSettlementWorkerFromPin(pin);
 const mode=argv[1]||'scan-once';
 if(mode==='scan-once'){
  const results=await worker.scanOnce();
  process.stdout.write(JSON.stringify({code:'HOST_WORKER_SCAN_COMPLETE',count:results.length,
   productionChangeAuthorized:false,deployed:false})+'\n');
  return;
 }
 if(mode==='process-one'){
  const id=argv[2];
  if(!NONCE.test(id||''))throw Error('INVALID_REQUEST_ID');
  const result=await worker.processOne(id);
  process.stdout.write(JSON.stringify(result)+'\n');
  return;
 }
 throw Error('INVALID_HOST_WORKER_MODE');
}

module.exports={loadPrivatePin,createMacHostSettlementWorkerFromPin,main};
if(require.main===module){
 main().catch(err=>{
  process.stderr.write(String(err&&err.message||err)+'\n');
  process.exit(1);
 });
}
