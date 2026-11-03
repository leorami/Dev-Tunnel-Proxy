'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {inspectLoadedNginxFileIdentity}=require('../../utils/rc1-loaded-nginx-file-identity.cjs');
async function fixture(){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'dpv9-loaded-'));
 const approved=path.join(base,'approved'),live=path.join(base,'runtime');
 for(const d of [approved,live,'build','build/sites-enabled','config','etc','etc/nginx','etc/nginx/conf.d','etc/nginx/conf.d/sites-enabled']){
  const root=['approved','runtime'].includes(d)?base:d.startsWith('etc')?live:approved;
  await fs.mkdir(path.join(root,d),{recursive:true,mode:0o700});
 }
 const sources={
  'config/nginx.production.conf':"events {}\nhttp { include /etc/nginx/mime.types; include /etc/nginx/conf.d/*.conf; }\n",
  'config/default.production.conf':"server { listen 80; include /etc/nginx/conf.d/sites-enabled/*.conf; }\n",
  'build/sites-enabled/apps.generated.conf':"location /route/ { return 200; }\n"
 };
 const mapping={
  'config/nginx.production.conf':'etc/nginx/nginx.conf',
  'config/default.production.conf':'etc/nginx/conf.d/default.conf',
  'build/sites-enabled/apps.generated.conf':'etc/nginx/conf.d/sites-enabled/apps.generated.conf'
 };
 for(const [rel,data] of Object.entries(sources)){
  await fs.writeFile(path.join(approved,rel),data,{mode:0o600});
  await fs.writeFile(path.join(live,mapping[rel]),data,{mode:0o600});
 }
 return {base,approved,live,sources,mapping,cleanup:()=>fs.rm(base,{recursive:true,force:true})};
}
const check=f=>inspectLoadedNginxFileIdentity({approvedRoot:f.approved,runtimeRoot:f.live});
test('RED-first: read-only live/candidate loaded-file identity module exists',()=>assert.equal(typeof inspectLoadedNginxFileIdentity,'function'));
test('exact three loaded files reported as nonauthorizing, not complete nginx attestation',async()=>{
 const f=await fixture();try{
  const r=await check(f);
  assert.equal(r.code,'FIXED_NGINX_FILES_MATCH_REPORTED');
  assert.equal(r.verifiedFileCount,3);
  assert.equal(r.productionChangeAuthorized,false);
  assert.equal(r.actualHostAttested,false);
  assert.equal(r.effectiveNginxConfigComplete,false);
  assert.equal(r.deployed,false);
  assert.equal(Object.hasOwn(r,'loadedContents'),false);
 }finally{await f.cleanup();}
});
for(const [candidate,loaded] of Object.entries({
  'config/nginx.production.conf':'etc/nginx/nginx.conf',
  'config/default.production.conf':'etc/nginx/conf.d/default.conf',
  'build/sites-enabled/apps.generated.conf':'etc/nginx/conf.d/sites-enabled/apps.generated.conf'
}))test('modified actually-loaded file blocked: '+loaded,async()=>{
 const f=await fixture();try{
  await fs.appendFile(path.join(f.live,loaded),'# altered on disk\n');
  assert.equal((await check(f)).code,'LOADED_CONFIG_BYTES_MISMATCH');
 }finally{await f.cleanup();}
});
test('unexpected conf.d glob-matched file rejected even when fixed files match',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.live,'etc/nginx/conf.d/hidden.conf'),'server {}\n');
  assert.equal((await check(f)).code,'UNEXPECTED_LOADED_CONFIG_NAME');
 }finally{await f.cleanup();}
});
test('unexpected sites-enabled conf rejected even when fixed files match',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.live,'etc/nginx/conf.d/sites-enabled/extra.conf'),'location /other/ {}\n');
  assert.equal((await check(f)).code,'UNEXPECTED_LOADED_CONFIG_NAME');
 }finally{await f.cleanup();}
});
test('symlinked runtime config leaf rejected, not followed',async()=>{
 const f=await fixture();try{
  const p=path.join(f.live,'etc/nginx/conf.d/default.conf');
  await fs.rename(p,p+'.old');await fs.symlink(p+'.old',p);
  assert.notEqual((await check(f)).code,'FIXED_NGINX_FILES_MATCH_REPORTED');
 }finally{await f.cleanup();}
});
test('symlinked runtime parent rejected',async()=>{
 const f=await fixture();try{
  const p=path.join(f.live,'etc/nginx/conf.d/sites-enabled');
  await fs.rename(p,p+'.old');await fs.symlink(p+'.old',p);
  assert.notEqual((await check(f)).code,'FIXED_NGINX_FILES_MATCH_REPORTED');
 }finally{await f.cleanup();}
});
test('hardlinked loaded config rejected',async()=>{
 const f=await fixture();try{
  const p=path.join(f.live,'etc/nginx/nginx.conf');await fs.link(p,p+'.other');
  assert.notEqual((await check(f)).code,'FIXED_NGINX_FILES_MATCH_REPORTED');
 }finally{await f.cleanup();}
});
test('modified approved source file cannot be accepted as loaded baseline',async()=>{
 const f=await fixture();try{
  await fs.appendFile(path.join(f.approved,'config/default.production.conf'),'# new source\n');
  assert.notEqual((await check(f)).code,'FIXED_NGINX_FILES_MATCH_REPORTED');
 }finally{await f.cleanup();}
});
test('unknown root and missing runtime root fail closed',async()=>{
 const f=await fixture();try{
  assert.equal((await inspectLoadedNginxFileIdentity({approvedRoot:f.approved,runtimeRoot:'/'})).code,'INVALID_LOADED_IDENTITY_ROOT');
  assert.notEqual((await inspectLoadedNginxFileIdentity({approvedRoot:f.approved,runtimeRoot:path.join(f.base,'missing')})).code,'FIXED_NGINX_FILES_MATCH_REPORTED');
 }finally{await f.cleanup();}
});
test('symlink actual runtime root fails closed',async()=>{
 const f=await fixture();try{
  await fs.symlink(f.live,path.join(f.base,'link'));
  assert.notEqual((await inspectLoadedNginxFileIdentity({approvedRoot:f.approved,runtimeRoot:path.join(f.base,'link')})).code,'FIXED_NGINX_FILES_MATCH_REPORTED');
 }finally{await f.cleanup();}
});
test('the read-only validator does not alter any passed file',async()=>{
 const f=await fixture();try{
  const p=path.join(f.live,'etc/nginx/conf.d/default.conf');const before=await fs.readFile(p);
  await check(f);assert.deepEqual(await fs.readFile(p),before);
 }finally{await f.cleanup();}
});
test('runtime snapshot with unexpected directories is blocked, never grants live GO',async()=>{
 const f=await fixture();try{
  await fs.mkdir(path.join(f.live,'etc/nginx/conf.d/unknown'));
  const result=await check(f);
  assert.equal(result.productionChangeAuthorized,false);
  assert.equal(result.actualHostAttested,false);
  assert.equal(result.effectiveNginxConfigComplete,false);
 }finally{await f.cleanup();}
});
