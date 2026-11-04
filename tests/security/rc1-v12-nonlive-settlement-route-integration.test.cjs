'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createTwoPhaseHostSettlement}=require('../../utils/rc1-two-phase-host-settlement.cjs');
const {createNonliveSettlementActivation,NONLIVE}=require('../../utils/rc1-v12-nonlive-settlement-activation.cjs');
const {createProductionRouteMutationService}=require('../../utils/production-route-mutation.cjs');
const {createExclusiveMutationLock}=require('../../utils/exclusive-route-mutation-lock.cjs');
async function fx(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv12-route-'));await fs.chmod(root,0o700);
 for(const d of ['apps','overrides','config','build','build/sites-enabled','.artifacts',
  '.artifacts/route-mutation-locks','lease','lease/replay'])await fs.mkdir(path.join(root,d),{mode:0o700});
 for(const [p,body] of [['config/default.production.conf','server{listen 80;}\n'],
  ['config/nginx.production.conf','events{}\nhttp{}\n'],
  ['build/sites-enabled/apps.generated.conf','# empty\n']])await fs.writeFile(path.join(root,p),body);
 for(let i=1;i<=17;i++)await fs.writeFile(path.join(root,'apps',`synth${i}.conf`),`location /synth${i}/ { return 200; }\n`);
 const generateBundle=async()=>{
  const list=(await fs.readdir(path.join(root,'apps'))).filter(x=>x.endsWith('.conf')).sort();
  await fs.writeFile(path.join(root,'build/sites-enabled/apps.generated.conf'),
   '# apps\n'+(await Promise.all(list.map(x=>fs.readFile(path.join(root,'apps',x),'utf8')))).join('\n'));
  await fs.writeFile(path.join(root,'.artifacts/bundle-diagnostics.json'),JSON.stringify({count:list.length}));
  await fs.writeFile(path.join(root,'.artifacts/override-conflicts.json'),'[]');
 };
 await generateBundle();const secret=crypto.randomBytes(32);
 function compose({prepared=true,beforeApiAck,afterApiAck}={}){
  const host=createTwoPhaseHostSettlement({directory:path.join(root,'lease'),approvedRoot:root,
   secret,verifyHostPrepared:async()=>prepared,verifyActiveRoute:async()=>true});
  const activation=createNonliveSettlementActivation({approvedRoot:root,secret,host,
   simulateFixedHostAction:async()=>true,beforeApiAck,afterApiAck});
  const lock=createExclusiveMutationLock({directory:path.join(root,'.artifacts/route-mutation-locks')});
  const mutation=createProductionRouteMutationService({root,activation,generateBundle,lock,allowConfigEdit:false});
  return {host,activation,mutation};
 }
 return {root,generateBundle,compose,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('test-owned v5 install -> v12 durable host hold -> signed API ACK -> signed FINAL succeeds without Docker',async()=>{
 const f=await fx();try{
  const app=f.compose();const result=await app.mutation.install('v12ok','location /v12ok/ { return 200; }\n');
  assert.equal(result.httpStatus,200);assert.equal(result.ok,true);
  assert.match(await fs.readFile(path.join(f.root,'apps/v12ok.conf'),'utf8'),/v12ok/);
  assert.equal((await fs.readdir(path.join(f.root,'apps'))).filter(x=>x.startsWith('synth')).length,17);
  assert.deepEqual(await fs.readdir(path.join(f.root,'lease')),['replay']);
  assert.equal(app.activation.runtimeAttestation,'NOT_RUNTIME_ATTESTED');
  assert.equal(app.activation.ownerAuthorizationEstablished,false);
 }finally{await f.close();}
});
test('host fails before prepare -> activation and route remain quarantined; no false 200',async()=>{
 const f=await fx();try{
  const app=f.compose({prepared:false});
  const a=await app.mutation.install('bad','location /bad/ { return 200; }\n');
  assert.equal(a.httpStatus,503);assert.equal(a.ok,false);
  assert.equal((await fs.readdir(path.join(f.root,'lease'))).includes('host-settlement-inflight.json'),true);
  assert.equal((await app.mutation.install('later','location /later/ { return 200; }\n')).httpStatus,503);
 }finally{await f.close();}
});
test('mutation BEFORE API ACK cannot get signed settlement and leaves host lease quarantined',async()=>{
 const f=await fx();try{
  const app=f.compose({beforeApiAck:async()=>fs.appendFile(path.join(f.root,'config/nginx.production.conf'),'# altered\n')});
  const r=await app.mutation.install('before','location /before/ { return 200; }\n');
  assert.equal(r.httpStatus,503);assert.equal((await fs.readdir(path.join(f.root,'lease'))).includes('host-settlement-inflight.json'),true);
 }finally{await f.close();}
});
test('mutation AFTER API ACK still blocked by HOST-side second check',async()=>{
 const f=await fx();try{
  const app=f.compose({afterApiAck:async()=>fs.appendFile(path.join(f.root,'config/nginx.production.conf'),'# altered\n')});
  const r=await app.mutation.install('after','location /after/ { return 200; }\n');
  assert.equal(r.httpStatus,503);assert.equal((await fs.readdir(path.join(f.root,'lease'))).includes('host-settlement-inflight.json'),true);
 }finally{await f.close();}
});
test('config edits remain blocked and no extra listener/worker is started',async()=>{
 const f=await fx();try{
  const app=f.compose();const result=await app.mutation.editConfig('default.production.conf','deny all;');
  assert.equal(result.httpStatus,503);assert.equal(result.code,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
  assert.equal(NONLIVE.deployed,false);assert.equal(NONLIVE.wiredToProxyConfigAPI,false);
 }finally{await f.close();}
});
