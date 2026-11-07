'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {runExplicitHostWorker}=require('../../scripts/rc2-supervised-mac-host-worker.cjs');
async function f(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dpv82-cli-')));await fs.chmod(root,0o700);return {root,pin:path.join(root,'private-pin.json'),close:()=>fs.rm(root,{recursive:true,force:true})}}
function deps(f,counts,extra={}){return {
 loadPin:()=>{counts.load++;return {spoolDirectory:path.join(f.root,'spool'),leaseDirectory:f.root}},
 provision:async()=>{counts.provision++},
 makeWorker:()=>{counts.make++;return {processOne:async()=>({code:'HOST_PROCESSED',status:'RELOAD_AND_VERIFICATION_REPORTED'})}},
 makeQueue:({worker})=>{counts.queue++;return {scanOnce:async()=>{counts.scan++;return []}}},
 ...extra};}
test('RED: explicit scan-once is source wired and does not run Docker without a request',async()=>{const a=await f();try{const c={load:0,provision:0,make:0,queue:0,scan:0};const r=await runExplicitHostWorker({mode:'scan-once',pinPath:a.pin,deps:deps(a,c)});assert.equal(r.code,'HOST_WORKER_SCAN_COMPLETE');assert.deepEqual(c,{load:1,provision:1,make:1,queue:1,scan:1})}finally{await a.close()}});
test('RED: serve stops cleanly through AbortSignal and no host process persists',async()=>{const a=await f();try{const c={load:0,provision:0,make:0,queue:0,scan:0},abort=new AbortController();const d=deps(a,c,{makeQueue:({worker})=>({scanOnce:async()=>{c.scan++;abort.abort();return []}})});const r=await runExplicitHostWorker({mode:'serve',pinPath:a.pin,signal:abort.signal,deps:d});assert.equal(r.code,'HOST_WORKER_STOPPED_CLEANLY');assert.equal(c.scan,1);await assert.rejects(()=>fs.stat(path.join(a.root,'host-worker-singleton.lock')),/ENOENT/)}finally{await a.close()}});
test('RED: missing explicit mode rejected before touching pin or queue',async()=>{const a=await f();try{let calls=0;await assert.rejects(()=>runExplicitHostWorker({mode:'',pinPath:a.pin,deps:{loadPin:()=>{calls++}}}),/INVALID_HOST_WORKER_INVOCATION/);assert.equal(calls,0)}finally{await a.close()}});
test('RED: unsupported worker mode rejected, not silently privileged',async()=>{const a=await f();try{await assert.rejects(()=>runExplicitHostWorker({mode:'reload',pinPath:a.pin}),/INVALID_HOST_WORKER_INVOCATION/)}finally{await a.close()}});
test('RED: mode serve requires explicit signal',async()=>{const a=await f();try{await assert.rejects(()=>runExplicitHostWorker({mode:'serve',pinPath:a.pin}),/INVALID_HOST_WORKER_INVOCATION/)}finally{await a.close()}});
test('RED: unsafe nonabsolute pin path rejected before reading',async()=>{await assert.rejects(()=>runExplicitHostWorker({mode:'scan-once',pinPath:'pin.json'}),/INVALID_HOST_WORKER_INVOCATION/)});
test('RED: process exceptions preserve singleton and never return a success',async()=>{const a=await f();try{const c={load:0,provision:0,make:0,queue:0,scan:0};const d=deps(a,c,{makeQueue:()=>({scanOnce:async()=>{throw Error('host crashed')}})});await assert.rejects(()=>runExplicitHostWorker({mode:'scan-once',pinPath:a.pin,deps:d}),/HOST_WORKER_SCAN_INDETERMINATE/);assert.equal((await fs.stat(path.join(a.root,'host-worker-singleton.lock'))).isFile(),true)}finally{await a.close()}});
test('RED: private source/secret paths do not appear in returned status',async()=>{const a=await f();try{const c={load:0,provision:0,make:0,queue:0,scan:0};const result=await runExplicitHostWorker({mode:'scan-once',pinPath:a.pin,deps:deps(a,c)});assert.equal(JSON.stringify(result).includes(a.root),false);assert.equal(result.deployed,false)}finally{await a.close()}});
