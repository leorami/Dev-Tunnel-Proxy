'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createAuthenticatedReloadBroker,createAuthenticatedReloadClient}=require('../utils/owner-authenticated-reload.cjs');
const KEY=crypto.randomBytes(32);
const DIGEST='a'.repeat(64);
async function root(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dp-v5-quarantine-'));await fs.chmod(dir,0o700);t.after(async()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function goodDriver(trace){return {attest:async()=>{trace.push('attest');return true;},execute:async act=>{trace.push(act);return 0;}};}
test('persistent in-flight marker blocks all new reloads after a simulated host crash',async t=>{
 const directory=await root(t);
 await fs.writeFile(path.join(directory,'nginx-operation-inflight'), 'held', {mode:0o600});
 const trace=[];
 const broker=createAuthenticatedReloadBroker({directory,secret:KEY,driver:goodDriver(trace),verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>true});
 await broker.start();t.after(()=>broker.stop());
 const resp=await createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY}).activate({expectedBundleSha256:DIGEST});
 assert.equal(resp.status,'BLOCKED_QUARANTINED');assert.deepEqual(trace,[]);
});
test('successful validated and verified reload clears durable marker and accepts next unique request',async t=>{
 const directory=await root(t),trace=[];
 const broker=createAuthenticatedReloadBroker({directory,secret:KEY,driver:goodDriver(trace),verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>true});
 await broker.start();t.after(()=>broker.stop());
 const client=createAuthenticatedReloadClient({socketPath:broker.socketPath,secret:KEY});
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'RELOAD_AND_VERIFICATION_REPORTED');
 await assert.rejects(fs.lstat(path.join(directory,'nginx-operation-inflight')),{code:'ENOENT'});
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'RELOAD_AND_VERIFICATION_REPORTED');
 assert.equal(trace.filter(x=>x==='nginx-reload').length,2);
});
test('uncertain failure after reload leaves permanent quarantine even across a broker restart',async t=>{
 const directory=await root(t);const trace=[];
 const driver=goodDriver(trace);
 let server=createAuthenticatedReloadBroker({directory,secret:KEY,driver,verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>false});
 await server.start();
 assert.equal((await createAuthenticatedReloadClient({socketPath:server.socketPath,secret:KEY}).activate({expectedBundleSha256:DIGEST})).status,'ACTIVE_ROUTE_UNVERIFIED');
 assert.equal((await fs.lstat(path.join(directory,'nginx-operation-inflight'))).mode&0o077,0);
 await server.stop();server=createAuthenticatedReloadBroker({directory,secret:KEY,driver,verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>true});
 await server.start();t.after(()=>server.stop());
 assert.equal((await createAuthenticatedReloadClient({socketPath:server.socketPath,secret:KEY}).activate({expectedBundleSha256:DIGEST})).status,'BLOCKED_QUARANTINED');
 assert.equal(trace.filter(x=>x==='nginx-reload').length,1);
});
test('time-out of non-cancelling callback may not permit another reload',async t=>{
 const directory=await root(t),trace=[];
 const driver={attest:async()=>true,execute:async action=>{trace.push(action);if(action==='nginx-reload')return await new Promise(r=>setTimeout(()=>r(0),1200));return 0;}};
 const server=createAuthenticatedReloadBroker({directory,secret:KEY,driver,verifyCandidateBundle:async()=>true,verifyActiveRoute:async()=>true,timeoutMs:500});
 await server.start();t.after(()=>server.stop());
 const client=createAuthenticatedReloadClient({socketPath:server.socketPath,secret:KEY,timeoutMs:2500});
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'HOST_OPERATION_INDETERMINATE');
 assert.equal((await client.activate({expectedBundleSha256:DIGEST})).status,'BLOCKED_QUARANTINED');
 assert.deepEqual(trace,['nginx-test','nginx-reload']);
});
