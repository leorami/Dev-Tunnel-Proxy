'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createFixedNginxDockerDriver}=require('../utils/fixed-nginx-docker-driver.cjs');
const ID='1'.repeat(64),IMAGE='sha256:'+'a'.repeat(64);
test('RED: nginx validate/reload must target the attested 64-char ID, never mutable dev-proxy name',async()=>{
  const calls=[];
  const d=createFixedNginxDockerDriver({dockerBinary:'/usr/local/bin/docker',expectedContainerId:ID,expectedImage:IMAGE,call:async(b,a)=>{calls.push(a);return {stdout:''};}});
  assert.equal(await d.execute('docker',['exec',ID,'nginx','-t']),0);
  assert.equal(await d.execute('docker',['exec',ID,'nginx','-s','reload']),0);
  assert.equal(await d.execute('docker',['exec','dev-proxy','nginx','-t']),1);
  assert.equal(calls.length,2);
});
const {createHostReloadService}=require('../utils/host-nginx-reload-service.cjs');
test('RED: host service refuses to start without exact attested proxy container ID',()=>{
  assert.throws(()=>createHostReloadService({directory:'/private/tmp/test',authorize:async()=>true,attest:async()=>true,execute:async()=>0,verify:async()=>true}),/APPROVED|INVALID/);
  assert.throws(()=>createHostReloadService({directory:'/private/tmp/test',approvedContainerId:'dev-proxy',authorize:async()=>true,attest:async()=>true,execute:async()=>0,verify:async()=>true}),/APPROVED|INVALID/);
});
