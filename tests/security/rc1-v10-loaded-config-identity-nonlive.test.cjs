'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {
  createNonliveV10LoadedConfigIdentityCandidate,
  seedClosedCandidatePair,
  NONLIVE,
  provisionPrivateQueue
}=require('../../utils/rc1-v10-loaded-config-identity-nonlive.cjs');

function goodDriver(trace=[]){
  return {
    async attest(){trace.push('attest');return true;},
    async execute(action){trace.push(action);return 0;}
  };
}
function hangReloadDriver(trace=[]){
  return {
    async attest(){trace.push('attest');return true;},
    async execute(action){
      trace.push(action);
      if(action==='nginx-reload')return await new Promise(()=>{});
      return 0;
    }
  };
}

async function workspace(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'dpv10-closeout-'));
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
  // Seed sync is performed by composition wrapper; pre-sync once for identity inspect
  const {mirrorLoadedTree}=require('../../utils/rc1-v10-loaded-config-identity-nonlive.cjs');
  await mirrorLoadedTree({approvedRoot:root,runtimeRoot});
  return {base,root,runtimeRoot,generateBundle,close:()=>fs.rm(base,{recursive:true,force:true})};
}

function compose(w,driver,extra={}){
  return createNonliveV10LoadedConfigIdentityCandidate({
    root:w.root,
    runtimeRoot:w.runtimeRoot,
    spoolDirectory:path.join(w.root,'spool'),
    fenceDirectory:path.join(w.root,'fence'),
    secret:crypto.randomBytes(32),
    driver,
    verifyActiveRoute:async()=>true,
    generateBundle:w.generateBundle,
    timeoutMs:extra.timeoutMs??2000,
    pollMs:extra.pollMs??10
  });
}

test('nonlive v10 composition is present, API-unwired, and NOT_RUNTIME_ATTESTED',()=>{
  assert.equal(typeof createNonliveV10LoadedConfigIdentityCandidate,'function');
  assert.equal(NONLIVE.wiredToProxyConfigAPI,false);
  assert.equal(NONLIVE.allowConfigEditRequiredFalse,true);
  assert.equal(NONLIVE.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
  assert.equal(NONLIVE.actualHostAttested,false);
  assert.equal(NONLIVE.deployed,false);
  assert.equal(NONLIVE.evidenceClass,'synthetic');
});

test('v8 install through v9 gate + v10 loaded identity succeeds synthetically with NOT_RUNTIME_ATTESTED',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    const id=await cand.inspectLoadedNginxFileIdentity();
    assert.equal(id.code,'FIXED_NGINX_FILES_MATCH_REPORTED');
    assert.equal(id.verifiedFileCount,3);
    assert.equal(id.actualHostAttested,false);
    const before=await fs.readdir(path.join(w.root,'apps'));
    assert.equal(before.filter(n=>n.startsWith('synth')).length,17);
    const r=await cand.mutation.install('v10ok','location /v10ok/ { return 200; }\n');
    assert.equal(r.httpStatus,200);assert.equal(r.ok,true);
    assert.ok(trace.includes('nginx-test')&&trace.includes('nginx-reload'));
    assert.equal(cand.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
    assert.equal(cand.gate.actualHostAttested,false);
    assert.equal(cand.gate.productionChangeAuthorized,false);
    assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
    const afterId=await cand.inspectLoadedNginxFileIdentity();
    assert.equal(afterId.code,'FIXED_NGINX_FILES_MATCH_REPORTED');
  }finally{await w.close();}
});

test('extra glob-matched sites-enabled .conf blocks fake fixed action before driver',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    await fs.writeFile(path.join(w.root,'build/sites-enabled/unbound.conf'),'location /x/ { return 200; }\n',{mode:0o600});
    const r=await cand.mutation.install('blocked','location /blocked/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(trace,[]);
  }finally{await w.close();}
});

test('altered loaded nginx default bytes block fixed action even with matching basename',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    await fs.appendFile(path.join(w.runtimeRoot,'etc/nginx/conf.d/default.conf'),'# tamper\n');
    const r=await cand.mutation.install('tamper','location /tamper/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(trace,[]);
  }finally{await w.close();}
});

test('nested include in candidate default denies before driver invocation',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    await fs.appendFile(path.join(w.root,'config/default.production.conf'),'include /tmp/evil.conf;\n');
    await fs.copyFile(
      path.join(w.root,'config/default.production.conf'),
      path.join(w.runtimeRoot,'etc/nginx/conf.d/default.conf'));
    const r=await cand.mutation.install('nested','location /nested/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(trace,[]);
  }finally{await w.close();}
});

test('unexpected loaded conf.d entry blocks fixed action',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    await fs.writeFile(path.join(w.runtimeRoot,'etc/nginx/conf.d/rogue.conf'),'server{}\n',{mode:0o600});
    const r=await cand.mutation.install('rogue','location /rogue/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(trace,[]);
  }finally{await w.close();}
});

test('group/other-writable loaded path is rejected as unsafe',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    await fs.chmod(path.join(w.runtimeRoot,'etc/nginx/conf.d/default.conf'),0o664);
    const id=await cand.inspectLoadedNginxFileIdentity();
    assert.equal(id.code,'LOADED_CONFIG_UNSAFE');
    const r=await cand.mutation.install('mode','location /mode/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(trace,[]);
  }finally{await w.close();}
});

test('symlink loaded config is rejected',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,goodDriver(trace));
    const target=path.join(w.runtimeRoot,'etc/nginx/conf.d/default.conf');
    const backup=path.join(w.runtimeRoot,'etc/nginx/conf.d/default.conf.real');
    await fs.rename(target,backup);
    await fs.symlink(backup,target);
    const id=await cand.inspectLoadedNginxFileIdentity();
    assert.ok(['LOADED_CONFIG_UNSAFE','LOADED_CONFIG_UNVERIFIABLE','UNEXPECTED_LOADED_CONFIG_NAME'].includes(id.code));
    const r=await cand.mutation.install('symlink','location /symlink/ { return 200; }\n');
    assert.notEqual(r.httpStatus,200);
    assert.deepEqual(trace,[]);
  }finally{await w.close();}
});

test('reload-path timeout remains indeterminate/quarantined; synthetic still NOT_RUNTIME_ATTESTED',async()=>{
  const w=await workspace();const trace=[];
  try{
    const cand=compose(w,hangReloadDriver(trace),{timeoutMs:80,pollMs:10});
    const first=await cand.mutation.install('hang','location /hang/ { return 200; }\n');
    assert.equal(first.httpStatus,503);
    assert.ok(['ACTIVATION_INDETERMINATE','ROUTE_STATE_QUARANTINED'].includes(first.code));
    assert.equal(cand.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
    const second=await cand.mutation.install('next','location /next/ { return 200; }\n');
    assert.equal(second.httpStatus,503);
  }finally{await w.close();}
});

test('allowConfigEdit remains false on composed mutation service',async()=>{
  const w=await workspace();
  try{
    const before=await fs.readFile(path.join(w.root,'config/default.production.conf'));
    const cand=compose(w,goodDriver());
    const r=await cand.mutation.editConfig('default.production.conf','server { deny all; }\n');
    assert.equal(r.httpStatus,503);
    assert.equal(r.code,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
    assert.deepEqual(await fs.readFile(path.join(w.root,'config/default.production.conf')),before);
    assert.equal(cand.allowConfigEditRequiredFalse,true);
  }finally{await w.close();}
});
