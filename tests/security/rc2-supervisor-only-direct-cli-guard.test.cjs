'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const entry=path.join(__dirname,'../../utils/rc2-mac-host-worker.cjs');
const supervised=path.join(__dirname,'../../scripts/rc2-supervised-mac-host-worker.cjs');
const legacy=require('../../utils/rc2-mac-host-worker.cjs');
const audited=require('../../utils/rc2-private-host-worker-pin.cjs');
test('RED: legacy direct entry rejects any supplied pin BEFORE filesystem access',async()=>{
 const missing='/this/path/is/not/owner/private/pin.json';
 await assert.rejects(()=>legacy.main([missing,'process-one','f'.repeat(32)]),
  /HOST_WORKER_SUPERVISOR_REQUIRED/);
});
test('RED: direct scan-once legacy mode is forbidden, no bypass around singleton',async()=>{
 await assert.rejects(()=>legacy.main(['/definitely/nonexistent/pin','scan-once']),
  /HOST_WORKER_SUPERVISOR_REQUIRED/);
});
test('RED: direct CLI fails closed without echoing owner paths, no command accepted',()=>{
 const marker='/sensitive/owner/hostname/never-logged/private-worker.pin';
 const child=spawnSync(process.execPath,[entry,marker,'process-one','f'.repeat(32)],
  {encoding:'utf8',timeout:2500});
 assert.equal(child.status,2);
 assert.match(child.stderr,/HOST_WORKER_SUPERVISOR_REQUIRED/);
 assert.equal(child.stderr.includes(marker),false);
 assert.equal(child.stdout,'');
});
test('RED: legacy unsafe pin reader is not an exported alternate loader',()=>{
 assert.equal(Object.hasOwn(legacy,'loadPrivatePin'),false);
 assert.equal(typeof audited.loadVerifiedHostWorkerPin,'function');
});
test('RED: supervised default worker constructor preserved for real fixed-action HMAC path',()=>{
 assert.equal(typeof legacy.createMacHostSettlementWorkerFromPin,'function');
 const runner=require(supervised);
 assert.equal(typeof runner.runExplicitHostWorker,'function');
});
test('RED: no CLI environment-pin shortcut remains in the legacy entry module',()=>{
 const source=require('node:fs').readFileSync(entry,'utf8');
 assert.equal(source.includes('DEVPROXY_HOST_WORKER_PIN'),false);
 assert.equal(source.includes("'process-one'"),false);
 assert.equal(source.includes("async function main("),true);
});
