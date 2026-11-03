'use strict';
/**
 * NONLIVE v10 composition: preserved v8 API–host spool closeout + CTO v9
 * closure-gated host driver + CTO v10 read-only loaded-file identity hostView.
 * Test-owned fixtures and injected fixed-action fakes only. Never wires
 * proxyConfigAPI, never installs a host worker, never mutates live Docker.
 *
 * Every successful synthetic path still returns NOT_RUNTIME_ATTESTED.
 */
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createNonliveV8ApiHostCloseoutCandidate,provisionPrivateQueue}=
  require('./rc1-v8-api-host-closeout-nonlive.cjs');
const {createClosureGatedHostDriver}=require('./rc1-closure-gated-host-driver.cjs');
const {createReadOnlyHostViewFromLoadedFiles,CANDIDATE_TO_LOADED,inspectLoadedNginxFileIdentity}=
  require('./rc1-loaded-nginx-file-identity.cjs');
const {createCandidateManifest,CANDIDATE_PATHS,PROTOCOL}=require('./rc1-route-candidate-manifest.cjs');

const NONLIVE=Object.freeze({
 label:'NONLIVE_LOADED_CONFIG_IDENTITY_V10',
 evidenceClass:'synthetic',
 runtimeAttestation:'NOT_RUNTIME_ATTESTED',
 productionChangeAuthorized:false,
 deployed:false,
 wiredToProxyConfigAPI:false,
 allowConfigEditRequiredFalse:true,
 actualHostAttested:false,
 effectiveNginxConfigComplete:false,
 candidatePaths:CANDIDATE_PATHS,
 protocol:PROTOCOL,
 remainingBlockers:Object.freeze([
  'Trusted operator must still bind Mac-loaded nginx file hashes, container image/mount identities, and the complete include graph (including mime.types and image-supplied modules) with read-only runtime evidence — helpers here are test-owned only.',
  'Post-fence-clear / outer-settle TOCTOU remains: after v7 fence clear and signed spool reply, outer v8/v5 re-hash can race a hostile writer; no cross-process content lease is granted.',
  'No privileged host worker approval, live API spool wiring, Origin five PASS, or fresh owner GO.'
 ])
});

const CLOSED_MAIN=
  'events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n';
const CLOSED_DEFAULT=
  'server { listen 80; include /etc/nginx/conf.d/sites-enabled/*.conf; }\n';
const CLOSED_BUNDLE='location /seed/ { return 200; }\n';

async function mirrorLoadedTree({approvedRoot,runtimeRoot,only}={}){
  const entries=Object.entries(CANDIDATE_TO_LOADED)
    .filter(([candidate])=>!only||only.includes(candidate));
  for(const [candidate,loaded] of entries){
    const src=path.join(approvedRoot,candidate);
    const dst=path.join(runtimeRoot,loaded);
    await fs.mkdir(path.dirname(dst),{recursive:true,mode:0o700});
    await fs.copyFile(src,dst);
    await fs.chmod(dst,0o600);
  }
}

/**
 * Seed a disposable approved+runtime pair that satisfies v9 static closure and
 * v10 fixed-file identity. Caller must chmod roots 0700 before use.
 */
async function seedClosedCandidatePair({approvedRoot,runtimeRoot,bundleText=CLOSED_BUNDLE}={}){
  if(typeof approvedRoot!=='string'||typeof runtimeRoot!=='string'||
     !path.isAbsolute(approvedRoot)||!path.isAbsolute(runtimeRoot)||approvedRoot===runtimeRoot)
    throw Error('INVALID_V10_SEED_ROOTS');
  for(const dir of [
    path.join(approvedRoot,'config'),
    path.join(approvedRoot,'build/sites-enabled'),
    path.join(runtimeRoot,'etc/nginx/conf.d/sites-enabled')
  ])await fs.mkdir(dir,{recursive:true,mode:0o700});
  const files={
    'config/nginx.production.conf':CLOSED_MAIN,
    'config/default.production.conf':CLOSED_DEFAULT,
    'build/sites-enabled/apps.generated.conf':bundleText
  };
  for(const [rel,body] of Object.entries(files)){
    const p=path.join(approvedRoot,rel);
    await fs.writeFile(p,body,{mode:0o600});
  }
  await mirrorLoadedTree({approvedRoot,runtimeRoot});
  return Object.freeze({main:CLOSED_MAIN,defaultConf:CLOSED_DEFAULT,bundle:bundleText});
}

/**
 * Compose gated driver + loaded identity hostView into the existing v8 nonlive
 * mutation surface. generateBundle must keep runtimeRoot bytes in lockstep with
 * the three approved candidate files for identity checks to remain meaningful.
 */
function createNonliveV10LoadedConfigIdentityCandidate({
  root,runtimeRoot,spoolDirectory,fenceDirectory,secret,driver,verifyActiveRoute,
  generateBundle,now=Date.now,timeoutMs=12000,pollMs=20
}={}){
  if(typeof root!=='string'||!path.isAbsolute(root)||
     typeof runtimeRoot!=='string'||!path.isAbsolute(runtimeRoot)||root===runtimeRoot||
     typeof generateBundle!=='function'||!Buffer.isBuffer(secret)||secret.length<32||
     !driver||typeof verifyActiveRoute!=='function')
    throw Error('INVALID_NONLIVE_V10_LOADED_IDENTITY_CANDIDATE');

  const hostView=createReadOnlyHostViewFromLoadedFiles({approvedRoot:root,runtimeRoot});
  const gate=createClosureGatedHostDriver({
    approvedRoot:root,driver,verifyActiveRoute,hostView
  });
  // Mutation regenerates only the route bundle. Re-mirroring nginx.conf /
  // default.conf would erase adversarial runtime drift the identity gate must see.
  const syncingGenerateBundle=async(...args)=>{
    const out=await generateBundle(...args);
    await mirrorLoadedTree({
      approvedRoot:root,
      runtimeRoot,
      only:['build/sites-enabled/apps.generated.conf']
    });
    return out;
  };
  const v8=createNonliveV8ApiHostCloseoutCandidate({
    root,
    spoolDirectory,
    fenceDirectory,
    secret,
    driver:gate.driver,
    verifyActiveRoute:gate.verifyActiveRoute,
    generateBundle:syncingGenerateBundle,
    now,
    timeoutMs,
    pollMs
  });
  return Object.freeze({
    ...NONLIVE,
    mutation:v8.mutation,
    activation:v8.activation,
    worker:v8.worker,
    gate,
    hostView,
    inspectLoadedNginxFileIdentity:()=>inspectLoadedNginxFileIdentity({approvedRoot:root,runtimeRoot}),
    createCandidateManifest,
    createClosureGatedHostDriver,
    createReadOnlyHostViewFromLoadedFiles,
    createNonliveV8ApiHostCloseoutCandidate,
    provisionPrivateQueue,
    mirrorLoadedTree
  });
}

module.exports={
  createNonliveV10LoadedConfigIdentityCandidate,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  NONLIVE,
  provisionPrivateQueue
};
