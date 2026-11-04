'use strict';
/**
 * NONLIVE v12 engineer composition: CTO two-phase settlement + authenticated
 * private spool + preserved v11 mount/identity gates. Fake host callbacks only.
 * Does not rewrite CTO modules, wire proxyConfigAPI, install a host worker,
 * open listeners, or invoke live Docker.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const {verifySignedCandidateRequest,signCandidateReply}=require('./rc1-content-bound-activation-request.cjs');
const {createSpoolClient,provisionPrivateQueue}=require('./rc1-activation-spool.cjs');
const {createRouteActivationSpoolAdapter}=require('./rc1-v8-spool-activation-adapter.cjs');
const {createProductionRouteMutationService}=require('./production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('./exclusive-route-mutation-lock.cjs');
const {
  createTwoPhaseHostSettlement,
  createVerifiedApiSettlementAck,
  verifySignedFinalSettlement
}=require('./rc1-two-phase-host-settlement.cjs');
const {createNonliveSettlementActivation,NONLIVE:CTO_ACTIVATION_NONLIVE}=
  require('./rc1-v12-nonlive-settlement-activation.cjs');
const {
  createFakeHostDockerProcess,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  SYNTHETIC_EXPECTED_MOUNTS,
  DEFAULT_CID,
  DEFAULT_IMAGE,
  DEFAULT_BIN,
  NONLIVE:V11_NONLIVE
}=require('./rc1-v11-host-mount-attestation-nonlive.cjs');
const {createMountLockedHostDockerDriver}=require('./rc1-host-mount-locked-docker-driver.cjs');
const {createClosureGatedHostDriver}=require('./rc1-closure-gated-host-driver.cjs');
const {createReadOnlyHostViewFromLoadedFiles,inspectLoadedNginxFileIdentity}=
  require('./rc1-loaded-nginx-file-identity.cjs');

const SUCCESS='RELOAD_AND_VERIFICATION_REPORTED';
const NONCE=/^[0-9a-f]{32,64}$/;

const NONLIVE=Object.freeze({
 label:'NONLIVE_TWO_PHASE_SETTLEMENT_V12',
 evidenceClass:'synthetic',
 runtimeAttestation:'NOT_RUNTIME_ATTESTED',
 productionChangeAuthorized:false,
 deployed:false,
 wiredToProxyConfigAPI:false,
 allowConfigEditRequiredFalse:true,
 actualHostAttested:false,
 effectiveNginxConfigComplete:false,
 ownerAuthorizationEstablished:false,
 mayInvokeHostDocker:true,
 preservesV11Helpers:true,
 remainingBlockers:Object.freeze([
  'Two-phase settlement reduces cooperating post-fence overlap but does not confine a hostile external writer or establish OS-level content immutability.',
  'mime.types / image-supplied modules and owner-approved private mount Source allowlist remain incomplete; effectiveNginxConfigComplete stays false.',
  'Synthetic fake execFile / in-process ACK is not Mac host Docker attestation or a trusted installed worker.',
  'No privileged host worker approval, live API spool wiring, Origin five PASS, or fresh owner GO.'
 ]),
 v11Label:V11_NONLIVE.label,
 ctoActivationLabel:CTO_ACTIVATION_NONLIVE.evidenceClass
});

async function syncDir(dir){
 const h=await fs.open(dir,'r');
 try{await h.sync();}finally{await h.close();}
}
async function writeNoReplace(dir,id,body){
 // Match rc1-activation-spool.cjs leaf naming: <id>.json
 const p=path.join(dir,id+'.json');let fd;
 try{
  fd=await fs.open(p,'wx',0o600);await fd.writeFile(body);await fd.sync();await fd.close();fd=null;
  await syncDir(dir);return true;
 }catch(e){if(fd)await fd.close();if(e.code==='EEXIST')return false;throw e;}
}
async function readPinnedJson(dir,id){
 const file=path.join(dir,id+'.json');
 let st;
 try{st=await fs.lstat(file,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||(st.mode&0o777n)!==0o600n)throw Error('UNSAFE_SPOOL_OBJECT');
 const raw=await fs.readFile(file,'utf8');
 return JSON.parse(raw);
}

/**
 * Authenticated private-spool host that drives CTO two-phase settlement for each
 * signed ticket, using the SAME spool request object for settlement.begin.
 */
function createSpoolBackedSettlementHost({
  spoolDirectory,leaseDirectory,approvedRoot,secret,simulateFixedHostAction,
  verifyHostPrepared,verifyActiveRoute,beforeApiAck,afterApiAck,now=Date.now
}={}){
  if(typeof spoolDirectory!=='string'||!path.isAbsolute(spoolDirectory)||
     typeof leaseDirectory!=='string'||!path.isAbsolute(leaseDirectory)||
     typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||
     !Buffer.isBuffer(secret)||secret.length<32||
     typeof simulateFixedHostAction!=='function'||
     typeof verifyHostPrepared!=='function'||typeof verifyActiveRoute!=='function')
    throw Error('INVALID_SPOOL_BACKED_SETTLEMENT_HOST');

  async function processOne(id){
    if(!NONCE.test(id))return Object.freeze({code:'INVALID_REQUEST_ID'});
    let request;
    try{request=await readPinnedJson(path.join(spoolDirectory,'requests'),id);}
    catch{return Object.freeze({code:'REQUEST_NOT_AUTHORIZED'});}
    if(!request||request.requestId!==id||!verifySignedCandidateRequest({request,secret,now}).ok)
      return Object.freeze({code:'REQUEST_NOT_AUTHORIZED'});

    const settlement=createTwoPhaseHostSettlement({
      directory:leaseDirectory,approvedRoot,secret,now,
      verifyHostPrepared,verifyActiveRoute
    });

    let status='HOST_OPERATION_INDETERMINATE';
    try{
      const before=await createCandidateManifest({approvedRoot});
      if(before.candidateSha256!==request.expectedCandidateSha256)status='CONFIG_SET_DIGEST_MISMATCH';
      else{
        await settlement.begin({request});
        if(await simulateFixedHostAction({request})!==true)throw Error('HOST_ACTION_NOT_VERIFIED');
        const prepared=await settlement.prepare({requestId:request.requestId});
        if(beforeApiAck)await beforeApiAck();
        const ack=await createVerifiedApiSettlementAck({prepared,secret,approvedRoot,now});
        if(afterApiAck)await afterApiAck();
        const final=await settlement.settle({ack});
        if(!verifySignedFinalSettlement({response:final,prepared,secret}).ok)
          throw Error('UNTRUSTED_FINAL_HOST_SETTLEMENT');
        const after=await createCandidateManifest({approvedRoot});
        if(after.candidateSha256!==request.expectedCandidateSha256)throw Error('POSTCHECK_CHANGED');
        status=SUCCESS;
      }
    }catch{status='HOST_OPERATION_INDETERMINATE';}

    let signed;
    try{signed=signCandidateReply({secret,request,status});}
    catch{signed=signCandidateReply({secret,request,status:'HOST_OPERATION_INDETERMINATE'});}
    await writeNoReplace(path.join(spoolDirectory,'responses'),id,JSON.stringify(signed)+'\n');
    return Object.freeze({code:'HOST_PROCESSED',status});
  }

  return Object.freeze({processOne});
}

function createNonliveV12TwoPhaseSettlementCandidate({
  root,runtimeRoot,spoolDirectory,leaseDirectory,secret,verifyActiveRoute,
  generateBundle,now=Date.now,timeoutMs=12000,pollMs=20,
  dockerBinary=DEFAULT_BIN,
  approvedContainerId=DEFAULT_CID,
  approvedImage=DEFAULT_IMAGE,
  expectedMounts=SYNTHETIC_EXPECTED_MOUNTS,
  fakeProcess,
  authorizeFixedHostAction=async()=>true,
  home='/tmp/dp-v12-nonlive-home',
  beforeApiAck,afterApiAck,
  preparedGate=async()=>true
}={}){
  if(typeof root!=='string'||!path.isAbsolute(root)||
     typeof runtimeRoot!=='string'||!path.isAbsolute(runtimeRoot)||root===runtimeRoot||
     typeof spoolDirectory!=='string'||!path.isAbsolute(spoolDirectory)||
     typeof leaseDirectory!=='string'||!path.isAbsolute(leaseDirectory)||
     typeof generateBundle!=='function'||!Buffer.isBuffer(secret)||secret.length<32||
     typeof verifyActiveRoute!=='function')
    throw Error('INVALID_NONLIVE_V12_SETTLEMENT_CANDIDATE');

  const processFake=fakeProcess||createFakeHostDockerProcess({
    expectedMounts,containerId:approvedContainerId,image:approvedImage
  });
  const mountLocked=createMountLockedHostDockerDriver({
    dockerBinary,approvedContainerId,approvedImage,expectedMounts,
    execFileImpl:processFake.execFileImpl,authorizeFixedHostAction,home,
    timeoutMs:Math.min(Number(timeoutMs)||7000,7000)
  });
  if(mountLocked.ownerAuthorizationEstablished!==false)
    throw Error('OWNER_AUTH_MUST_REMAIN_FALSE');

  const hostView=createReadOnlyHostViewFromLoadedFiles({approvedRoot:root,runtimeRoot});
  const gate=createClosureGatedHostDriver({
    approvedRoot:root,driver:mountLocked,hostView,verifyActiveRoute
  });

  const syncingGenerateBundle=async(...args)=>{
    const out=await generateBundle(...args);
    await mirrorLoadedTree({
      approvedRoot:root,runtimeRoot,
      only:['build/sites-enabled/apps.generated.conf']
    });
    return out;
  };

  async function simulateFixedHostAction(){
    if(await gate.driver.execute('nginx-test')!==0)return false;
    if(await gate.driver.execute('nginx-reload')!==0)return false;
    return true;
  }
  async function verifyHostPrepared(digest){
    if(await preparedGate(digest)!==true)return false;
    return (await gate.driver.attest())===true;
  }
  // Settlement calls verifyActiveRoute(digest); the v9 gate expects (signal,digest).
  async function verifyActiveRouteForSettlement(digest){
    return (await gate.verifyActiveRoute(undefined,digest))===true;
  }

  const settlementHost=createSpoolBackedSettlementHost({
    spoolDirectory,leaseDirectory,approvedRoot:root,secret,
    simulateFixedHostAction,verifyHostPrepared,
    verifyActiveRoute:verifyActiveRouteForSettlement,
    beforeApiAck,afterApiAck,now
  });

  const client=createSpoolClient({
    directory:spoolDirectory,secret,now,
    nonce:()=>crypto.randomBytes(16).toString('hex')
  });
  const spoolClient={
    submit:async(args)=>{
      const ticket=await client.submit(args);
      await settlementHost.processOne(ticket.requestId);
      return ticket;
    },
    readResult:client.readResult
  };

  const activation=createRouteActivationSpoolAdapter({
    approvedRoot:root,spoolClient,timeoutMs,pollMs
  });

  // Direct CTO activation retained for focused settlement proofs without spool.
  const directSettlement=createTwoPhaseHostSettlement({
    directory:leaseDirectory,approvedRoot:root,secret,now,
    verifyHostPrepared,verifyActiveRoute:verifyActiveRouteForSettlement
  });
  const directActivation=createNonliveSettlementActivation({
    approvedRoot:root,secret,host:directSettlement,
    simulateFixedHostAction,beforeApiAck,afterApiAck
  });

  const lock=createExclusiveMutationLock({
    directory:path.join(root,'.artifacts','route-mutation-locks')
  });
  const mutation=createProductionRouteMutationService({
    root,activation,generateBundle:syncingGenerateBundle,lock,allowConfigEdit:false
  });

  return Object.freeze({
    ...NONLIVE,
    mutation,
    activation,
    directActivation,
    gate,
    mountLocked,
    fakeProcess:processFake,
    settlementHost,
    inspectLoadedNginxFileIdentity:()=>inspectLoadedNginxFileIdentity({approvedRoot:root,runtimeRoot}),
    createTwoPhaseHostSettlement,
    createNonliveSettlementActivation,
    createVerifiedApiSettlementAck,
    verifySignedFinalSettlement,
    seedClosedCandidatePair,
    mirrorLoadedTree,
    provisionPrivateQueue
  });
}

module.exports={
  createNonliveV12TwoPhaseSettlementCandidate,
  createSpoolBackedSettlementHost,
  createFakeHostDockerProcess,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  provisionPrivateQueue,
  SYNTHETIC_EXPECTED_MOUNTS,
  NONLIVE,
  DEFAULT_CID,
  DEFAULT_IMAGE
};
