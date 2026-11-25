'use strict';
// Real production-mode request handler, test-owned source/data and synthetic
// fixed-host response seam. No listening API, external AI or owner service.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const {EventEmitter}=require('node:events');
const http=require('node:http');
const https=require('node:https');
const child=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const origin='https://fixture.invalid';
test('production secure handler: auth, health, local Ask, honest thoughts, legacy denial and bounded observation', {timeout:20000}, async t=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'dp-secure-release-'));
 const password=crypto.randomBytes(24).toString('hex');
 const env=Object.assign({},process.env);
 const calls=[], forbidden=[];
 const fail=name=>()=>{forbidden.push(name);throw Error('unexpected '+name);};
 try{
  fs.mkdirSync(path.join(scratch,'utils'));
  for(const entry of fs.readdirSync(path.join(root,'utils'),{withFileTypes:true})){
   if(entry.isFile()&&/\.(?:js|cjs|mjs)$/.test(entry.name))
    fs.copyFileSync(path.join(root,'utils',entry.name),path.join(scratch,'utils',entry.name));
  }
  for(const d of ['docs','apps','.artifacts'])fs.mkdirSync(path.join(scratch,d));
  fs.writeFileSync(path.join(scratch,'README.md'),'# Fixture\n\nThe zephyr proxy route uses a signed worker and owner review.\n');
  fs.writeFileSync(path.join(scratch,'apps','one.conf'),'# fixture only\n');
  const diagnostics=path.join(scratch,'.artifacts','bundle-diagnostics.json');
  fs.writeFileSync(diagnostics,JSON.stringify({included:[
   {kind:'app',source:'apps/one.conf',pathSpec:'/one/'},
   {kind:'app',source:'apps/two.conf',pathSpec:'/two/'},
   {kind:'app',source:'apps/private.conf',pathSpec:'/admin/check'}
  ]}),{mode:0o600});
  for(const key of Object.keys(process.env))delete process.env[key];
  Object.assign(process.env,{NODE_ENV:'production',DEVPROXY_DENY_INLINE_DOCKER:'1',
   DEVPROXY_ALLOW_INLINE_DOCKER:'0',DEVPROXY_TRUSTED_ORIGINS:origin,ADMIN_PASSWORD:password,
   HOME:scratch,PATH:env.PATH||'/usr/bin:/bin'});
  for(const key of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])
   t.mock.method(child,key,fail(key));
  t.mock.method(globalThis,'fetch',fail('fetch'));
  t.mock.method(https,'request',fail('https.request'));
  t.mock.method(https,'get',fail('https.get'));
  t.mock.method(http,'get',fail('http.get'));
  t.mock.method(http,'request',(opts,cb)=>{
   calls.push(opts);
   assert.equal(opts.hostname,'dev-proxy');assert.equal(opts.port,80);
   assert.equal(opts.method,'HEAD');assert.equal(opts.agent,false);
   assert.deepEqual(opts.headers,{'Accept':'*/*'});
   assert.ok(['/one/','/two/'].includes(opts.path));
   const req=new EventEmitter();
   req.destroy=()=>{};
   req.end=()=>queueMicrotask(()=>cb({statusCode:opts.path==='/one/'?204:503,destroy(){}}));
   return req;
  });
  const api=require(path.join(scratch,'utils','proxyConfigAPI.js'));
  async function request(method,url,body,headers={}){
   const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
   Object.assign(req,{method,url,headers:{accept:'application/json',host:'fixture.invalid',...headers}});
   let code,responseHeaders,text,ended=false;
   const res={writeHead(n,h){code=n;responseHeaders=h;},end(s){text=s;ended=true;}};
   await api.handle(req,res);
   assert.ok(ended&&Number.isInteger(code),'actual handler must finish');
   return {code,headers:responseHeaders,body:JSON.parse(String(text))};
  }
  const health=await request('GET','/devproxy/api/ai/health');
  assert.equal(health.code,200);
  assert.deepEqual(health.body,{enabled:true,mode:'local_documentation',usedAI:false,healingPerformed:false,liveAttested:false});
  assert.equal(health.headers['Cache-Control'],'no-store');
  assert.equal((await request('GET','/devproxy/api/ai/thoughts')).code,401);
  assert.equal((await request('POST','/devproxy/api/ai/ask',{query:'zephyr'},{origin})).code,401);
  assert.equal((await request('POST','/admin/login',{password},{origin:'https://foreign.invalid'})).code,403);
  const login=await request('POST','/admin/login',{password},{origin});
  assert.equal(login.code,200);
  const cookie=login.headers['Set-Cookie'].split(';')[0];
  assert.match(cookie,/^admin_session=[a-f0-9]{64}$/);
  assert.match(login.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
  const session={cookie,origin};
  const pre=fs.readFileSync(diagnostics);
  const sessionFile=path.join(scratch,'.artifacts','admin-session.json');
  const sessionBefore=fs.readFileSync(sessionFile);
  assert.equal((await request('GET','/admin/check',undefined,{cookie})).code,200);
  assert.equal((await request('POST','/devproxy/api/ai/ask',{query:'zephyr'},{cookie,origin:'https://foreign.invalid'})).code,403);
  assert.equal((await request('POST','/devproxy/api/ai/ask',{query:'zephyr'},{cookie})).code,403);
  for(const suffix of ['', '?since=123']){
   const thoughts=await request('GET','/devproxy/api/ai/thoughts'+suffix,undefined,session);
   assert.equal(thoughts.code,200);
   assert.deepEqual(thoughts.body,{ok:true,events:[]},'current endpoint is a stub, not streaming');
  }
  const ask=await request('POST','/devproxy/api/ai/ask',{query:'zephyr proxy route'},session);
  assert.equal(ask.code,200);
  assert.equal(ask.body.mode,'local_documentation');assert.equal(ask.body.usedAI,false);
  assert.equal(ask.body.healingPerformed,false);assert.equal(ask.body.executionAuthorized,false);
  assert.match(ask.body.answer,/zephyr/i);assert.ok(ask.body.sources.includes('README.md'));
  assert.equal((await request('POST','/devproxy/api/ai/ask',{query:'zephyr',ownerApprovalGranted:true},session)).code,400);
  const denied=await request('POST','/devproxy/api/ai/audit-and-heal',{url:'http://dev-proxy/',route:'/'},session);
  assert.equal(denied.code,503);
  assert.equal(denied.body.error,'LEGACY_UNSETTLED_MANAGEMENT_BLOCKED');
  assert.equal(denied.body.productionChangeAuthorized,false);
  assert.equal((await request('POST','/devproxy/api/ai/audit',{url:'https://foreign.invalid/'},session)).code,400);
  assert.equal(calls.length,0);
  const audit=await request('POST','/devproxy/api/ai/audit',{url:'/one/'},session);
  assert.equal(audit.code,200);assert.equal(audit.body.summary.status,204);
  assert.equal(audit.body.summary.browserAudited,false);assert.equal(audit.body.routeModified,false);
  const scan=await request('POST','/devproxy/api/apps/scan?http=1',undefined,session);
  assert.equal(scan.code,200);assert.equal(scan.body.httpScan.code,'READONLY_HTTP_SCAN_EVIDENCE_ONLY');
  assert.equal(scan.body.httpScan.observed,2);assert.equal(scan.body.httpScan.httpGreen,1);
  assert.equal(scan.body.httpScan.httpNotGreen,1);assert.equal(scan.body.httpScan.skipped,1);
  assert.equal(scan.body.httpScan.liveAttested,false);
  assert.deepEqual(calls.map(x=>x.path).sort(),['/one/','/one/','/two/']);
  assert.deepEqual(fs.readFileSync(diagnostics),pre);
  assert.deepEqual(fs.readFileSync(sessionFile),sessionBefore);
  assert.deepEqual(forbidden,[]);
 }finally{
  t.mock.restoreAll();
  for(const key of Object.keys(process.env))delete process.env[key];
  Object.assign(process.env,env);
  fs.rmSync(scratch,{recursive:true,force:true});
 }
});
