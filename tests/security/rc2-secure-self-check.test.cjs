'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runSecureSelfCheck}=require('../../utils/rc2-secure-self-check.cjs');
test('RED: secure self-check never claims heal or browser audit',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-self-'));
 try{
  fs.writeFileSync(path.join(dir,'a.conf'),'x\n');
  const r=await runSecureSelfCheck({appsDir:dir,includeHttp:false});
  assert.equal(r.ok,true);
  assert.equal(r.code,'SELF_CHECK_INVENTORY_ONLY');
  assert.equal(r.healingPerformed,false);
  assert.equal(r.browserAudited,false);
  assert.equal(r.productionChangeAuthorized,false);
  assert.equal(r.httpScan,null);
  assert.equal(r.inventory.count,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('RED: http opt-in without probe fails closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-self2-'));
 try{
  fs.writeFileSync(path.join(dir,'a.conf'),'x\n');
  const r=await runSecureSelfCheck({appsDir:dir,includeHttp:true,diagnosticsFile:'/tmp/x'});
  assert.equal(r.ok,false);
  assert.equal(r.code,'SELF_CHECK_HTTP_PROBE_UNAVAILABLE');
  assert.equal(r.healingPerformed,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
