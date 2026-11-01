import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createDevProxy, createLoopbackHealthApp } from '../../packages/dev-proxy-mcp/gateway.mjs';
import { createServer, request as nodeRequest } from 'node:http';

const token = () => randomBytes(32).toString('hex');
const schema = { type:'object', additionalProperties:false, required:['message'], properties:{ message:{type:'string',maxLength:40} } };
function makeApps(log=[]) { return {
  wizardmaker:{
    label:'Wizardmaker local',
    status:async()=>({online:true,source:'TEST_LOCAL_APP'}),
    commands:{
      echo:{risk:'read',description:'Return an original test message',inputSchema:schema,run:async(args)=>({value:args.message})},
      rename:{risk:'write',description:'Change a local test label',inputSchema:schema,run:async(args)=>{log.push(args.message);return {changed:true};}},
      delete:{risk:'destructive',description:'Delete a test item',inputSchema:schema,run:async(args)=>{log.push('delete:'+args.message);return {deleted:true};}},
    },
  },
}; }
async function setup({apps=makeApps(),secret=token(),clock=()=>Date.now(),maxCommandMs=15000}={}){
 const proxy=createDevProxy({token:secret,apps,clock,maxCommandMs});
 const live=await proxy.start({port:0});
 return {proxy,live,secret,endpoint:`http://127.0.0.1:${live.port}/mcp`};
}
const protocol='2026-07-28';
const clientMeta=()=>({
 'io.modelcontextprotocol/protocolVersion':protocol,
 'io.modelcontextprotocol/clientCapabilities':{},
 'io.modelcontextprotocol/clientInfo':{name:'dev-proxy-test',version:'1.0'},
});
async function rpc(endpoint,secret,method,params={},id=1,extra={}){
 const bodyParams={...params,_meta:clientMeta()};
 const headers={'content-type':'application/json','accept':'application/json, text/event-stream',authorization:`Bearer ${secret}`,
  'MCP-Protocol-Version':protocol,'Mcp-Method':method,
  ...(method==='tools/call'?{'Mcp-Name':params.name}:{}),
  ...(extra.headers||{})};
 const payload=extra.body ?? {jsonrpc:'2.0',id,method,params:bodyParams};
 const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),redirect:'manual'});
 const text=await response.text();
 return {status:response.status,data:text?JSON.parse(text):null,raw:text};
}
async function invoke(ctx,name,args,id=1){const r=await rpc(ctx.endpoint,ctx.secret,'tools/call',{name,arguments:args},id);return {http:r.status,rpc:r.data,result:r.data?.result?.content?.[0]?.text&&JSON.parse(r.data.result.content[0].text)};}

// Expected RED: missing gateway module before source implementation.
test('the local MCP endpoint initializes, lists app tools and denies anonymous requests',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const denied=await rpc(c.endpoint,'bad-token','tools/list',{},1);
 assert.equal(denied.status,401);
 const discovery=await rpc(c.endpoint,c.secret,'server/discover',{});
 assert.equal(discovery.status,200);
 assert.equal(discovery.data.result.resultType,'complete');
 assert.ok(discovery.data.result.supportedVersions.includes(protocol));
 assert.equal(discovery.data.result._meta['io.modelcontextprotocol/serverInfo'].name,'dev-tunnel-proxy-app-mcp');
 const listed=await rpc(c.endpoint,c.secret,'tools/list',{});
 assert.equal(listed.status,200);
 assert.equal(listed.data.result.resultType,'complete');
 assert.deepEqual(listed.data.result.tools.map(x=>x.name),['app.list','app.status','app.command']);
 const apps=await invoke(c,'app.list',{});
 assert.equal(apps.result.apps[0].id,'wizardmaker');
 assert.equal(apps.result.apps[0].commands.find(x=>x.name==='rename').risk,'write');
});

test('read-only command reaches registered local app; no shell or arbitrary route exposed',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const out=await invoke(c,'app.command',{app:'wizardmaker',command:'echo',args:{message:'Hello local Wizardmaker'}});
 assert.equal(out.http,200);assert.equal(out.rpc.result.resultType,'complete');assert.deepEqual(out.result,{value:'Hello local Wizardmaker'});
 const status=await invoke(c,'app.status',{app:'wizardmaker'});
 assert.equal(status.result.online,true);
 for(const command of ['sh','exec','cat /etc/passwd','../../secrets']){
  const bad=await invoke(c,'app.command',{app:'wizardmaker',command,args:{message:'x'}});
  assert.equal(bad.rpc.result.isError,true);
 }
});

test('write/destructive commands require locally issued, one-use, args-bound approval',async t=>{
 const changes=[];const c=await setup({apps:makeApps(changes)});t.after(()=>c.live.close());
 const unapproved=await invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'A'}});
 assert.equal(unapproved.rpc.result.isError,true);assert.equal(changes.length,0);
 const approval=c.proxy.issueApproval({app:'wizardmaker',command:'rename',args:{message:'A'}});
 const wrong=await invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'B'},approval:approval.token});
 assert.equal(wrong.rpc.result.isError,true);assert.equal(changes.length,0);
 const approved=await invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'A'},approval:approval.token});
 assert.deepEqual(approved.result,{changed:true});assert.deepEqual(changes,['A']);
 const replay=await invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'A'},approval:approval.token});
 assert.equal(replay.rpc.result.isError,true);assert.deepEqual(changes,['A']);
 const writeApproval=c.proxy.issueApproval({app:'wizardmaker',command:'rename',args:{message:'A'}});
 const cannotEscalate=await invoke(c,'app.command',{app:'wizardmaker',command:'delete',args:{message:'A'},approval:writeApproval.token});
 assert.equal(cannotEscalate.rpc.result.isError,true);assert.deepEqual(changes,['A']);
});

test('approvals expire and action arguments fail closed on added fields/oversized text',async t=>{
 let now=1000;const c=await setup({clock:()=>now});t.after(()=>c.live.close());
 const approval=c.proxy.issueApproval({app:'wizardmaker',command:'rename',args:{message:'Good'},ttlMs:100});
 now=1101;
 const expired=await invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'Good'},approval:approval.token});
 assert.equal(expired.rpc.result.isError,true);
 for(const args of [{message:'x',shell:'rm -rf /'}, {message:5},{message:'a'.repeat(41)}]){
  const out=await invoke(c,'app.command',{app:'wizardmaker',command:'echo',args});
  assert.equal(out.rpc.result.isError,true);
 }
});

test('reject hostile Origin and Host, GET, bad content-type and unsolicited notifications',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const evil=await rpc(c.endpoint,c.secret,'tools/list',{},1,{headers:{Origin:'https://evil.example'}});
 assert.equal(evil.status,403);
 const spoofedHost=await new Promise((resolve,reject)=>{
  const u=new URL(c.endpoint);
  const req=nodeRequest({hostname:'127.0.0.1',port:Number(u.port),path:'/mcp',method:'POST',headers:{Host:'evil.example',Authorization:`Bearer ${c.secret}`,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);req.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}));
 });
 assert.equal(spoofedHost,403);
 const get=await fetch(c.endpoint,{method:'GET',headers:{authorization:`Bearer ${c.secret}`}});
 assert.equal(get.status,405);
 const wrong=await fetch(c.endpoint,{method:'POST',headers:{authorization:`Bearer ${c.secret}`,'content-type':'text/plain'},body:'abc'});
 assert.equal(wrong.status,415);
 const obsolete=await rpc(c.endpoint,c.secret,'initialize',{});
 assert.equal(obsolete.status,404);
 assert.equal(obsolete.data.error.code,-32601);
});

test('reject overlarge JSON body and forged tool names',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const over=await fetch(c.endpoint,{method:'POST',headers:{authorization:`Bearer ${c.secret}`,'content-type':'application/json'},body:'x'.repeat(17000)});
 assert.equal(over.status,413);
 const unknown=await invoke(c,'system.shell',{command:'whoami'});
 assert.equal(unknown.rpc.result.isError,true);
});

test('actual local HTTP app status can be fetched without arbitrary host/URL in GPT input',async t=>{
 const service=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('local');});
 await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>service.close(resolve)));
 const port=service.address().port;
 const c=await setup({apps:{wizardmaker:createLoopbackHealthApp({label:'Wizardmaker dev',port})}});
 t.after(()=>c.live.close());
 const out=await invoke(c,'app.status',{app:'wizardmaker'});
 assert.equal(out.result.online,true);assert.equal(out.result.httpStatus,200);
 const ok=await invoke(c,'app.command',{app:'wizardmaker',command:'health.check',args:{}});
 assert.equal(ok.result.online,true);
 const invalid=await invoke(c,'app.command',{app:'wizardmaker',command:'health.check',args:{host:'169.254.169.254'}});
 assert.equal(invalid.rpc.result.isError,true);
});

test('the same locally approved write cannot execute twice under simultaneous requests',async t=>{
 const changes=[];const c=await setup({apps:makeApps(changes)});t.after(()=>c.live.close());
 const approval=c.proxy.issueApproval({app:'wizardmaker',command:'rename',args:{message:'only-once'}});
 const [a,b]=await Promise.all([invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'only-once'},approval:approval.token}),invoke(c,'app.command',{app:'wizardmaker',command:'rename',args:{message:'only-once'},approval:approval.token})]);
 assert.equal(changes.length,1);
 assert.equal([a,b].filter(x=>x.rpc.result.isError===true).length,1);
});

test('a timed-out approved app action has unknown outcome, cannot be retried with the same approval',async t=>{
 let actions=0;
 const c=await setup({apps:{wizardmaker:{label:'Wizardmaker',status:async()=>({online:true}),commands:{
  slow:{risk:'write',description:'Hanging test action',inputSchema:{type:'object',additionalProperties:false,required:[],properties:{}},run:async()=>{actions++;return new Promise(()=>{});}},
 }}},maxCommandMs:100});
 t.after(()=>c.live.close());
 const permit=c.proxy.issueApproval({app:'wizardmaker',command:'slow',args:{}});
 const first=await invoke(c,'app.command',{app:'wizardmaker',command:'slow',args:{},approval:permit.token});
 assert.equal(first.result.status,'APP_OUTCOME_UNKNOWN_DO_NOT_RETRY');
 assert.equal(first.rpc.result.isError,true);
 const retry=await invoke(c,'app.command',{app:'wizardmaker',command:'slow',args:{},approval:permit.token});
 assert.equal(retry.result.status,'LOCAL_APPROVAL_REQUIRED');
 assert.equal(actions,1);
});

test('application errors are sanitized and never leak stack traces or secrets',async t=>{
 const c=await setup({apps:{wizardmaker:{label:'Wizardmaker',status:async()=>{throw Error('secret status')},commands:{
  fail:{risk:'read',description:'Test failure',inputSchema:{type:'object',additionalProperties:false,required:[],properties:{}},run:async()=>{throw Error('private key: sk-abc999')}},
 }}}});t.after(()=>c.live.close());
 const a=await invoke(c,'app.status',{app:'wizardmaker'});
 assert.equal(a.result.status,'LOCAL_APP_UNAVAILABLE');
 const b=await invoke(c,'app.command',{app:'wizardmaker',command:'fail',args:{}});
 assert.equal(b.result.status,'APP_COMMAND_FAILED');
 assert.equal(JSON.stringify(b).includes('sk-abc999'),false);
});

test('configuration rejects unregistered app IDs, arbitrary app ports and invalid HTTP bearer token',async()=>{
 assert.throws(()=>createDevProxy({token:'too-short',apps:{}}),/CONFIG/);
 assert.throws(()=>createDevProxy({token:token(),apps:{'../../':{status:async()=>null,commands:{}}}}),/REGISTRATION/);
 for(const port of [-1,0,65536,'5186']) assert.throws(()=>createLoopbackHealthApp({port}),/PINNED/);
});

test('a stalled local app status query cannot hang the MCP proxy',async t=>{
 const c=await setup({maxCommandMs:100,apps:{wizardmaker:{label:'Wizardmaker',status:()=>new Promise(()=>{}),commands:{}}}});
 t.after(()=>c.live.close());
 const result=await invoke(c,'app.status',{app:'wizardmaker'});
 assert.equal(result.result.status,'LOCAL_APP_STATUS_TIMEOUT');
 assert.equal(result.rpc.result.isError,true);
});

test('2026-07-28 spec: header, method, name, metadata must agree before tool execution',async t=>{
 const changes=[];const c=await setup({apps:makeApps(changes)});t.after(()=>c.live.close());
 const valid=await rpc(c.endpoint,c.secret,'tools/call',{name:'app.list',arguments:{}});
 assert.equal(valid.status,200);
 const cases=[
  {headers:{'Mcp-Method':'tools/list'}},
  {headers:{'Mcp-Name':'app.command'}},
  {headers:{'MCP-Protocol-Version':'2025-11-25'}},
  {body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'app.list',arguments:{},_meta:{'io.modelcontextprotocol/protocolVersion':'2025-11-25','io.modelcontextprotocol/clientCapabilities':{}}}}},
 ];
 for(const extra of cases){
  const res=await rpc(c.endpoint,c.secret,'tools/call',{name:'app.list',arguments:{}},1,extra);
  assert.equal(res.status,400);
  assert.equal(res.data.error.code,-32020);
 }
 assert.equal(changes.length,0);
});

test('2026-07-28 spec: reject missing headers, missing _meta, unsupported version and obsolete ping',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const raw=(method,headers,params={})=>fetch(c.endpoint,{method:'POST',headers:{authorization:`Bearer ${c.secret}`,'content-type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),redirect:'manual'});
 const meta=clientMeta();
 let res=await raw('tools/list',{'Mcp-Method':'tools/list','MCP-Protocol-Version':protocol},{_meta:meta});
 assert.equal(res.status,200);
 res=await raw('tools/list',{'MCP-Protocol-Version':protocol},{_meta:meta});
 assert.equal(res.status,400);
 res=await raw('tools/list',{'Mcp-Method':'tools/list'},{_meta:meta});
 assert.equal(res.status,400);
 res=await raw('tools/list',{'MCP-Protocol-Version':protocol,'Mcp-Method':'tools/list'},{});
 assert.equal(res.status,400);
 res=await raw('tools/list',{'MCP-Protocol-Version':'2030-01-01','Mcp-Method':'tools/list'},{_meta:{...meta,'io.modelcontextprotocol/protocolVersion':'2030-01-01'}});
 assert.equal(res.status,400);
 const unsupported=await res.json();
 assert.equal(unsupported.error.code,-32000);
 assert.ok(unsupported.error.data.supported.includes(protocol));
 const ping=await rpc(c.endpoint,c.secret,'ping',{});
 assert.equal(ping.status,404);
});

test('2026-07-28 spec: standard result metadata, stateless requests, no legacy initialized handshake',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const listed=await rpc(c.endpoint,c.secret,'tools/list',{});
 assert.equal(listed.status,200);
 assert.equal(listed.data.result._meta['io.modelcontextprotocol/serverInfo'].name,'dev-tunnel-proxy-app-mcp');
 const observed=await rpc(c.endpoint,c.secret,'tools/call',{name:'app.status',arguments:{app:'wizardmaker'}});
 assert.equal(observed.status,200);
 assert.equal(observed.data.result._meta['io.modelcontextprotocol/serverInfo'].name,'dev-tunnel-proxy-app-mcp');
});


test('2026-07-28 spec: accepts encoded mirrored MCP tool name, rejects obsolete notification',async t=>{
 const c=await setup();t.after(()=>c.live.close());
 const encoded='=?base64?'+Buffer.from('app.list','utf8').toString('base64')+'?=';
 const ok=await rpc(c.endpoint,c.secret,'tools/call',{name:'app.list',arguments:{}},1,{headers:{'Mcp-Name':encoded}});
 assert.equal(ok.status,200);
 assert.equal(ok.data.result.isError,false);
 const response=await fetch(c.endpoint,{method:'POST',headers:{
  'content-type':'application/json',authorization:`Bearer ${c.secret}`,'MCP-Protocol-Version':protocol,'Mcp-Method':'notifications/initialized'
 },body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',params:{_meta:clientMeta()}})});
 assert.equal(response.status,404);
 const body=await response.json();
 assert.equal(body.error.code,-32601);
});
