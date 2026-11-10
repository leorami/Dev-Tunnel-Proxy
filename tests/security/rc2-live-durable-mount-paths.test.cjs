'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessLiveDurableMountPaths:assess}=require('../../utils/rc2-live-durable-mount-paths.cjs');
const BASE='/Users/testowner/Library/Application Support/DevProxy';
function fixture(){
 const root=BASE+'/rc2-live';
 return {
  scope:'LIVE_RC2_RECOVERY',
  paths:{
   stageRoot:root,
   backupRoot:BASE+'/backups/rc2-original',
   composeWorkingDir:root+'/compose',
   proxyNginxConf:BASE+'/reviewed/nginx.production.conf',
   proxyDefaultConf:BASE+'/reviewed/default.production.conf',
   proxyEntrypoint:BASE+'/reviewed/nginx-entrypoint.sh',
   activationSecret:root+'/private/activation.secret',
   hostShare:root+'/private/host-share',
   workerPin:root+'/private/worker.pin'
  }
 };
}
test('RED: durable reviewed paths return a strict source-review-only, never live approval',()=>{
 assert.deepEqual(assess(fixture()),{
  code:'DURABLE_MOUNTS_SOURCE_REVIEW_ONLY',
  staticPathsAcceptable:true,
  nativeOwnershipAndExistenceVerified:false,
  productionChangeAuthorized:false,
  restorationPerformed:false
 });
});
test('RED: missing cutover stages or overlays under temporary roots must never be accepted',()=>{
 for(const root of ['/tmp','/private/tmp','/var/tmp','/private/var/tmp',
                     '/var/folders','/private/var/folders','/dev/shm','/run/user']){
  for(const key of ['stageRoot','proxyNginxConf','proxyDefaultConf','proxyEntrypoint',
                    'activationSecret','backupRoot']){
   const f=fixture();f.paths[key]=root+'/rc2-live';
   assert.equal(assess(f).code,'EPHEMERAL_LIVE_BIND_SOURCE',root+' '+key);
  }
 }
});
test('RED: case-insensitive temp directory variants are also rejected',()=>{
 for(const p of ['/PRIVATE/TMP/live','/TMP/live','/Var/Folders/abc']){
  const f=fixture();f.paths.proxyNginxConf=p;
  assert.equal(assess(f).code,'EPHEMERAL_LIVE_BIND_SOURCE');
 }
});
test('RED: malformed, relative, traversal and newline-bearing paths refuse review',()=>{
 for(const p of ['private/live','/','/Users/x/../private/live',
  '/Users/x/live/','/Users/x//live','/Users/x/live\nsecret',
  '/Users/x/live\u0000secret']){
  const f=fixture();f.paths.proxyNginxConf=p;
  assert.equal(assess(f).staticPathsAcceptable,false,p);
 }
});
test('RED: private secret, spool, pin and compose working directory must descend from selected durable stage',()=>{
 for(const k of ['composeWorkingDir','activationSecret','hostShare','workerPin']){
  const f=fixture();f.paths[k]=BASE+'/different-stage/escapes';
  assert.equal(assess(f).staticPathsAcceptable,false,k);
 }
});
test('RED: backup must not be inside the cutover stage being recovered',()=>{
 const f=fixture();f.paths.backupRoot=f.paths.stageRoot+'/backup';
 assert.equal(assess(f).staticPathsAcceptable,false);
});
test('RED: duplicate private mount sources and conf/entrypoint collisions are blocked',()=>{
 for(const [a,b] of [['activationSecret','hostShare'],['workerPin','activationSecret'],
                     ['proxyNginxConf','proxyDefaultConf'],['proxyEntrypoint','proxyNginxConf']]){
  const f=fixture();f.paths[a]=f.paths[b];
  assert.equal(assess(f).staticPathsAcceptable,false,a);
 }
});
test('RED: never trust injected fields, getters or custom prototype as operator evidence',()=>{
 const a=fixture();a.ownerSecret='SHOULD_NOT_LEAK';
 assert.equal(assess(a).staticPathsAcceptable,false);
 const b=fixture();Object.defineProperty(b.paths,'activationSecret',{enumerable:true,get(){throw Error('SECRET');}});
 assert.equal(assess(b).staticPathsAcceptable,false);
 const c=fixture();Object.setPrototypeOf(c.paths,null);
 assert.equal(assess(c).staticPathsAcceptable,false);
});
test('RED: invalid or missing manifest values deny with fixed nonrevealing response',()=>{
 for(const x of [null,undefined,{},[],false,2,'private']){
  const result=assess(x);assert.equal(result.staticPathsAcceptable,false);
  assert.equal(result.productionChangeAuthorized,false);
 }
 const f=fixture();f.paths.proxyNginxConf='/tmp/private-OWNER-SECRET';
 const result=assess(f);
 assert.equal(JSON.stringify(result).includes('OWNER-SECRET'),false);
 assert.equal(result.productionChangeAuthorized,false);
});
