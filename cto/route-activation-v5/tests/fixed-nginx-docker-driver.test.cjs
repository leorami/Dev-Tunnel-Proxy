'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createFixedNginxDockerDriver}=require('../utils/fixed-nginx-docker-driver.cjs');
const ID='1'.repeat(64),IMAGE='sha256:'+'a'.repeat(64);
const dockerBinary='/usr/local/bin/docker';
function make(responses=[]){const calls=[];const call=async(binary,args,opts)=>{calls.push({binary,args,opts});const reply=responses.shift();if(reply instanceof Error)throw reply;return reply??{stdout:'',stderr:''};};return {call,calls};}
test('attests full ID, image, running status with no secret-bearing inspect output',async()=>{
 const m=make([{stdout:`${ID} ${IMAGE} true\n`}]);
 const d=createFixedNginxDockerDriver({dockerBinary,expectedContainerId:ID,expectedImage:IMAGE,call:m.call});
 assert.equal(await d.attest(),true);
 assert.deepEqual(m.calls[0].args,['inspect','--format','{{.Id}} {{.Image}} {{.State.Running}}','dev-proxy']);
 assert.equal(m.calls[0].binary,dockerBinary);
 assert.equal(m.calls[0].opts.shell,false);
 assert.equal(m.calls[0].opts.timeout>0,true);
 assert.equal(m.calls[0].opts.maxBuffer<=4096,true);
});
test('attest rejects identity drift, image downgrade, not running, malformed output',async()=>{
 for(const value of [`${'2'.repeat(64)} ${IMAGE} true\n`,`${ID} sha256:${'b'.repeat(64)} true\n`,`${ID} ${IMAGE} false\n`, `${ID} ${IMAGE} true MORE\n`,`${ID} ${IMAGE}\n`]){
  const d=createFixedNginxDockerDriver({dockerBinary,expectedContainerId:ID,expectedImage:IMAGE,call:make([{stdout:value}]).call});
  assert.equal(await d.attest(),false);
 }
});
test('no user-controlled shell arguments for validation/reload',async()=>{
 const m=make();const d=createFixedNginxDockerDriver({dockerBinary,expectedContainerId:ID,expectedImage:IMAGE,call:m.call});
 assert.equal(await d.execute('docker',['exec',ID,'nginx','-t']),0);
 assert.equal(await d.execute('docker',['exec',ID,'nginx','-s','reload']),0);
 assert.equal(m.calls.length,2);
 for(const x of m.calls) assert.equal(x.opts.shell,false);
});
test('reject all unauthorized command variants before spawning',async()=>{
 const m=make();const d=createFixedNginxDockerDriver({dockerBinary,expectedContainerId:ID,expectedImage:IMAGE,call:m.call});
 for(const args of [[],['ps'],['exec','other','nginx','-t'],['exec','dev-proxy','sh','-c','whoami'],['kill','-s','HUP','dev-proxy']])
   assert.equal(await d.execute('docker',args),1);
 assert.equal(await d.execute('sh',['echo','hi']),1);
 assert.equal(m.calls.length,0);
});
test('spawn failure is fail closed and never returns stdout',async()=>{
 const m=make([new Error('DOCKER_BROKEN')]);
 const d=createFixedNginxDockerDriver({dockerBinary,expectedContainerId:ID,expectedImage:IMAGE,call:m.call});
 assert.equal(await d.attest(),false);
});
test('reject missing approved executable path or truncated image/id',()=>{
 for(const p of ['docker','./docker','/usr/bin/../docker']) assert.throws(()=>createFixedNginxDockerDriver({dockerBinary:p,expectedContainerId:ID,expectedImage:IMAGE,call:async()=>({})}));
 assert.throws(()=>createFixedNginxDockerDriver({dockerBinary,expectedContainerId:'12',expectedImage:IMAGE,call:async()=>({})}));
 assert.throws(()=>createFixedNginxDockerDriver({dockerBinary,expectedContainerId:ID,expectedImage:'sha256:123',call:async()=>({})}));
});
