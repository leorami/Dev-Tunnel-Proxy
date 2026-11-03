'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHostReloadService}=require('../utils/host-nginx-reload-service.cjs');
const {createHostReloadClient}=require('../utils/host-nginx-reload-client.cjs');
const {createFixedNginxDockerDriver}=require('../utils/fixed-nginx-docker-driver.cjs');
const ID='1'.repeat(64),IMAGE='sha256:'+'a'.repeat(64);
test('RED: post-reload container ID drift MUST be detected before active-route verification',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-postreload-')); await fs.chmod(directory,0o700);
 let attests=0,routeVerifies=0;
 const svc=createHostReloadService({directory,approvedContainerId:ID,authorize:async()=>true,attest:async()=>++attests<3,execute:async()=>0,verify:async()=>{routeVerifies++;return true;}});
 await svc.start();try{
  const client=createHostReloadClient({socketPath:svc.socketPath});
  const r=await client.activate();
  assert.equal(r.status,'CONTAINER_IDENTITY_CHANGED_AFTER_RELOAD');
  assert.equal(attests,3);
  assert.equal(routeVerifies,0);
 }finally{await svc.stop();await fs.rm(directory,{recursive:true,force:true});}
});
test('RED: a nonzero resolved Docker process result MUST NOT count as nginx success',async()=>{
 const d=createFixedNginxDockerDriver({dockerBinary:'/usr/local/bin/docker',expectedContainerId:ID,expectedImage:IMAGE,call:async()=>({stdout:'',status:1})});
 assert.equal(await d.execute('docker',['exec',ID,'nginx','-t']),1);
});
test('RED: resolved nonzero inspection must not authorize Docker reload',async()=>{
 const d=createFixedNginxDockerDriver({dockerBinary:'/usr/local/bin/docker',expectedContainerId:ID,expectedImage:IMAGE,call:async()=>({stdout:`${ID} ${IMAGE} true\n`,exitCode:1})});
 assert.equal(await d.attest(),false);
});
