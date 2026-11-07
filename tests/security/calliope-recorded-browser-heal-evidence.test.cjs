'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessRecordedBrowserHealEvidence}=require('../../utils/calliope-recorded-browser-heal-evidence.cjs');
const PATH='/lyra/_next/static/chunks/webpack.js';
const OTHER='/lyra/_next/static/chunks/webpack-alt.js';
const redirect=(path,location)=>({path,status:308,location,contentType:null});
const js=(path=PATH,mime='application/javascript')=>({path,status:200,location:null,contentType:mime});
const before=()=>({captureId:'a'.repeat(32),assetPath:PATH,responses:[redirect(PATH,OTHER),redirect(OTHER,PATH),redirect(PATH,OTHER)],browserError:'ERR_TOO_MANY_REDIRECTS',consoleErrors:[]});
const after=()=>({captureId:'b'.repeat(32),assetPath:PATH,responses:[js()],browserError:null,consoleErrors:[]});
const input=(a=before(),b=after())=>({route:'lyra',before:a,after:b});
const run=(a,b)=>assessRecordedBrowserHealEvidence(input(a,b));
test('RED: authentic-shaped recorded before-cycle and after-js yields only pending attestation',()=>{
 const r=run();
 assert.equal(r.status,'RECORDED_REPAIR_NEEDS_LIVE_ATTESTATION');
 assert.equal(r.beforeLoopObserved,true);
 assert.equal(r.afterJsServed,true);
 for(const key of ['healingPerformed','ownerApprovalGranted','liveAttested','releaseGateSatisfied','networkTransferAuthorized'])assert.equal(r[key],false);
 assert.match(r.evidenceDigest,/^[0-9a-f]{64}$/);
 assert.ok(Object.isFrozen(r));
});
test('RED: stable digest, no input mutation, zero secrets/route source leaked',()=>{
 const x=input(),copy=structuredClone(x),a=assessRecordedBrowserHealEvidence(x),b=assessRecordedBrowserHealEvidence(x);
 assert.equal(a.evidenceDigest,b.evidenceDigest);
 assert.deepEqual(x,copy);
 assert.ok(!JSON.stringify(a).includes('lyra'));
});
test('RED: a 200 from HEAD or absent prior broken cycle is NOT proof of repair',()=>{
 const a=before();a.responses=[js()];a.browserError=null;
 assert.equal(run(a,after()).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: browser error text without corresponding redirect cycle is insufficient',()=>{
 const a=before();a.responses=[redirect(PATH,OTHER),redirect(OTHER,'/lyra/_next/static/chunks/final.js')];
 assert.equal(run(a,after()).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: 200 HTML returned for JS can never be classified as recovered',()=>{
 const b=after();b.responses=[js(PATH,'text/html')];
 assert.equal(run(before(),b).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: unknown asset response status cannot count as successful',()=>{
 const b=after();b.responses=[{...js(),status:302,location:PATH}];
 assert.equal(run(before(),b).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: final script path must match the broken original asset',()=>{
 const b=after();b.responses=[js(OTHER)];
 assert.equal(run(before(),b).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: clean after probe with browser console error cannot claim recovery',()=>{
 const b=after();b.consoleErrors=['Unexpected token <'];
 assert.equal(run(before(),b).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: independent before and after capture identities mandatory',()=>{
 const b=after();b.captureId='a'.repeat(32);
 assert.equal(run(before(),b).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: request IDs, routes and object structure are exact validated',()=>{
 assert.equal(assessRecordedBrowserHealEvidence({...input(),extra:'docker exec'}).status,'INVALID_RECORDED_BROWSER_EVIDENCE');
 assert.equal(assessRecordedBrowserHealEvidence({...input(),route:'../admin'}).status,'INVALID_RECORDED_BROWSER_EVIDENCE');
 const b=after();b.captureId='x';
 assert.equal(run(before(),b).status,'INVALID_RECORDED_BROWSER_EVIDENCE');
});
test('RED: external URL, credentials, percent, query and traversal disallowed even in passive record',()=>{
 for(const path of ['https://evil.example/lyra/_next/static/webpack.js','/lyra/_next/static/%2e%2e/a.js','/lyra/_next/static/../webpack.js','/lyra/_next/static/webpack.js?secret=1','/lyra/_next/static//webpack.js']){
   const b=after();b.assetPath=path;b.responses=[js(path)];
   assert.equal(run(before(),b).status,'INVALID_RECORDED_BROWSER_EVIDENCE',path);
 }
});
test('RED: cross-scope redirect or leaked bearer token rejected',()=>{
 const a=before();a.responses[1].location='https://evil.example/?token=abc';
 assert.equal(run(a,after()).status,'INVALID_RECORDED_BROWSER_EVIDENCE');
});
test('RED: too many hops and injected keys rejected, bounded resource use',()=>{
 const a=before();a.responses=Array(17).fill(redirect(PATH,OTHER));
 assert.equal(run(a,after()).status,'INVALID_RECORDED_BROWSER_EVIDENCE');
 const b=after();b.responses[0].secret='s';
 assert.equal(run(before(),b).status,'INVALID_RECORDED_BROWSER_EVIDENCE');
});
test('RED: healthy final redirect chain remains acceptable if it ends with exact JS MIME',()=>{
 const b=after();b.responses=[redirect(PATH,OTHER),js(OTHER,'text/javascript; charset=utf-8')];
 const r=run(before(),b);
 assert.equal(r.status,'RECORDED_REPAIR_NEEDS_LIVE_ATTESTATION');
});
test('RED: loops in AFTER trace fail even with a synthetic final 200',()=>{
 const b=after();b.responses=[redirect(PATH,OTHER),redirect(OTHER,PATH),js(PATH)];
 assert.equal(run(before(),b).status,'RECORDED_EVIDENCE_INSUFFICIENT');
});
test('RED: no body capture and no executable actions in module exports',()=>{
 const api=require('../../utils/calliope-recorded-browser-heal-evidence.cjs');
 assert.deepEqual(Object.keys(api),['assessRecordedBrowserHealEvidence']);
 assert.equal(typeof api.exec, 'undefined');
});

test('RED: reserved proxy management route cannot serve as trained route target',()=>{
 for(const route of ['admin','status','devproxy','api','dashboard']){
  const r=assessRecordedBrowserHealEvidence({...input(),route});
  assert.equal(r.status,'INVALID_RECORDED_BROWSER_EVIDENCE',route);
 }
});
