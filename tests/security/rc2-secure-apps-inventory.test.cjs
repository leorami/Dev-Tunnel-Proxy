'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {listSecureAppsInventory}=require('../../utils/rc2-secure-apps-inventory.cjs');
test('RED: secure apps inventory is local-readonly and never claims docker/heal scan',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-apps-inv-'));
 try{
  fs.writeFileSync(path.join(dir,'alpha.conf'),'x\n');
  fs.writeFileSync(path.join(dir,'beta.conf'),'y\n');
  fs.writeFileSync(path.join(dir,'alpha.conf.backup.1'),'z\n');
  const r=listSecureAppsInventory({appsDir:dir});
  assert.equal(r.ok,true);
  assert.equal(r.code,'APPS_INVENTORY_LOCAL_READONLY');
  assert.equal(r.dockerUsed,false);
  assert.equal(r.healingPerformed,false);
  assert.equal(r.browserScanned,false);
  assert.equal(r.productionChangeAuthorized,false);
  assert.equal(r.count,2);
  assert.deepEqual(r.routes.map(x=>x.file),['alpha.conf','beta.conf']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('RED: relative or missing appsDir fails closed',()=>{
 assert.equal(listSecureAppsInventory({appsDir:'apps'}).ok,false);
 assert.equal(listSecureAppsInventory({appsDir:'/tmp/does-not-exist-rc2-inv'}).ok,false);
});
