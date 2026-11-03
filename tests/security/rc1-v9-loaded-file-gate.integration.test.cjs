'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createReadOnlyHostViewFromLoadedFiles}=require('../../utils/rc1-loaded-nginx-file-identity.cjs');
const {createClosureGatedHostDriver}=require('../../utils/rc1-closure-gated-host-driver.cjs');
async function fixture(){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'dpv9-loaded-gate-'));
 const a=path.join(base,'source'),r=path.join(base,'runtime');
 for(const dir of [a,r,path.join(a,'config'),path.join(a,'build/sites-enabled'),
  path.join(r,'etc/nginx/conf.d/sites-enabled')])await fs.mkdir(dir,{recursive:true,mode:0o700});
 const set={
  ['config/nginx.production.conf']:'events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n',
  ['config/default.production.conf']:'server { listen 80; include /etc/nginx/conf.d/sites-enabled/*.conf; }\n',
  ['build/sites-enabled/apps.generated.conf']:'location /safe/ { return 200; }\n'
 };
 const mapping={
  'config/nginx.production.conf':'etc/nginx/nginx.conf',
  'config/default.production.conf':'etc/nginx/conf.d/default.conf',
  'build/sites-enabled/apps.generated.conf':'etc/nginx/conf.d/sites-enabled/apps.generated.conf'
 };
 for(const [k,s]of Object.entries(set)){await fs.writeFile(path.join(a,k),s);await fs.writeFile(path.join(r,mapping[k]),s);}
 const calls=[];
 const driver={async attest(){calls.push('attest');return true;},async execute(action){calls.push(action);return 0;}};
 const hostView=createReadOnlyHostViewFromLoadedFiles({approvedRoot:a,runtimeRoot:r});
 const gate=createClosureGatedHostDriver({approvedRoot:a,driver,hostView,verifyActiveRoute:async()=>true});
 return {base,a,r,calls,gate,cleanup:()=>fs.rm(base,{recursive:true,force:true})};
}
test('RED-first: test-owned loaded-file hostView adapter exists',()=>assert.equal(typeof createReadOnlyHostViewFromLoadedFiles,'function'));
test('read-only loaded config matches permit fixed nginx validation/reload only with nonauthority flags',async()=>{
 const f=await fixture();try{
  assert.equal(await f.gate.driver.attest(),true);
  assert.equal(await f.gate.driver.execute('nginx-test'),0);
  assert.equal(await f.gate.driver.execute('nginx-reload'),0);
  assert.equal(f.gate.productionChangeAuthorized,false);
  assert.equal(f.gate.actualHostAttested,false);
  assert.deepEqual(f.calls,['attest','nginx-test','nginx-reload']);
 }finally{await f.cleanup();}
});
test('extra glob-loaded nginx file is rejected before driver invocation',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.r,'etc/nginx/conf.d/rogue.conf'),'server{}\n');
  assert.equal(await f.gate.driver.execute('nginx-test'),1);
  assert.deepEqual(f.calls,[]);
 }finally{await f.cleanup();}
});
test('tampered loaded nginx default bytes denied even if its basename is unchanged',async()=>{
 const f=await fixture();try{
  await fs.appendFile(path.join(f.r,'etc/nginx/conf.d/default.conf'),'# mismatch\n');
  assert.equal(await f.gate.driver.execute('nginx-reload'),1);
  assert.deepEqual(f.calls,[]);
 }finally{await f.cleanup();}
});
test('unexpected nested include directive in candidate file denied',async()=>{
 const f=await fixture();try{
  const a=path.join(f.a,'config/default.production.conf');
  await fs.appendFile(a,'include /tmp/unknown.conf;\n');
  assert.equal(await f.gate.driver.attest(),false);
  assert.deepEqual(f.calls,[]);
 }finally{await f.cleanup();}
});
test('extra site file inserted after validation denies nginx reload',async()=>{
 const f=await fixture();try{
  assert.equal(await f.gate.driver.execute('nginx-test'),0);
  await fs.writeFile(path.join(f.r,'etc/nginx/conf.d/sites-enabled/extra.conf'),'location /x/ {}\n');
  assert.equal(await f.gate.driver.execute('nginx-reload'),1);
  assert.deepEqual(f.calls,['nginx-test']);
 }finally{await f.cleanup();}
});
test('aborted signal blocks expensive host-view work and fixed action',async()=>{
 const f=await fixture();try{
  const a=new AbortController();a.abort();
  assert.equal(await f.gate.driver.execute('nginx-reload',a.signal),1);
  assert.deepEqual(f.calls,[]);
 }finally{await f.cleanup();}
});
