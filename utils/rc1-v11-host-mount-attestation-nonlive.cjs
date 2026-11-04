'use strict';
/**
 * NONLIVE v11 composition: preserved v10 loaded-config identity stack + CTO
 * createMountLockedHostDockerDriver (actual fixed adapter, fake execFile only).
 * Does not recreate CTO modules, wire proxyConfigAPI, install a host worker,
 * open listeners, touch owner .artifacts, or invoke a live Docker daemon.
 *
 * Every successful synthetic path remains NOT_RUNTIME_ATTESTED.
 * ownerAuthorizationEstablished stays false; a test authorize callback is not
 * owner permission.
 */
const path=require('node:path');
const {
  createNonliveV10LoadedConfigIdentityCandidate,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  provisionPrivateQueue,
  NONLIVE:V10_NONLIVE
}=require('./rc1-v10-loaded-config-identity-nonlive.cjs');
const {createMountLockedHostDockerDriver}=require('./rc1-host-mount-locked-docker-driver.cjs');
const {createClosureGatedHostDriver}=require('./rc1-closure-gated-host-driver.cjs');

const NONLIVE=Object.freeze({
 label:'NONLIVE_HOST_MOUNT_ATTESTATION_V11',
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
 preservesV10Helpers:true,
 remainingBlockers:Object.freeze([
  'mime.types / image-supplied nginx modules remain outside the three-file identity + mount inventory; effectiveNginxConfigComplete stays false.',
  'v7 fence-clear / v8 outer-settle TOCTOU remains open; no cross-process content lease is granted.',
  'Synthetic fake execFile is not Mac host Docker attestation. Trusted operator must still supply private full ID, image digest, exact mount Source allowlist, and a separately authorized host callback.',
  'No privileged host worker approval, live API spool wiring, Origin five PASS, or fresh owner GO.'
 ]),
 v10Label:V10_NONLIVE.label
});

/** Disposable test-only expected mounts. Sources must never appear in responses. */
const SYNTHETIC_EXPECTED_MOUNTS=Object.freeze([
 Object.freeze({destination:'/etc/nginx/nginx.conf',source:'/private/dp-v11-test/nginx.conf',readOnly:true}),
 Object.freeze({destination:'/etc/nginx/conf.d/default.conf',source:'/private/dp-v11-test/default.conf',readOnly:true}),
 Object.freeze({destination:'/etc/nginx/conf.d/sites-enabled',source:'/private/dp-v11-test/sites',readOnly:true}),
 Object.freeze({destination:'/usr/share/nginx/html/.artifacts',source:'/private/dp-v11-test/artifacts',readOnly:false})
]);

const DEFAULT_CID='e'.repeat(64);
const DEFAULT_IMAGE='sha256:'+'f'.repeat(64);
const DEFAULT_BIN='/usr/local/bin/docker';
const INSPECT_FMT='{{.Id}} {{.Image}} {{.State.Running}}';
const PRIV_FMT='{{json .HostConfig.Privileged}}';
const MOUNT_FMT='{{json .Mounts}}';

function cloneMounts(expected=SYNTHETIC_EXPECTED_MOUNTS){
 return expected.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly}));
}

/**
 * Controllable fake Docker process for the real mount-locked adapter.
 * Never talks to a daemon. Mutators let RED tests force drift / privilege / pin
 * changes without printing private Sources into assertions beyond equality checks.
 */
function createFakeHostDockerProcess({
 expectedMounts=SYNTHETIC_EXPECTED_MOUNTS,
 containerId=DEFAULT_CID,
 image=DEFAULT_IMAGE,
 running=true,
 privileged=false
}={}){
 const history=[];
 let cid=containerId,img=image,isRunning=running,isPrivileged=privileged;
 let mounts=cloneMounts(expectedMounts);
 let afterExecMutator=null;
 let hangFormats=new Set();
 const execFileImpl=(binary,args,opts,cb)=>{
  history.push(Object.freeze({binary,args:Object.freeze([...args]),options:opts}));
  const fmt=args[0]==='inspect'?args[2]:null;
  if(hangFormats.has(fmt))return;
  if(args[0]==='exec'&&typeof afterExecMutator==='function')afterExecMutator();
  const text=fmt===INSPECT_FMT?`${cid} ${img} ${isRunning}\n`:
    fmt===PRIV_FMT?JSON.stringify(isPrivileged)+'\n':
    fmt===MOUNT_FMT?JSON.stringify(mounts)+'\n':'';
  queueMicrotask(()=>cb(null,text,''));
 };
 return {
  execFileImpl,
  history,
  setPrivileged(v){isPrivileged=v===true;},
  setRunning(v){isRunning=v===true;},
  setContainerId(v){cid=v;},
  setImage(v){img=v;},
  setMounts(v){mounts=v;},
  resetMounts(){mounts=cloneMounts(expectedMounts);},
  afterExec(mutator){afterExecMutator=mutator;},
  hangOn(fmt){hangFormats.add(fmt);},
  clearHistory(){history.length=0;},
  executed(){return history.filter(x=>x.args[0]==='exec').map(x=>[...x.args]);},
  privateSources(){return expectedMounts.map(m=>m.source)}
 };
}

/**
 * Build the real CTO mount-locked driver over a fake execFile, then feed it into
 * the preserved v10 composition (closure gate + loaded identity + v8 spool).
 */
function createNonliveV11HostMountAttestationCandidate({
  root,runtimeRoot,spoolDirectory,fenceDirectory,secret,verifyActiveRoute,
  generateBundle,now=Date.now,timeoutMs=12000,pollMs=20,
  dockerBinary=DEFAULT_BIN,
  approvedContainerId=DEFAULT_CID,
  approvedImage=DEFAULT_IMAGE,
  expectedMounts=SYNTHETIC_EXPECTED_MOUNTS,
  fakeProcess,
  authorizeFixedHostAction=async()=>true,
  home='/tmp/dp-v11-nonlive-home'
}={}){
  if(typeof root!=='string'||!path.isAbsolute(root)||
     typeof runtimeRoot!=='string'||!path.isAbsolute(runtimeRoot)||root===runtimeRoot||
     typeof generateBundle!=='function'||!Buffer.isBuffer(secret)||secret.length<32||
     typeof verifyActiveRoute!=='function')
    throw Error('INVALID_NONLIVE_V11_HOST_MOUNT_CANDIDATE');

  const processFake=fakeProcess||createFakeHostDockerProcess({
    expectedMounts,containerId:approvedContainerId,image:approvedImage
  });
  const mountLocked=createMountLockedHostDockerDriver({
    dockerBinary,
    approvedContainerId,
    approvedImage,
    expectedMounts,
    execFileImpl:processFake.execFileImpl,
    authorizeFixedHostAction,
    home,
    timeoutMs:Math.min(Number(timeoutMs)||7000,7000)
  });
  if(mountLocked.ownerAuthorizationEstablished!==false)
    throw Error('OWNER_AUTH_MUST_REMAIN_FALSE');

  const v10=createNonliveV10LoadedConfigIdentityCandidate({
    root,runtimeRoot,spoolDirectory,fenceDirectory,secret,
    driver:mountLocked,verifyActiveRoute,generateBundle,now,timeoutMs,pollMs
  });

  return Object.freeze({
    ...NONLIVE,
    mutation:v10.mutation,
    activation:v10.activation,
    worker:v10.worker,
    gate:v10.gate,
    hostView:v10.hostView,
    mountLocked,
    fakeProcess:processFake,
    inspectLoadedNginxFileIdentity:v10.inspectLoadedNginxFileIdentity,
    createNonliveV10LoadedConfigIdentityCandidate,
    createMountLockedHostDockerDriver,
    createClosureGatedHostDriver,
    seedClosedCandidatePair,
    mirrorLoadedTree,
    provisionPrivateQueue
  });
}

module.exports={
  createNonliveV11HostMountAttestationCandidate,
  createFakeHostDockerProcess,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  provisionPrivateQueue,
  SYNTHETIC_EXPECTED_MOUNTS,
  NONLIVE,
  DEFAULT_CID,
  DEFAULT_IMAGE,
  DEFAULT_BIN
};
