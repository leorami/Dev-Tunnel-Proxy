'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHostReloadService}=require('../utils/host-nginx-reload-service.cjs');
const {createFixedNginxDockerDriver}=require('../utils/fixed-nginx-docker-driver.cjs');
const {createHostReloadClient}=require('../utils/host-nginx-reload-client.cjs');
const ID='1'.repeat(64),IMAGE='sha256:'+'a'.repeat(64);
async function runLab({identity=`${ID} ${IMAGE} true\n`,validated=true,active=true,authorized=true}={}) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-e2e-reload-'));
 await fs.chmod(directory,0o700);
 const commands=[];
 const call=async(bin,args,opts)=>{
  commands.push({bin,args,opts});
  if(args[0]==='inspect')return {stdout:identity};
  if(args.includes('-t')&&!validated)throw Error('INVALID_NGINX');
  return {stdout:''};
 };
 const driver=createFixedNginxDockerDriver({dockerBinary:'/usr/local/bin/docker',expectedContainerId:ID,expectedImage:IMAGE,call});
 const host=createHostReloadService({directory,approvedContainerId:ID,authorize:async()=>authorized,attest:driver.attest,execute:driver.execute,verify:async()=>active});
 await host.start();
 const client=createHostReloadClient({socketPath:host.socketPath});
 return {directory,host,client,commands,close:async()=>{await host.stop();await fs.rm(directory,{recursive:true,force:true});}};
}
test('full client to host handoff: inspect, validate, inspect, reload, route proof',async()=>{
 const x=await runLab();try{
  const res=await x.client.activate();
  assert.equal(res.status,'HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY');
  assert.equal(res.productionChangeAuthorized,false);
  assert.equal(x.commands.length,5);
  assert.deepEqual(x.commands.map(x=>x.args[0]),['inspect','exec','inspect','exec','inspect']);
  assert.deepEqual(x.commands.at(3).args,['exec',ID,'nginx','-s','reload']);
 }finally{await x.close();}
});
test('unapproved callback denies all host commands',async()=>{
 const x=await runLab({authorized:false});try{
  assert.equal((await x.client.activate()).status,'BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
  assert.equal(x.commands.length,0);
 }finally{await x.close();}
});
test('identity drift fails before nginx validation and reload',async()=>{
 const x=await runLab({identity:`${'f'.repeat(64)} ${IMAGE} true\n`});try{
  assert.equal((await x.client.activate()).status,'BLOCKED_CONTAINER_IDENTITY');
  assert.equal(x.commands.length,1);
 }finally{await x.close();}
});
test('invalid nginx config never reloads',async()=>{
 const x=await runLab({validated:false});try{
  assert.equal((await x.client.activate()).status,'NGINX_VALIDATION_FAILED');
  assert.equal(x.commands.some(x=>x.args.includes('reload')),false);
 }finally{await x.close();}
});
test('route fails independent post-reload verification',async()=>{
 const x=await runLab({active:false});try{
  assert.equal((await x.client.activate()).status,'ROUTE_NOT_VERIFIED');
 }finally{await x.close();}
});
test('unreachable host mediator refuses activation quickly',async()=>{
 const x=await runLab();try{
  await x.host.stop();
  const r=await x.client.activate();
  assert.equal(r.status,'BLOCKED_HOST_MEDIATOR_UNAVAILABLE');
 }finally{await x.close();}
});
