'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessMountContinuity,REQUIRED}=require('../../utils/rc1-mount-continuity.cjs');
const O='/Users/owner/project',C='/private/tmp/rc1-candidate';
function bind(source,target,readOnly){return {type:'bind',source,target,read_only:readOnly};}
function fixture(){
 return {candidateSha:'d89c962fb31a962a518f331bae458e63708e7e86',ownerRoot:O,candidateRoot:C,
 services:{
 proxy:[bind(O+'/build/sites-enabled','/etc/nginx/conf.d/sites-enabled',true),bind(O+'/.artifacts','/usr/share/nginx/html/.artifacts',false),bind(O+'/.certs','/etc/nginx/certs',true),bind(C+'/config/default.production.conf','/etc/nginx/conf.d/default.conf',true),bind(C+'/config/nginx.production.conf','/etc/nginx/nginx.conf',true)],
 'proxy-config-api':[bind(C,'/app',true),bind(O+'/.env','/app/.env',false),bind(O+'/apps','/app/apps',false),bind(O+'/overrides','/app/overrides',false),bind(O+'/.artifacts','/app/.artifacts',false),bind(O+'/build/sites-enabled','/app/build/sites-enabled',false),bind(O+'/config','/app/config',false)]
 }};
}
test('complete plan passes as PLAN ONLY, never a deployment proof',()=>{const r=assessMountContinuity(fixture());assert.equal(r.status,'MOUNT_PLAN_VALIDATED_ONLY');assert.equal(r.deployed,false);assert.deepEqual(r.blockers,[]);});
test('every required private target fails if absent',()=>{for(const {service,target} of REQUIRED){const f=fixture();f.services[service]=f.services[service].filter(x=>x.target!==target);const r=assessMountContinuity(f);assert.equal(r.status,'BLOCKED',service+' '+target);assert.ok(r.blockers.includes('MISSING_REQUIRED_BIND:'+service+':'+target));}});
test('any state rebound to fresh candidate or other user silently fails',()=>{for(const {service,target} of REQUIRED){const f=fixture();f.services[service].find(x=>x.target===target).source=C+'/empty';const r=assessMountContinuity(f);assert.equal(r.status,'BLOCKED',target);}});
test('protected source must be read-only; private writable requirements are enforced',()=>{const a=fixture();a.services['proxy-config-api'].find(x=>x.target==='/app').read_only=false;assert.equal(assessMountContinuity(a).status,'BLOCKED');const b=fixture();b.services['proxy-config-api'].find(x=>x.target==='/app/.artifacts').read_only=true;assert.equal(assessMountContinuity(b).status,'BLOCKED');});
test('duplicate target mounts or unknown nested /app state shadowing fail closed',()=>{const a=fixture();a.services.proxy.push({...a.services.proxy[0]});assert.equal(assessMountContinuity(a).status,'BLOCKED');const b=fixture();b.services['proxy-config-api'].push(bind(C+'/bad','/app/.artifacts/admin-session.json',false));assert.equal(assessMountContinuity(b).status,'BLOCKED');});
test('path boundary, nonabsolute roots and invalid segments fail closed',()=>{for(const roots of [[O,O],[O,O+'/candidate'],['relative',C],[O,C+'/..'],[O+'/',C]]){const f=fixture();f.ownerRoot=roots[0];f.candidateRoot=roots[1];assert.equal(assessMountContinuity(f).status,'BLOCKED',JSON.stringify(roots));}});
test('untrusted extra targets cannot override protected private targets',()=>{const f=fixture();f.services.proxy.push(bind(C,'/usr/share/nginx/html/.artifacts/report.json',false));assert.equal(assessMountContinuity(f).status,'BLOCKED');});
test('bad SHA, malformed data, missing services, getters and nonboolean flags block',()=>{for(const v of [null,{},[],false,{services:{}},Object.create(fixture())])assert.equal(assessMountContinuity(v).status,'BLOCKED');const a=fixture();a.candidateSha='d89c962';assert.equal(assessMountContinuity(a).status,'BLOCKED');const b=fixture();Object.defineProperty(b.services,'proxy',{get(){throw Error('must not execute')}});assert.equal(assessMountContinuity(b).status,'BLOCKED');const c=fixture();c.services.proxy[0].read_only='true';assert.equal(assessMountContinuity(c).status,'BLOCKED');});
test('results never contain private source paths or secrets, even on failure',()=>{const f=fixture();f.services.proxy[0].source='/SENSITIVE/SECRET/home';const r=assessMountContinuity(f);assert.equal(r.status,'BLOCKED');assert.doesNotMatch(JSON.stringify(r),/SENSITIVE|SECRET|Users\/owner/);});
