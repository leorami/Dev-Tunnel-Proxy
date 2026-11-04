'use strict';
/**
 * NONLIVE engineer composition for v11: real createMountLockedHostDockerDriver
 * with fake execFile, wrapped by preserved v10 closure/identity + v8 spool
 * mutation over 17 synthetic routes. No Docker daemon, no owner data.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const util=require('node:util');
const {
  createNonliveV11HostMountAttestationCandidate,
  createFakeHostDockerProcess,
  seedClosedCandidatePair,
  mirrorLoadedTree,
  provisionPrivateQueue,
  SYNTHETIC_EXPECTED_MOUNTS,
  NONLIVE,
  DEFAULT_CID,
  DEFAULT_IMAGE
}=require('../../utils/rc1-v11-host-mount-attestation-nonlive.cjs');

function assertNoPrivateSourceLeak(value,sources){
  const seen=util.inspect(value,{depth:8,maxArrayLength:200,breakLength:120});
  for(const src of sources){
    assert.equal(seen.includes(src),false,
      `private expected mount Source must not appear in responses/logs: redacted`);
  }
}

async function workspace(){
  // macOS /var -> /private/var: identity checks require realpath(root)===root.
  const tmp=await fs.realpath(os.tmpdir());
  const base=await fs.mkdtemp(path.join(tmp,'dpv11-mount-'));
  await fs.chmod(base,0o700);
  const root=path.join(base,'approved');
  const runtimeRoot=path.join(base,'runtime');
  await fs.mkdir(root,{mode:0o700});
  await fs.mkdir(runtimeRoot,{mode:0o700});
  for(const d of ['apps','overrides','.artifacts','.artifacts/route-mutation-locks','spool','fence'])
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
  const cand=createNonliveV11HostMountAttestationCandidate({
    root:w.root,
    runtimeRoot:w.runtimeRoot,
    spoolDirectory:path.join(w.root,'spool'),
    fenceDirectory:path.join(w.root,'fence'),
    secret:crypto.randomBytes(32),
    verifyActiveRoute:extra.verifyActiveRoute||(async()=>true),
    generateBundle:w.generateBundle,
    timeoutMs:extra.timeoutMs??2000,
    pollMs:extra.pollMs??10,
    fakeProcess:fake,
    authorizeFixedHostAction:extra.authorizeFixedHostAction,
    expectedMounts:extra.expectedMounts||SYNTHETIC_EXPECTED_MOUNTS,
    approvedContainerId:extra.approvedContainerId||DEFAULT_CID,
    approvedImage:extra.approvedImage||DEFAULT_IMAGE
  });
  return {cand,fake};
}

test('nonlive v11 composition is present, API-unwired, ownerAuthorizationEstablished false',()=>{
  assert.equal(typeof createNonliveV11HostMountAttestationCandidate,'function');
  assert.equal(NONLIVE.wiredToProxyConfigAPI,false);
  assert.equal(NONLIVE.allowConfigEditRequiredFalse,true);
  assert.equal(NONLIVE.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
  assert.equal(NONLIVE.actualHostAttested,false);
  assert.equal(NONLIVE.deployed,false);
  assert.equal(NONLIVE.ownerAuthorizationEstablished,false);
  assert.equal(NONLIVE.mayInvokeHostDocker,true);
  assert.equal(NONLIVE.evidenceClass,'synthetic');
  assert.equal(NONLIVE.preservesV10Helpers,true);
});

test('v11 positive path: 17 synth routes + signed spool/fence mutate with fixed nginx argv only',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    assert.equal(cand.mountLocked.ownerAuthorizationEstablished,false);
    assert.equal(cand.gate.actualHostAttested,false);
    const before=(await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth'));
    assert.equal(before.length,17);
    const id=await cand.inspectLoadedNginxFileIdentity();
    assert.equal(id.code,'FIXED_NGINX_FILES_MATCH_REPORTED');
    const r=await cand.mutation.install('v11ok','location /v11ok/ { return 200; }\n');
    assert.equal(r.httpStatus,200);assert.equal(r.ok,true);
    assert.deepEqual(fake.executed(),[
      ['exec',DEFAULT_CID,'nginx','-t'],
      ['exec',DEFAULT_CID,'nginx','-s','reload']
    ]);
    assert.equal(cand.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
    assert.equal(cand.ownerAuthorizationEstablished,false);
    assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
    assertNoPrivateSourceLeak(r,fake.privateSources());
    assertNoPrivateSourceLeak(id,fake.privateSources());
  }finally{await w.close();}
});

test('RED: additional unexpected image/root mount denies before nginx exec',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    fake.setMounts([
      ...SYNTHETIC_EXPECTED_MOUNTS.map(x=>({Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly})),
      {Type:'bind',Source:'/private/tmp/extra-root',Destination:'/',RW:false}
    ]);
    const r=await cand.mutation.install('extra','location /extra/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(fake.executed(),[]);
    assertNoPrivateSourceLeak(r,fake.privateSources());
  }finally{await w.close();}
});

test('RED: required nginx config bind turning RW denies fixed action',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    const mounts=SYNTHETIC_EXPECTED_MOUNTS.map(x=>({
      Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly
    }));
    mounts[1].RW=true;
    fake.setMounts(mounts);
    const r=await cand.mutation.install('rwdrift','location /rwdrift/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(fake.executed(),[]);
    assertNoPrivateSourceLeak(r,fake.privateSources());
  }finally{await w.close();}
});

test('RED: privileged=true denies without Docker exec',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    fake.setPrivileged(true);
    const r=await cand.mutation.install('priv','location /priv/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(fake.executed(),[]);
  }finally{await w.close();}
});

test('RED: full container id or image pin change denies',async()=>{
  const w=await workspace();
  try{
    for(const mut of [
      f=>f.setContainerId('c'.repeat(64)),
      f=>f.setImage('sha256:'+'d'.repeat(64)),
      f=>f.setRunning(false)
    ]){
      const {cand,fake}=compose(w);
      mut(fake);fake.clearHistory();
      const r=await cand.mutation.install('pin','location /pin/ { return 200; }\n');
      assert.notEqual(r.httpStatus,200);
      assert.deepEqual(fake.executed(),[]);
      assertNoPrivateSourceLeak(r,fake.privateSources());
    }
  }finally{await w.close();}
});

test('RED: cancellation after nginx-test prevents successful reload classification',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    assert.equal(await cand.gate.driver.execute('nginx-test'),0);
    assert.deepEqual(fake.executed(),[['exec',DEFAULT_CID,'nginx','-t']]);
    const ac=new AbortController();
    ac.abort();
    assert.equal(await cand.gate.driver.execute('nginx-reload',ac.signal),1);
    assert.deepEqual(fake.executed(),[['exec',DEFAULT_CID,'nginx','-t']]);
  }finally{await w.close();}
});

test('RED: post-reload inspect mount drift cannot classify mutation success',async()=>{
  const w=await workspace();
  try{
    const fake=createFakeHostDockerProcess();
    fake.afterExec(()=>{
      // Drift only after reload argv; nginx-test post-attest must still pass.
      const last=fake.history.at(-1);
      if(!last||last.args[0]!=='exec'||!last.args.includes('reload'))return;
      const mounts=SYNTHETIC_EXPECTED_MOUNTS.map(x=>({
        Type:'bind',Source:x.source,Destination:x.destination,RW:!x.readOnly
      }));
      mounts[0].RW=true;
      fake.setMounts(mounts);
    });
    const {cand}=compose(w,{fake});
    const r=await cand.mutation.install('postdrift','location /postdrift/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(fake.executed(),[
      ['exec',DEFAULT_CID,'nginx','-t'],
      ['exec',DEFAULT_CID,'nginx','-s','reload']
    ]);
    assertNoPrivateSourceLeak(r,fake.privateSources());
  }finally{await w.close();}
});

test('positive re-run still only issues fixed docker exec nginx -t|-s reload argv',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    assert.equal(await cand.gate.driver.execute('nginx-test'),0);
    assert.deepEqual(fake.executed(),[['exec',DEFAULT_CID,'nginx','-t']]);
    fake.clearHistory();
    assert.equal(await cand.gate.driver.execute('nginx-reload'),0);
    assert.deepEqual(fake.executed(),[['exec',DEFAULT_CID,'nginx','-s','reload']]);
    assert.equal(await cand.gate.driver.execute('sh -c id'),1);
    assert.deepEqual(fake.executed(),[['exec',DEFAULT_CID,'nginx','-s','reload']]);
  }finally{await w.close();}
});

test('allowConfigEdit remains false; private Sources never appear in blocked edit reply',async()=>{
  const w=await workspace();
  try{
    const before=await fs.readFile(path.join(w.root,'config/default.production.conf'));
    const {cand,fake}=compose(w);
    const r=await cand.mutation.editConfig('default.production.conf','server { deny all; }\n');
    assert.equal(r.httpStatus,503);
    assert.equal(r.code,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
    assert.deepEqual(await fs.readFile(path.join(w.root,'config/default.production.conf')),before);
    assert.equal(cand.allowConfigEditRequiredFalse,true);
    assertNoPrivateSourceLeak(r,fake.privateSources());
    assertNoPrivateSourceLeak(cand.mountLocked,fake.privateSources());
  }finally{await w.close();}
});

test('v10 identity helpers remain usable: extra glob site still blocks before Docker',async()=>{
  const w=await workspace();
  try{
    const {cand,fake}=compose(w);
    await fs.writeFile(path.join(w.root,'build/sites-enabled/unbound.conf'),
      'location /x/ { return 200; }\n',{mode:0o600});
    const r=await cand.mutation.install('unbound','location /unbound/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(fake.executed(),[]);
  }finally{await w.close();}
});
