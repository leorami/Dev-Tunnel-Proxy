'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProductionComposeCandidate,assessApiImageOnlyTransition}=require('../../utils/rc2-production-compose-candidate.cjs');
const old='node:18-alpine';
const next='docker.io/library/node@sha256:'+'d'.repeat(64);
const base=()=>({
 proxyImage:'registry.example.invalid/proxy@sha256:'+'a'.repeat(64),
 apiImage:'registry.example.invalid/api@sha256:'+'b'.repeat(64),
 apiUid:504,apiGid:20,
 paths:{
  sourceRoot:'/private/synthetic/product',ownerEnvFile:'/private/synthetic/private/owner.env',
  secretHostFile:'/private/synthetic/private/activation.secret',spoolHostDir:'/private/synthetic/private/spool',
  appsDir:'/private/synthetic/data/apps',overridesDir:'/private/synthetic/data/overrides',
  sitesDir:'/private/synthetic/data/sites',artifactsDir:'/private/synthetic/data/artifacts',
  nginxConf:'/private/synthetic/product/config/nginx.conf',defaultConf:'/private/synthetic/product/config/default.conf',
  nginxEntrypoint:'/private/synthetic/product/scripts/entrypoint.sh',certsDir:'/private/synthetic/data/certs',
  statusDir:'/private/synthetic/data/status',dashboardDir:'/private/synthetic/product/dashboard/public'
 }
});
function pair(){
 const before=JSON.parse(createProductionComposeCandidate(base()).json);
 before.services['proxy-config-api'].image=old;
 before.services['proxy-config-api'].environment.SYNTHETIC_PRIVATE='must-not-appear-in-result';
 const after=JSON.parse(JSON.stringify(before));
 after.services['proxy-config-api'].image=next;
 return {before,after};
}
function assess({before,after},candidateImage=next){
 return assessApiImageOnlyTransition({beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after),candidateImage});
}
test('exact existing hardened RC2 service configuration changes only the official immutable Node image',()=>{
 const p=pair(),result=assess(p);
 assert.equal(result.code,'RC2_API_IMAGE_ONLY_SOURCE_MATCH');
 assert.equal(result.imageOnly,true);
 assert.equal(result.productionChangeAuthorized,false);
 assert.equal(result.runtimeAttested,false);
 assert.equal(JSON.stringify(result).includes('must-not-appear'),false);
 assert.equal(JSON.stringify(result).includes('/private/'),false);
 assert.equal(p.before.services['proxy-config-api'].image,old);
});
test('canonical resolved Compose port objects are supported without broadening the listener',()=>{
 const p=pair();
 for(const c of [p.before,p.after]){
  c.services['proxy-config-api'].ports=[{host_ip:'127.0.0.1',target:3001,published:'3001',protocol:'tcp'},{host_ip:'127.0.0.1',target:3002,published:'3002',protocol:'tcp'}];
 }
 assert.equal(assess(p).imageOnly,true);
});
test('any additional effective configuration delta is denied, even an unrelated service or env value',()=>{
 const mutations=[
  c=>c.services.proxy.image=next,
  c=>c.services['proxy-config-api'].environment.SYNTHETIC_PRIVATE='changed',
  c=>c.services['proxy-config-api'].volumes[0].source='/private/other/product',
  c=>c.services['proxy-config-api'].volumes[0].read_only=false,
  c=>c.services['proxy-config-api'].command.push('extra'),
  c=>c.services['proxy-config-api'].user='0:0',
  c=>c.services['proxy-config-api'].ports.push('0.0.0.0:3003:3003'),
  c=>c.services['proxy-config-api'].networks.push('another'),
  c=>c.services['proxy-config-api'].restart='always',
  c=>c.services['proxy-config-api'].env_file=['/private/other/env'],
  c=>c.services.newSidecar={image:next},
  c=>c.name='another-project'
 ];
 for(const change of mutations){
  const p=pair();change(p.after);
  const result=assess(p);
  assert.equal(result.imageOnly,false);
  assert.equal(result.productionChangeAuthorized,false);
  assert.equal(JSON.stringify(result).includes('/private/'),false);
 }
});
test('an already unsafe baseline cannot be certified by an image-only comparison',()=>{
 for(const change of [
  api=>api.user='0:0',api=>api.read_only=false,api=>api.privileged=true,
  api=>api.cap_drop=[],api=>api.security_opt=[],api=>api.network_mode='host',
  api=>api.volumes.push({type:'bind',source:'/var/run/docker.sock',target:'/var/run/docker.sock'}),
  api=>api.ports=['0.0.0.0:3001:3001','127.0.0.1:3002:3002'],
  api=>api.volumes[0].read_only=false
 ]){
  const p=pair();for(const c of [p.before,p.after])change(c.services['proxy-config-api']);
  assert.equal(assess(p).imageOnly,false);
 }
});
test('mutable aliases, config IDs mistaken for registry manifests, missing/invalid inputs and no-op changes are denied',()=>{
 for(const image of ['node:24-alpine','sha256:'+'d'.repeat(64),'registry.example.invalid/node@sha256:'+'d'.repeat(64),old]){
  const p=pair();p.after.services['proxy-config-api'].image=image;
  assert.equal(assess(p,image).imageOnly,false);
 }
 assert.equal(assessApiImageOnlyTransition({beforeJson:'{',afterJson:'{}',candidateImage:next}).imageOnly,false);
 assert.equal(assessApiImageOnlyTransition({beforeJson:'{}',afterJson:'{}',candidateImage:next}).imageOnly,false);
});
