'use strict';
/**
 * Engineer nonlive composition: CTO two-phase settlement over authenticated
 * private spool, retaining v11 mount/identity gates with fake execFile only.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {
  createNonliveV12TwoPhaseSettlementCandidate,
  createFakeHostDockerProcess,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  provisionPrivateQueue,
  NONLIVE,
  SYNTHETIC_EXPECTED_MOUNTS
}=require('../../utils/rc1-v12-two-phase-settlement-nonlive.cjs');
const {createSignedCandidateRequest}=require('../../utils/rc1-content-bound-activation-request.cjs');
const {createTwoPhaseHostSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
const {createCandidateManifest}=require('../../utils/rc1-route-candidate-manifest.cjs');

async function workspace(){
  const tmp=await fs.realpath(os.tmpdir());
  const base=await fs.mkdtemp(path.join(tmp,'dpv12-compose-'));
  await fs.chmod(base,0o700);
  const root=path.join(base,'approved');
  const runtimeRoot=path.join(base,'runtime');
  await fs.mkdir(root,{mode:0o700});
  await fs.mkdir(runtimeRoot,{mode:0o700});
  for(const d of ['apps','overrides','.artifacts','.artifacts/route-mutation-locks','spool','lease','lease/replay'])
    await fs.mkdir(path.join(root,d),{mode:0o700});
  await seedClosedCandidatePair({approvedRoot:root,runtimeRoot});
  await provisionPrivateQueue({directory:path.join(root,'spool')});
  for(let i=1;i<=17;i++){
    const n=String(i).padStart(2,'0');
    await fs.writeFile(path.join(root,'apps',`synth${n}.conf`),
      `location /synth${n}/ { return 200; }\n`,{mode:0o600});
  }
  const generateBundle=async()=>{
    const names=(await fs.readdir(path.join(root,'apps'))).filter(p=>p.endsWith('.conf')).sort();
    const sources=await Promise.all(names.map(n=>fs.readFile(path.join(root,'apps',n),'utf8')));
    await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),
      `# apps\n${sources.join('\n')}`,{mode:0o600});
    await fs.writeFile(path.join(root,'.artifacts/bundle-diagnostics.json'),
      JSON.stringify({count:names.length}),{mode:0o600});
    await fs.writeFile(path.join(root,'.artifacts/override-conflicts.json'),'[]',{mode:0o600});
  };
  await generateBundle();
  await mirrorLoadedTree({approvedRoot:root,runtimeRoot});
  return {base,root,runtimeRoot,generateBundle,close:()=>fs.rm(base,{recursive:true,force:true})};
}

function compose(w,extra={}){
  const fake=extra.fake||createFakeHostDockerProcess();
  return createNonliveV12TwoPhaseSettlementCandidate({
    root:w.root,
    runtimeRoot:w.runtimeRoot,
    spoolDirectory:path.join(w.root,'spool'),
    leaseDirectory:path.join(w.root,'lease'),
    secret:extra.secret||crypto.randomBytes(32),
    verifyActiveRoute:extra.verifyActiveRoute||(async()=>true),
    generateBundle:w.generateBundle,
    timeoutMs:extra.timeoutMs??3000,
    pollMs:extra.pollMs??10,
    fakeProcess:fake,
    beforeApiAck:extra.beforeApiAck,
    afterApiAck:extra.afterApiAck,
    preparedGate:extra.preparedGate,
    expectedMounts:extra.expectedMounts||SYNTHETIC_EXPECTED_MOUNTS
  });
}

async function leaseNames(root){
  return fs.readdir(path.join(root,'lease'));
}

test('nonlive v12 composition is present, API-unwired, NOT_RUNTIME_ATTESTED',()=>{
  assert.equal(typeof createNonliveV12TwoPhaseSettlementCandidate,'function');
  assert.equal(NONLIVE.wiredToProxyConfigAPI,false);
  assert.equal(NONLIVE.allowConfigEditRequiredFalse,true);
  assert.equal(NONLIVE.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
  assert.equal(NONLIVE.ownerAuthorizationEstablished,false);
  assert.equal(NONLIVE.deployed,false);
  assert.equal(NONLIVE.preservesV11Helpers,true);
  assert.equal(NONLIVE.evidenceClass,'synthetic');
});

test('spool-backed install succeeds with 17 synth routes, fixed nginx argv, settlement cleared',async()=>{
  const w=await workspace();
  try{
    const cand=compose(w);
    const id=await cand.inspectLoadedNginxFileIdentity();
    assert.equal(id.code,'FIXED_NGINX_FILES_MATCH_REPORTED');
    assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
    const r=await cand.mutation.install('v12ok','location /v12ok/ { return 200; }\n');
    assert.equal(r.httpStatus,200);assert.equal(r.ok,true);
    assert.deepEqual(cand.fakeProcess.executed(),[
      ['exec','e'.repeat(64),'nginx','-t'],
      ['exec','e'.repeat(64),'nginx','-s','reload']
    ]);
    assert.deepEqual(await leaseNames(w.root),['replay']);
    assert.equal(cand.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
    assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
    assert.equal((await fs.readdir(path.join(w.root,'spool','responses'))).length,1);
  }finally{await w.close();}
});

test('crash quarantine: failed prepare leaves inflight; later mutation cannot false-complete',async()=>{
  const w=await workspace();
  try{
    const cand=compose(w,{preparedGate:async()=>false});
    const a=await cand.mutation.install('bad','location /bad/ { return 200; }\n');
    assert.equal(a.httpStatus,503);assert.equal(a.ok,false);
    assert.equal((await leaseNames(w.root)).includes('host-settlement-inflight.json'),true);
    const later=await cand.mutation.install('later','location /later/ { return 200; }\n');
    assert.equal(later.httpStatus,503);
    assert.notEqual(later.httpStatus,200);
  }finally{await w.close();}
});

test('replay rejection: same signed request cannot begin settlement twice',async()=>{
  const w=await workspace();
  try{
    const secret=crypto.randomBytes(32);
    const cand=compose(w,{secret});
    const r=await cand.mutation.install('once','location /once/ { return 200; }\n');
    assert.equal(r.httpStatus,200);
    // Capture a fresh signed request and force settlement replay denial.
    const sha=(await createCandidateManifest({approvedRoot:w.root})).candidateSha256;
    const request=createSignedCandidateRequest({secret,expectedCandidateSha256:sha});
    const host=createTwoPhaseHostSettlement({
      directory:path.join(w.root,'lease'),approvedRoot:w.root,secret,
      verifyHostPrepared:async()=>true,verifyActiveRoute:async()=>true
    });
    await host.begin({request});
    await assert.rejects(()=>host.begin({request}),/HOST_SETTLEMENT_REPLAY_DENIED/);
  }finally{await w.close();}
});

test('content change BEFORE API ACK cannot complete; lease quarantined',async()=>{
  const w=await workspace();
  try{
    const cand=compose(w,{
      beforeApiAck:async()=>fs.appendFile(path.join(w.root,'config/nginx.production.conf'),'# altered\n')
    });
    const r=await cand.mutation.install('before','location /before/ { return 200; }\n');
    assert.equal(r.httpStatus,503);
    assert.equal((await leaseNames(w.root)).includes('host-settlement-inflight.json'),true);
  }finally{await w.close();}
});

test('content change AFTER API ACK blocked by host second check; no false 200',async()=>{
  const w=await workspace();
  try{
    const cand=compose(w,{
      afterApiAck:async()=>fs.appendFile(path.join(w.root,'config/nginx.production.conf'),'# altered\n')
    });
    const r=await cand.mutation.install('after','location /after/ { return 200; }\n');
    assert.equal(r.httpStatus,503);
    assert.equal((await leaseNames(w.root)).includes('host-settlement-inflight.json'),true);
  }finally{await w.close();}
});

test('v11 mount privilege denial prevents fixed action and yields no success',async()=>{
  const w=await workspace();
  try{
    const fake=createFakeHostDockerProcess();
    fake.setPrivileged(true);
    const cand=compose(w,{fake});
    const r=await cand.mutation.install('priv','location /priv/ { return 200; }\n');
    assert.equal(r.httpStatus,503);
    assert.deepEqual(fake.executed(),[]);
  }finally{await w.close();}
});

test('allowConfigEdit remains false on composed mutation service',async()=>{
  const w=await workspace();
  try{
    const before=await fs.readFile(path.join(w.root,'config/default.production.conf'));
    const cand=compose(w);
    const r=await cand.mutation.editConfig('default.production.conf','server { deny all; }\n');
    assert.equal(r.httpStatus,503);
    assert.equal(r.code,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
    assert.deepEqual(await fs.readFile(path.join(w.root,'config/default.production.conf')),before);
  }finally{await w.close();}
});
