'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {scanExistingAppHttpRoutes, readExistingRoutes, deriveSafeAuditRoute} = require('../../utils/rc2-readonly-app-http-scan.cjs');
const fixture = async fn => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-safe-scan-'));
  const file=path.join(dir,'bundle-diagnostics.json');
  try{return await fn({dir,file,write: entries=>fs.writeFileSync(file,JSON.stringify({generatedAt:'2026-11-04T00:00:00Z',overrides:[],apps:[],included:entries,skipped:[]}))});}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
};
const routes=[
 {kind:'app',pathSpec:'/airluum/',source:'apps/airluum.conf'},
 {kind:'app',pathSpec:'^~ /encast/',source:'apps/encast.conf'},
 {kind:'override',pathSpec:'= /docs',source:'overrides/docs.conf'},
 {kind:'app',pathSpec:'~ ^/regex/(.*)$',source:'apps/regex.conf'},
 {kind:'app',pathSpec:'/airluum/',source:'apps/duplicate.conf'}
];
test('RED: only safe nonadmin literal app routes derived; regex and root ignored',()=>{
  assert.equal(deriveSafeAuditRoute('/airluum/'),'/airluum/');
  assert.equal(deriveSafeAuditRoute('^~ /encast/'),'/encast/');
  assert.equal(deriveSafeAuditRoute('= /docs'),'/docs');
  for(const v of ['/', '= /', '~ ^/hello', '~* ^/hello', 'location /x {','http://evil/',
    '/admin/login','/devproxy/api','/.artifacts/foo','/%2e%2e/admin','/a?token=x','/a//b','/a/../b','/a/.hidden','^~ /admin/check']){
    assert.equal(deriveSafeAuditRoute(v),null,v);
  }
});
test('RED: read-only scan uses single immutable artifact; no route regeneration, no network redirect or writes', async()=>fixture(async ({file,dir,write})=>{
  write(routes);
  const before=fs.readFileSync(file);
  const st=fs.statSync(file);
  const seen=[];
  const probe={audit:async ({url})=>{seen.push(url);return {httpStatus:200,ok:url!=='/docs',code:url==='/docs'?'LOCAL_HTTP_NOT_GREEN':'LOCAL_HTTP_OK',summary:{status:url==='/docs'?404:200}};}};
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe});
  assert.equal(r.code,'READONLY_HTTP_SCAN_EVIDENCE_ONLY');
  assert.deepEqual(seen,['/airluum/','/encast/','/docs']);
  assert.equal(r.observed,3);assert.equal(r.httpGreen,2);assert.equal(r.httpNotGreen,1);
  assert.equal(r.skipped,2);assert.equal(r.liveAttested,false);
  assert.equal(r.productionChangeAuthorized,false);assert.equal(r.deployed,false);
  assert.equal(r.healingPerformed,false);assert.equal(r.browserAudited,false);
  assert.equal(r.ownerUatApproved,false);
  assert.deepEqual(fs.readdirSync(dir),['bundle-diagnostics.json']);
  assert.deepEqual(fs.readFileSync(file),before);
  assert.equal(fs.statSync(file).mtimeMs,st.mtimeMs);
  assert.equal(JSON.stringify(r).includes('overrides/docs.conf'),false);
}));
test('RED: missing diagnostics never generates bundle',async()=>fixture(async ({file,dir})=>{
  let calls=0;
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{audit:async()=>{calls++;}}});
  assert.equal(r.code,'READONLY_HTTP_SCAN_UNAVAILABLE');
  assert.equal(calls,0);assert.deepEqual(fs.readdirSync(dir),[]);
}));
test('RED: reject symlink diagnostics and hardlinked diagnostics without calling probe', async()=>fixture(async ({file,dir,write})=>{
  const other=path.join(dir,'other.json');fs.writeFileSync(other,JSON.stringify({included:[]}));
  fs.symlinkSync(other,file);
  const probe={audit:async()=>{throw Error('NETWORK_CALL_LEAK');}};
  assert.equal((await scanExistingAppHttpRoutes({diagnosticsFile:file,probe})).code,'READONLY_HTTP_SCAN_UNAVAILABLE');
  fs.unlinkSync(file);fs.linkSync(other,file);
  assert.equal((await scanExistingAppHttpRoutes({diagnosticsFile:file,probe})).code,'READONLY_HTTP_SCAN_UNAVAILABLE');
}));
test('RED: invalid/malformed/bomb payloads are refused, not treated as no routes',async()=>fixture(async ({file})=>{
  const probe={audit:async()=>{throw Error('must not probe');}};
  for(const payload of ['{oops','null','[]','{}','{"included":null}', '{"included":[{"pathSpec":7}]}',
    '{"included":[{"pathSpec":"/valid/","source":"apps/foo.conf","kind":"untrusted"}]}',
    JSON.stringify({included:Array(129).fill({kind:'app',pathSpec:'/foo/'})}),
    'x'.repeat(262145)]){
    fs.writeFileSync(file,payload);
    assert.equal((await scanExistingAppHttpRoutes({diagnosticsFile:file,probe})).code,'READONLY_HTTP_SCAN_UNAVAILABLE');
  }
}));
test('RED: no owner source/path leakage in safe scan statuses, probe errors fail closed',async()=>fixture(async ({file,write})=>{
  write([{kind:'app',pathSpec:'/encast/',source:'apps/SECRET_TOKEN.conf'}]);
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{audit:async()=>{throw Error('/Users/owner/.env SECRET_TOKEN');}}});
  assert.equal(r.code,'READONLY_HTTP_SCAN_EVIDENCE_ONLY');
  assert.equal(r.results[0].code,'LOCAL_HTTP_PROBE_UNAVAILABLE');
  assert.equal(JSON.stringify(r).includes('SECRET_TOKEN'),false);
  assert.equal(JSON.stringify(r).includes('/Users/owner'),false);
}));
test('RED: no probes when invalid parameters or error from read-only checker',async()=>fixture(async ({file,write})=>{
  write(routes);
  const bogus = await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{}});
  assert.equal(bogus.code,'READONLY_HTTP_SCAN_UNAVAILABLE');
  assert.equal((await scanExistingAppHttpRoutes({diagnosticsFile:'../relative',probe:{audit:async()=>{}}})).code,'READONLY_HTTP_SCAN_UNAVAILABLE');
}));
test('RED: diagnostics reader checks max bytes/valid schema and never edits file',()=>fixture(({file,write})=>{
  write(routes);
  const r=readExistingRoutes({diagnosticsFile:file});
  assert.equal(r.ok,true);assert.equal(r.entries.length,5);
  assert.ok(Object.isFrozen(r.entries));
}));
test('RED: cap work at 32 local probes, retain evidence-only truncated status',async()=>fixture(async({file,write})=>{
  write(Array.from({length:100},(_,i)=>({kind:'app',pathSpec:'/app'+i+'/',source:'apps/route'+i+'.conf'})));
  let count=0;
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{audit:async()=>{count++;return {ok:true,code:'LOCAL_HTTP_OK',summary:{status:200}};}}});
  assert.equal(count,32);assert.equal(r.observed,32);assert.equal(r.skipped,68);
  assert.equal(r.truncated,true);assert.equal(r.code,'READONLY_HTTP_SCAN_EVIDENCE_ONLY');
  assert.equal(r.realAppVerified,'UNKNOWN');
}));
test('RED: malicious path prefix and private-route paths cannot be scanned',async()=>fixture(async({file,write})=>{
  write([{kind:'app',source:'apps/security.conf',pathSpec:'= /admin/check'},
    {kind:'override',source:'overrides/hide.conf',pathSpec:'^~ /devproxy/api/'},
    {kind:'app',source:'apps/hidden.conf',pathSpec:'/airluum/../../admin'},
    {kind:'app',source:'apps/hidden.conf',pathSpec:'/foo/.hidden'},
    {kind:'app',source:'apps/public.conf',pathSpec:'/public/'},
  ]);
  const calls=[];
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{audit:async ({url})=>{calls.push(url);return {ok:true,code:'LOCAL_HTTP_OK',summary:{status:204}};}}});
  assert.deepEqual(calls,['/public/']);assert.equal(r.skipped,4);
}));
test('RED: reject writable metadata files and invalid source linkage',async()=>fixture(async({file,write})=>{
  write([{kind:'app',pathSpec:'/valid/',source:'overrides/wrong.conf'}]);
  assert.equal(readExistingRoutes({diagnosticsFile:file}).ok,false);
  write(routes);fs.chmodSync(file,0o666);
  assert.equal(readExistingRoutes({diagnosticsFile:file}).ok,false);
}));
test('RED: never count false 200/404 status claims as green',async()=>fixture(async({file,write})=>{
  write([{kind:'app',pathSpec:'/one/',source:'apps/one.conf'},
    {kind:'app',pathSpec:'/two/',source:'apps/two.conf'}]);
  let calls=0;
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{audit:async()=>{
    calls++;return calls===1?{ok:true,code:'LOCAL_HTTP_OK',summary:{status:404}}:
      {ok:false,code:'LOCAL_HTTP_NOT_GREEN',summary:{status:200}};
  }}});
  assert.equal(r.httpGreen,0);assert.deepEqual(r.results.map(x=>x.code),[
    'LOCAL_HTTP_PROBE_UNAVAILABLE','LOCAL_HTTP_PROBE_UNAVAILABLE']);
}));
test('RED: bounded concurrent observations keep original route order and avoid serial 32x timeout',async()=>fixture(async({file,write})=>{
  write(Array.from({length:8},(_,i)=>({kind:'app',pathSpec:'/route'+i+'/',source:'apps/r'+i+'.conf'})));
  let active=0,maximum=0;
  const r=await scanExistingAppHttpRoutes({diagnosticsFile:file,probe:{audit:async({url})=>{
    active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,8));
    active--;
    return {ok:true,code:'LOCAL_HTTP_OK',summary:{status:204}};
  }}});
  assert.ok(maximum>1,'a serial 3.5s HEAD per route can create a 112s request');
  assert.ok(maximum<=4,'no more than four fixed-host HEADs at once');
  assert.deepEqual(r.results.map(x=>x.route),Array.from({length:8},(_,i)=>'/route'+i+'/'));
  assert.equal(r.httpGreen,8);
}));
