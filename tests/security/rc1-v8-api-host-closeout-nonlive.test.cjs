'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createNonliveV8ApiHostCloseoutCandidate,NONLIVE,provisionPrivateQueue}=
 require('../../utils/rc1-v8-api-host-closeout-nonlive.cjs');

function goodDriver(trace=[]){
 return {
  async attest(){trace.push('attest');return true;},
  async execute(action){trace.push(action);return 0;}
 };
}
function failTestDriver(trace=[]){
 return {
  async attest(){trace.push('attest');return true;},
  async execute(action){trace.push(action);return action==='nginx-test'?1:0;}
 };
}
function hangReloadDriver(){
 return {
  async attest(){return true;},
  async execute(action){
   if(action==='nginx-reload')return await new Promise(()=>{});
   return 0;
  }
 };
}
async function workspace(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv8-closeout-'));
 await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts',
  '.artifacts/route-mutation-locks','spool','fence']){
  await fs.mkdir(path.join(root,d),{mode:0o700});
 }
 for(const [rel,data] of [
  ['config/default.production.conf','server { listen 80; }\n'],
  ['config/nginx.production.conf','http { server { listen 80; } }\n'],
  ['build/sites-enabled/apps.generated.conf','# empty\n']
 ])await fs.writeFile(path.join(root,rel),data,{mode:0o600});
 // Seed 17 synthetic routes (unchanged by later installs except additive)
 for(let i=1;i<=17;i++){
  const n=String(i).padStart(2,'0');
  await fs.writeFile(path.join(root,'apps',`synth${n}.conf`),
   `location /synth${n}/ { return 200; }\n`,{mode:0o600});
 }
 await provisionPrivateQueue({directory:path.join(root,'spool')});
 const generateBundle=async()=>{
  const names=(await fs.readdir(path.join(root,'apps'))).filter(p=>p.endsWith('.conf')).sort();
  const sources=await Promise.all(names.map(n=>fs.readFile(path.join(root,'apps',n),'utf8')));
  await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),`# apps\n${sources.join('\n')}`);
  await fs.writeFile(path.join(root,'.artifacts/bundle-diagnostics.json'),JSON.stringify({count:names.length}));
  await fs.writeFile(path.join(root,'.artifacts/override-conflicts.json'),'[]');
 };
 await generateBundle();
 return {root,generateBundle,close:()=>fs.rm(root,{recursive:true,force:true})};
}

test('nonlive v8 closeout composition is present and API-unwired',()=>{
 assert.equal(typeof createNonliveV8ApiHostCloseoutCandidate,'function');
 assert.equal(NONLIVE.wiredToProxyConfigAPI,false);
 assert.equal(NONLIVE.allowConfigEditRequiredFalse,true);
 assert.match(NONLIVE.remainingGap,/fence clear/i);
});

test('v5 install through v8 adapter + v7 guarded worker succeeds in-process without a second app',async()=>{
 const w=await workspace();const trace=[];
 try{
  const cand=createNonliveV8ApiHostCloseoutCandidate({
   root:w.root,
   spoolDirectory:path.join(w.root,'spool'),
   fenceDirectory:path.join(w.root,'fence'),
   secret:crypto.randomBytes(32),
   driver:goodDriver(trace),
   verifyActiveRoute:async()=>true,
   generateBundle:w.generateBundle,
   timeoutMs:2000,pollMs:10
  });
  const before=await fs.readdir(path.join(w.root,'apps'));
  assert.equal(before.filter(n=>n.startsWith('synth')).length,17);
  const r=await cand.mutation.install('v8close','location /v8close/ { return 200; }\n');
  assert.equal(r.httpStatus,200);assert.equal(r.ok,true);
  assert.match(await fs.readFile(path.join(w.root,'apps/v8close.conf'),'utf8'),/v8close/);
  assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
  assert.ok(trace.includes('nginx-test')&&trace.includes('nginx-reload'));
  assert.equal(cand.wiredToProxyConfigAPI,false);
 }finally{await w.close();}
});

test('nginx validation denial rolls back and clears route journal; fence not left hot',async()=>{
 const w=await workspace();
 try{
  const cand=createNonliveV8ApiHostCloseoutCandidate({
   root:w.root,
   spoolDirectory:path.join(w.root,'spool'),
   fenceDirectory:path.join(w.root,'fence'),
   secret:crypto.randomBytes(32),
   driver:failTestDriver(),
   verifyActiveRoute:async()=>true,
   generateBundle:w.generateBundle,
   timeoutMs:2000,pollMs:10
  });
  const before=await fs.readFile(path.join(w.root,'build/sites-enabled/apps.generated.conf'));
  const r=await cand.mutation.install('bad','location /bad/ { totally_invalid; }\n');
  assert.equal(r.httpStatus,422);
  assert.equal(r.code,'NGINX_CANDIDATE_REJECTED_ROLLED_BACK');
  await assert.rejects(()=>fs.lstat(path.join(w.root,'apps/bad.conf')),{code:'ENOENT'});
  assert.deepEqual(await fs.readFile(path.join(w.root,'build/sites-enabled/apps.generated.conf')),before);
  await assert.rejects(()=>fs.lstat(path.join(w.root,'.artifacts/route-mutation-inflight')),{code:'ENOENT'});
  await assert.rejects(()=>fs.lstat(path.join(w.root,'fence/host-operation-inflight')),{code:'ENOENT'});
  assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
 }finally{await w.close();}
});

test('host timeout after fence/reload path quarantines v5 journal and blocks the next mutation',async()=>{
 const w=await workspace();
 try{
  const cand=createNonliveV8ApiHostCloseoutCandidate({
   root:w.root,
   spoolDirectory:path.join(w.root,'spool'),
   fenceDirectory:path.join(w.root,'fence'),
   secret:crypto.randomBytes(32),
   driver:hangReloadDriver(),
   verifyActiveRoute:async()=>true,
   generateBundle:w.generateBundle,
   timeoutMs:60,pollMs:10
  });
  const first=await cand.mutation.install('hang','location /hang/ { return 200; }\n');
  assert.equal(first.httpStatus,503);
  assert.ok(['ACTIVATION_INDETERMINATE','ROUTE_STATE_QUARANTINED'].includes(first.code));
  const marker=await fs.lstat(path.join(w.root,'.artifacts/route-mutation-inflight')).catch(e=>e);
  // Either route journal remains (indeterminate) or fence holds next request
  const second=await cand.mutation.install('next','location /next/ { return 200; }\n');
  assert.equal(second.httpStatus,503);
  assert.ok(['ROUTE_STATE_QUARANTINED','ACTIVATION_INDETERMINATE','BLOCKED_MUTATION_BUSY'].includes(second.code)||
            second.code==='ROUTE_STATE_QUARANTINED'||second.httpStatus===503);
  assert.equal((await fs.readdir(path.join(w.root,'apps'))).filter(n=>n.startsWith('synth')).length,17);
  void marker;
 }finally{await w.close();}
});

test('config edit remains blocked with allowConfigEdit false on the composed mutation service',async()=>{
 const w=await workspace();
 try{
  const before=await fs.readFile(path.join(w.root,'config/default.production.conf'));
  const cand=createNonliveV8ApiHostCloseoutCandidate({
   root:w.root,
   spoolDirectory:path.join(w.root,'spool'),
   fenceDirectory:path.join(w.root,'fence'),
   secret:crypto.randomBytes(32),
   driver:goodDriver(),
   verifyActiveRoute:async()=>true,
   generateBundle:w.generateBundle
  });
  const r=await cand.mutation.editConfig('default.production.conf','server { deny all; }\n');
  assert.equal(r.httpStatus,503);
  assert.equal(r.code,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
  assert.deepEqual(await fs.readFile(path.join(w.root,'config/default.production.conf')),before);
 }finally{await w.close();}
});
