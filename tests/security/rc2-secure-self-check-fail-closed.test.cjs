'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {runSecureSelfCheck}=require('../../utils/rc2-secure-self-check.cjs');
async function isolated(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-self-check-'));
 const appsDir=path.join(dir,'apps');fs.mkdirSync(appsDir);fs.writeFileSync(path.join(appsDir,'a.conf'),'location /app/ {}');
 const diagnosticsFile=path.join(dir,'bundle-diagnostics.json');
 try{return await fn({appsDir,diagnosticsFile});}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const probe={audit:async()=>({ok:true,code:'LOCAL_HTTP_OK',summary:{status:200}})};
test('RED: explicit HTTP request with missing source artifact returns error, not false HTTP200 success',()=>isolated(async({appsDir,diagnosticsFile})=>{
 const r=await runSecureSelfCheck({appsDir,diagnosticsFile,probe,includeHttp:true});
 assert.equal(r.ok,false);assert.equal(r.httpStatus,503);
 assert.equal(r.code,'SELF_CHECK_HTTP_PROBE_UNAVAILABLE');
 assert.equal(r.healingPerformed,false);
 assert.equal(r.realAppVerified,'UNKNOWN');
}));
test('RED: corrupt existing diagnostics cannot be presented as a successful observation',()=>isolated(async({appsDir,diagnosticsFile})=>{
 fs.writeFileSync(diagnosticsFile,'not json');
 const r=await runSecureSelfCheck({appsDir,diagnosticsFile,probe,includeHttp:true});
 assert.equal(r.ok,false);assert.equal(r.httpStatus,503);
 assert.equal(r.code,'SELF_CHECK_HTTP_PROBE_UNAVAILABLE');
}));
test('default local inventory still succeeds without diagnostics and performs no HTTP probe',()=>isolated(async({appsDir,diagnosticsFile})=>{
 let calls=0;
 const r=await runSecureSelfCheck({appsDir,diagnosticsFile,includeHttp:false,probe:{audit:async()=>{calls++;}}});
 assert.equal(r.ok,true);assert.equal(r.httpStatus,200);
 assert.equal(r.code,'SELF_CHECK_INVENTORY_ONLY');assert.equal(r.inventory.count,1);
 assert.equal(calls,0);assert.equal(r.healingPerformed,false);
}));
test('existing valid HTTP evidence still succeeds without claiming live owner UAT',()=>isolated(async({appsDir,diagnosticsFile})=>{
 fs.writeFileSync(diagnosticsFile,JSON.stringify({included:[{kind:'app',pathSpec:'/app/',source:'apps/a.conf'}]}));
 const r=await runSecureSelfCheck({appsDir,diagnosticsFile,probe,includeHttp:true});
 assert.equal(r.ok,true);assert.equal(r.httpStatus,200);
 assert.equal(r.httpScan.observed,1);assert.equal(r.healingPerformed,false);
 assert.equal(r.deployed,false);assert.equal(r.ownerUatApproved,false);
}));
const {Readable}=require('node:stream');
const {readSecureSelfCheckRequestBody}=require('../../utils/rc2-secure-self-check.cjs');
function req(body){return Readable.from([body]);}
test('RED: explicit heal=true never silently returns a successful observation',async()=>{
 const v=await readSecureSelfCheckRequestBody(req('{"heal":true}'));
 assert.equal(v.ok,false);assert.equal(v.httpStatus,503);
 assert.equal(v.code,'SELF_CHECK_HEAL_UNAVAILABLE');
});
test('RED: advanced=true never silently returns a successful observation',async()=>{
 const v=await readSecureSelfCheckRequestBody(req('{"advanced":true,"heal":false}'));
 assert.equal(v.ok,false);assert.equal(v.httpStatus,503);
 assert.equal(v.code,'SELF_CHECK_HEAL_UNAVAILABLE');
});
test('RED: malformed JSON, unknown fields and oversized body are rejected rather than treated as normal',async()=>{
 for(const body of ['{broken','{"heal":1}', '{"foo":"bar"}',JSON.stringify({hint:'x'.repeat(2300)})]){
  const v=await readSecureSelfCheckRequestBody(req(body));
  assert.equal(v.ok,false,body.slice(0,40));assert.equal(v.httpStatus,400);
  assert.equal(v.code,'INVALID_SELF_CHECK_BODY');
 }
});
test('READ: bounded empty and heal:false self-check continue to allow local observation',async()=>{
 for(const body of ['', '{}', '{"heal":false}', '{"heal":false,"advanced":false}']){
  const v=await readSecureSelfCheckRequestBody(req(body));
  assert.equal(v.ok,true,body);assert.equal(v.healRequested,false);
 }
});

test('RED: route-specific observation and repair hint cannot claim whole-app scan as targeted success',async()=>{
 for(const body of ['{"route":"/app/"}','{"hint":"fix the upstream"}']){
  const v=await readSecureSelfCheckRequestBody(req(body));
  assert.equal(v.ok,false);assert.equal(v.httpStatus,503);
  assert.equal(v.code,'SELF_CHECK_TARGET_UNSUPPORTED');
 }
});
