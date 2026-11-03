'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createClosureGatedHostDriver}=require('../../utils/rc1-closure-gated-host-driver.cjs');
const HOST={confD:['default.conf'],siteEnabled:['apps.generated.conf']};
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dpv9-host-'));await fs.chmod(root,0o700);
 for(const d of ['build','build/sites-enabled','config'])await fs.mkdir(path.join(root,d),{mode:0o700});
 const files={main:path.join(root,'config/nginx.production.conf'),default:path.join(root,'config/default.production.conf'),bundle:path.join(root,'build/sites-enabled/apps.generated.conf')};
 await fs.writeFile(files.main,'events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n');
 await fs.writeFile(files.default,'server { include /etc/nginx/conf.d/sites-enabled/*.conf; }\n');
 await fs.writeFile(files.bundle,'location /route { return 200; }\n');
 return{root,files,close:()=>fs.rm(root,{recursive:true,force:true})};
}
function create(f,{hostView=async()=>HOST,verify=async()=>true}={}){
 const trace=[];
 const original={attest:async()=>{trace.push('attest');return true;},execute:async(action)=>{trace.push(action);return 0;}};
 const gate=createClosureGatedHostDriver({approvedRoot:f.root,driver:original,
  verifyActiveRoute:verify,hostView});
 return {...gate,trace};
}
test('RED: pretest and pre-reload closure checks permit only fixed approved config',async()=>{
 const f=await fixture();try{
  const {driver,trace,verifyActiveRoute}=create(f);
  assert.equal(await driver.attest(),true);assert.equal(await driver.execute('nginx-test'),0);
  assert.equal(await driver.execute('nginx-reload'),0);assert.equal(await verifyActiveRoute(),true);
  assert.deepEqual(trace,['attest','nginx-test','nginx-reload']);
 }finally{await f.close();}
});
test('rogue sites-enabled .conf prevents even the first host nginx test',async()=>{
 const f=await fixture();try{
  const g=create(f);await fs.writeFile(path.join(f.root,'build/sites-enabled/shadow.conf'),'return 200;');
  assert.equal(await g.driver.attest(),false);assert.equal(await g.driver.execute('nginx-test'),1);
  assert.deepEqual(g.trace,[]);
 }finally{await f.close();}
});
test('unbound nested include prevents nginx reload even after previous test',async()=>{
 const f=await fixture();try{
  const g=create(f);assert.equal(await g.driver.execute('nginx-test'),0);
  await fs.appendFile(f.files.bundle,'include /tmp/unbound.conf;\n');
  assert.equal(await g.driver.execute('nginx-reload'),1);
  assert.deepEqual(g.trace,['nginx-test']);
 }finally{await f.close();}
});
test('new conf inserted after validation blocks reload before privilege use',async()=>{
 const f=await fixture();try{
  const g=create(f);assert.equal(await g.driver.execute('nginx-test'),0);
  await fs.writeFile(path.join(f.root,'build/sites-enabled/injected.conf'),'fake conf');
  assert.equal(await g.driver.execute('nginx-reload'),1);
  assert.deepEqual(g.trace,['nginx-test']);
 }finally{await f.close();}
});
test('failed active-route verification is not overridden by clean static include graph',async()=>{
 const f=await fixture();try{
  const g=create(f,{verify:async()=>false});assert.equal(await g.verifyActiveRoute(),false);
 }finally{await f.close();}
});
test('candidate changed by active-route callback cannot claim verified completion',async()=>{
 const f=await fixture();try{
  const g=create(f,{verify:async()=>{await fs.appendFile(f.files.default,'include /evil/new.conf;\n');return true;}});
  assert.equal(await g.verifyActiveRoute(),false);
 }finally{await f.close();}
});
test('reported unknown host conf is rejected without any fixed Docker commands',async()=>{
 const f=await fixture();try{
  const g=create(f,{hostView:async()=>({confD:['default.conf','extra.conf'],siteEnabled:['apps.generated.conf']})});
  assert.equal(await g.driver.attest(),false);assert.deepEqual(g.trace,[]);
 }finally{await f.close();}
});
test('untrusted absent host view is never silently accepted',async()=>{
 const f=await fixture();try{
  assert.throws(()=>createClosureGatedHostDriver({approvedRoot:f.root,driver:{attest:async()=>true,execute:async()=>0},verifyActiveRoute:async()=>true}),/INVALID_CLOSURE_GATED_DRIVER/);
 }finally{await f.close();}
});
test('abort after asynchronous host check forbids late nginx command even if callback eventually returns green',async()=>{
 const f=await fixture();try{
  let release,started;
  const waiting=new Promise(resolve=>{started=resolve;});
  const g=create(f,{hostView:async()=>{started();return await new Promise(resolve=>{release=()=>resolve(HOST);});}});
  const controller=new AbortController();
  const task=g.driver.execute('nginx-reload',controller.signal);
  await waiting;controller.abort();release();
  assert.equal(await task,1);assert.deepEqual(g.trace,[]);
 }finally{await f.close();}
});
test('no untrusted command can ever be forwarded through wrapper',async()=>{
 const f=await fixture();try{
  const g=create(f);assert.equal(await g.driver.execute('docker-prune'),1);assert.deepEqual(g.trace,[]);
 }finally{await f.close();}
});
