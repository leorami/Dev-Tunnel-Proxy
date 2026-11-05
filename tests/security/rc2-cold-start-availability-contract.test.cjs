'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProductionComposeCandidate}=require('../../utils/rc2-production-compose-candidate.cjs');
const {createIsolatedNonrootRestoreCandidate}=require('../../utils/rc2-isolated-nonroot-restore-candidate.cjs');
const stage='/private/rc2-disposable';
const hex='a'.repeat(64);
function pins(){
 return {
  proxyImage:'registry.example.invalid/proxy@sha256:'+hex,
  apiImage:'registry.example.invalid/api@sha256:'+'b'.repeat(64),
  apiUid:504,apiGid:20,
  paths:{
   sourceRoot:stage+'/source',
   ownerEnvFile:stage+'/private/owner.env',
   secretHostFile:stage+'/private/activation.secret',
   spoolHostDir:stage+'/private/host-share',
   appsDir:stage+'/data/apps',
   overridesDir:stage+'/data/overrides',
   sitesDir:stage+'/data/sites-enabled',
   artifactsDir:stage+'/data/artifacts',
   nginxConf:stage+'/source/config/nginx.production.conf',
   defaultConf:stage+'/source/config/default.production.conf',
   nginxEntrypoint:stage+'/source/scripts/nginx-entrypoint.sh',
   certsDir:stage+'/data/certs',
   statusDir:stage+'/data/status',
   dashboardDir:stage+'/data/dashboard'
  }
 };
}
const create=()=>createProductionComposeCandidate(pins());
test('RED: proxy starts after API so nginx upstream DNS exists before nginx config loads',()=>{
 const services=create().compose.services;
 assert.deepEqual(services.proxy.depends_on,['proxy-config-api']);
 assert.equal(Object.hasOwn(services['proxy-config-api'],'depends_on'),false);
});
test('RED: both existing services restart after Docker Desktop restart without adding a third service',()=>{
 const services=create().compose.services;
 assert.deepEqual(Object.keys(services),['proxy','proxy-config-api']);
 assert.equal(services.proxy.restart,'unless-stopped');
 assert.equal(services['proxy-config-api'].restart,'unless-stopped');
 assert.equal(Object.keys(services).some(x=>/ngrok|host-worker/.test(x)),false);
});
test('RED: correct dependency is acyclic and excludes unknown services',()=>{
 const services=create().compose.services;
 const active=new Set();
 const done=new Set();
 function visit(n){
  assert.ok(Object.hasOwn(services,n));
  assert.equal(active.has(n),false,'cycle');
  if(done.has(n))return;
  active.add(n);
  for(const dep of services[n].depends_on||[])visit(dep);
  active.delete(n);done.add(n);
 }
 for(const n of Object.keys(services))visit(n);
 assert.equal(done.size,2);
});
test('RED: existing immutable images, owner mounts and security invariants survive',()=>{
 const candidate=create(),s=candidate.compose.services;
 assert.match(s.proxy.image,/^registry\.example\.invalid\/proxy@sha256:[a-f0-9]{64}$/);
 assert.equal(s['proxy-config-api'].read_only,true);
 assert.equal(s['proxy-config-api'].user,'504:20');
 assert.equal(s['proxy-config-api'].privileged,false);
 assert.deepEqual(s['proxy-config-api'].cap_drop,['ALL']);
 assert.deepEqual(s.proxy.ports,['127.0.0.1:8080:80','127.0.0.1:443:443']);
 assert.deepEqual(s['proxy-config-api'].ports,['127.0.0.1:3001:3001','127.0.0.1:3002:3002']);
 assert.equal(candidate.productionChangeAuthorized,false);
 assert.equal(candidate.deployed,false);
 for(const item of Object.values(s))
  assert.ok(item.volumes.every(m=>m.type==='bind'&&!m.source.includes('docker.sock')));
});
test('RED: isolated source-only recovery accepts updated dependency graph and retains restart policy',()=>{
 const parent=create();
 const candidate=createIsolatedNonrootRestoreCandidate({
  productionCandidate:parent,privateStageRoot:stage,nonce:'testabc456'
 });
 const s=candidate.compose.services;
 assert.deepEqual(s.proxy.depends_on,['proxy-config-api']);
 assert.equal(Object.hasOwn(s['proxy-config-api'],'depends_on'),false);
 assert.equal(s.proxy.restart,'unless-stopped');
 assert.equal(s['proxy-config-api'].restart,'unless-stopped');
 assert.deepEqual(s.proxy.ports,[]);
 assert.deepEqual(s['proxy-config-api'].ports,[]);
 assert.equal(candidate.compose.networks['devproxy-restore-testabc456'].internal,true);
 assert.equal(candidate.deployed,false);
 assert.equal(candidate.restoreVerified,false);
});
test('RED: isolated transformer rejects reversed dependency (restores original outage)',()=>{
 const p=create();p.compose.services['proxy-config-api'].depends_on=['proxy'];
 assert.throws(()=>createIsolatedNonrootRestoreCandidate({
  productionCandidate:p,privateStageRoot:stage,nonce:'testabc456'
 }),/INVALID_RC2_ISOLATED_RESTORE_CANDIDATE/);
});
test('RED: isolated transformer rejects accidental restart-never regression',()=>{
 const p=create();p.compose.services.proxy.restart='no';
 assert.throws(()=>createIsolatedNonrootRestoreCandidate({
  productionCandidate:p,privateStageRoot:stage,nonce:'testabc456'
 }),/INVALID_RC2_ISOLATED_RESTORE_CANDIDATE/);
});
test('RED: no production or actual runtime changes from source-only generation',()=>{
 const p=pins();const original=JSON.stringify(p);
 const c=createProductionComposeCandidate(p);
 assert.equal(JSON.stringify(p),original);
 assert.equal(c.productionChangeAuthorized,false);
 assert.equal(c.deployed,false);assert.equal(c.runtimeAttested,false);
 assert.equal(Object.hasOwn(c.compose.services.proxy,'build'),false);
 assert.equal(Object.hasOwn(c.compose.services['proxy-config-api'],'build'),false);
});
