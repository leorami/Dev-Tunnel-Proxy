'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHostReloadService}=require('../utils/host-nginx-reload-service.cjs');
const {createHostReloadClient}=require('../utils/host-nginx-reload-client.cjs');
const ID='1'.repeat(64);
async function runWith(override){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-timeout-'));
 await fs.chmod(directory,0o700);
 const service=createHostReloadService({directory,approvedContainerId:ID,operationTimeoutMs:40,
  authorize:async()=>true,attest:async()=>true,execute:async()=>0,verify:async()=>true,...override});
 await service.start();
 return {service,client:createHostReloadClient({socketPath:service.socketPath}),close:async()=>{await service.stop();await fs.rm(directory,{recursive:true,force:true});}};
}
test('RED: hung host execution bounded, no reload after nginx validation timeout',async()=>{
 const invocations=[];let signal;
 const x=await runWith({execute:async(tool,args,s)=>{signal=s;invocations.push(args);return new Promise(()=>{});}});
 try{
  const started=Date.now(); const res=await x.client.activate();
  assert.equal(res.status,'HOST_OPERATION_TIMEOUT_INDETERMINATE');
  assert(Date.now()-started<1000);
  assert.equal(invocations.length,1);
  assert.equal(signal.aborted,true);
 }finally{await x.close();}
});
test('RED: hung host authorization returns blocked without Docker commands',async()=>{
 let executed=0;
 const x=await runWith({authorize:async()=>new Promise(()=>{}),execute:async()=>{executed++;return 0;}});
 try{
  assert.equal((await x.client.activate()).status,'HOST_OPERATION_TIMEOUT_INDETERMINATE');
  assert.equal(executed,0);
 }finally{await x.close();}
});
test('RED: unbounded timeout parameter not silently accepted',()=>{
 assert.throws(()=>createHostReloadService({directory:'/private/tmp/devproxy',approvedContainerId:ID,operationTimeoutMs:999999,
  authorize:async()=>true,attest:async()=>true,execute:async()=>0,verify:async()=>true}),/INVALID_HOST_SERVICE_CONFIG/);
});
