'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {Readable}=require('node:stream');
const {parseConstrainedAuditTarget,createConstrainedLocalHttpAudit,readBoundedAuditBody}=require('../../utils/rc2-secure-http-audit.cjs');
const trusted=new Set(['https://example.ngrok.app']);
test('RED: path and trusted-origin input use a fixed local transport destination',()=>{
 for(const input of ['/airluum/','http://dev-proxy/airluum/', 'https://example.ngrok.app/airluum/']){
  const r=parseConstrainedAuditTarget({url:input,trustedOrigins:trusted});
  assert.deepEqual(r,{ok:true,route:'/airluum/'});
 }
});
test('RED: never accept URL-provided IP, host, port, creds, traversal, query or fragment',()=>{
 const bad=[
  'https://evil.com/airluum','http://127.0.0.1/airluum','http://169.254.169.254/latest/meta-data',
  'http://dev-proxy:3001/airluum','http://user@dev-proxy/airluum',
  'http://dev-proxy.evil.tld/airluum','https://example.ngrok.app:443/airluum',
  '//evil.com/airluum','/airluum/../admin','/airluum/%2e%2e/admin',
  '/airluum//admin','/airluum?token=abc','/airluum#frag',
  '/airluum\\admin','/airluum\r\nGET /admin','/ä','/airluum/./assets',
  '/devproxy/api/ai/health','/admin/check','/status/status.html',
  ' http://dev-proxy/airluum ','ftp://dev-proxy/airluum', '', null, {},
 ];
 for(const input of bad){assert.equal(parseConstrainedAuditTarget({url:input,trustedOrigins:trusted}).ok,false,String(input));}
});
test('RED: unauthenticated arbitrary origin is not an allowlist substitute',()=>{
 assert.equal(parseConstrainedAuditTarget({url:'https://other.ngrok.app/airluum',trustedOrigins:trusted}).ok,false);
 assert.equal(parseConstrainedAuditTarget({url:'https://example.ngrok.app/airluum',trustedOrigins:new Set()}).ok,false);
 assert.equal(parseConstrainedAuditTarget({url:'https://example.ngrok.app/airluum',trustedOrigins:['https://example.ngrok.app']}).ok,false);
});
test('RED: actual network request always HEAD to fixed dev-proxy:80, never passes cookies, never follows redirect',async()=>{
 let called=0,transportOpts;
 const requestImpl=(opts,cb)=>{called++;transportOpts=opts;
  return http.request({ ...opts,hostname:'127.0.0.1',port:0},cb);
 };
 // A stable in-process server is the only fixture destination; it intentionally redirects to an attacker URL.
 const srv=http.createServer((req,res)=>{assert.equal(req.method,'HEAD');assert.equal(req.url,'/airluum/');res.writeHead(302,{Location:'https://evil.invalid/private'});res.end();});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 try{
  const a=createConstrainedLocalHttpAudit({requestImpl:(opts,cb)=>{called++;transportOpts=opts;return http.request({...opts,hostname:'127.0.0.1',port:srv.address().port},cb);},trustedOrigins:trusted});
  const r=await a.audit({url:'https://example.ngrok.app/airluum/'});
  assert.equal(called,1);assert.equal(transportOpts.method,'HEAD');
  assert.equal(transportOpts.hostname,'dev-proxy');assert.equal(transportOpts.port,80);
  assert.equal(transportOpts.path,'/airluum/');
  assert.equal(transportOpts.headers.Cookie,undefined);
  assert.equal(transportOpts.headers.Authorization,undefined);
  assert.equal(r.ok,false);assert.equal(r.summary.status,302);
  assert.equal(r.summary.browserAudited,false);assert.equal(r.summary.redirectFollowed,false);
  assert.equal(JSON.stringify(r).includes('evil.invalid'),false);
  assert.equal(r.productionChangeAuthorized,false);assert.equal(r.routeModified,false);
 }finally{await new Promise(r=>srv.close(r));}
});
test('RED: invalid request cannot reach any network transport',async()=>{
 let calls=0;
 const a=createConstrainedLocalHttpAudit({trustedOrigins:trusted,requestImpl:()=>{calls++;throw Error('UNEXPECTED_NETWORK_CALL');}});
 const r=await a.audit({url:'https://evil.tld/internal'});
 assert.equal(r.httpStatus,400);assert.equal(calls,0);
 assert.equal(JSON.stringify(r).includes('evil.tld'),false);
});
test('RED: bounded request body fails closed before any external call',async()=>{
 const ok=await readBoundedAuditBody(Readable.from([Buffer.from('{"url":"/airluum/"}')]));
 assert.deepEqual(ok,{url:'/airluum/'});
 const compatible=await readBoundedAuditBody(Readable.from([Buffer.from('{"url":"/airluum/","wait":1500,"timeout":30000}')]));
 assert.deepEqual(compatible,{url:'/airluum/',wait:1500,timeout:30000});
 for(const stream of [Readable.from([Buffer.alloc(2049)]),Readable.from([Buffer.from('{invalid')]),Readable.from([Buffer.from('[]')]),Readable.from([Buffer.from('{"url":"/x/","secret":"bad"}')])]){
  assert.equal(await readBoundedAuditBody(stream),null);
 }
});
test('RED: response classifications are observation-only, with no false browser or heal PASS',async()=>{
 for(const status of [200,404,500]){
  const srv=http.createServer((_req,res)=>{res.writeHead(status);res.end();});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));
  try{
   const a=createConstrainedLocalHttpAudit({requestImpl:(opts,cb)=>http.request({...opts,hostname:'127.0.0.1',port:srv.address().port},cb)});
   const result=await a.audit({url:'/airluum/'});
   assert.equal(result.summary.status,status);
   assert.equal(result.ok,status===200);
   assert.equal(result.summary.mode,'LOCAL_HTTP_HEAD_ONLY');
   assert.equal(result.summary.healingPerformed,false);
   assert.equal(result.summary.browserAudited,false);
   assert.equal(result.ownerUatApproved,false);
  }finally{await new Promise(r=>srv.close(r));}
 }
});

test('network exception and hung request fail with bounded fixed statuses, no response details',async()=>{
 const broken=createConstrainedLocalHttpAudit({requestImpl:()=>{throw Error('private credential: DO NOT LEAK');}});
 const bad=await broken.audit({url:'/airluum/'});
 assert.equal(bad.httpStatus,503);assert.equal(bad.code,'LOCAL_HTTP_PROBE_UNAVAILABLE');
 assert.equal(JSON.stringify(bad).includes('DO NOT LEAK'),false);
 const {EventEmitter}=require('node:events');
 let destroyed=false;
 const stuck=createConstrainedLocalHttpAudit({timeoutMs:100,requestImpl:()=>{
  const req=new EventEmitter();req.end=()=>{};req.destroy=()=>{destroyed=true};return req;
 }});
 const start=Date.now();
 const timed=await stuck.audit({url:'/airluum/'});
 assert.equal(timed.code,'LOCAL_HTTP_PROBE_TIMEOUT');assert.equal(destroyed,true);
 assert.ok(Date.now()-start<700);
});
