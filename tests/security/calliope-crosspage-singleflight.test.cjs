'use strict';
/**
 * CTO V126 RED-first: Health and Reports use the shared Calliope controller,
 * not status.html's V124/V125 controller. No network, credentials or Mac ops.
 * Dynamic tests evaluate the actual shared handler code with fixtures.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const common=fs.readFileSync(path.join(root,'status/common.js'),'utf8');
const health=fs.readFileSync(path.join(root,'status/health.html'),'utf8');
const reports=fs.readFileSync(path.join(root,'status/reports.html'),'utf8');
function section(start,end) {
  const i=common.indexOf(start);assert.ok(i>=0,'missing: '+start);
  const j=common.indexOf(end,i+start.length);assert.ok(j>i,'missing end: '+end);
  return common.slice(i,j);
}
test('cross-page control: Health and Reports really invoke the common Calliope implementation',()=>{
  assert.match(health,/DTP\.attachCalliope\(\)/);
  assert.match(reports,/DTP\.attachCalliope\(\)/);
  assert.match(common,/function attachCalliope\(\)/);
});
test('cross-page UI no longer inserts an unsolicited extra assistant greeting',()=>{
  assert.doesNotMatch(common,/function ensureGreeting\(\)/);
});
test('cross-page Stop never claims server cancellation based on legacy cancel endpoint',()=>{
  const shared=section('function attachCalliope(){','function openCalliopeWithContext(){');
  assert.doesNotMatch(shared,/Operation stopped by user\./);
  assert.doesNotMatch(shared,/['"]\/devproxy\/api\/ai\/cancel['"]/);
});
test('cross-page Ask single-flight prevents duplicate request while earlier Ask is pending',async()=>{
  const code=section("const ask = drawer.querySelector('#aiAskBtn');","// Stop button functionality");
  const events=[],requests=[],history=[];
  const textarea={value:'First question',addEventListener(){}};
  const askBtn={disabled:false,textContent:'Ask',addEventListener(){}};
  const stopBtn={style:{display:'none'}};
  const chat={appendChild(){},scrollTop:0,scrollHeight:100};
  const drawer={querySelector(id){if(id==='#aiAskBtn')return askBtn;if(id==='#aiQuery')return textarea;return null}};
  const document={getElementById(id){return {'aiQuery':textarea,'aiAskBtn':askBtn,'aiStopBtn':stopBtn,'aiChat':chat}[id]},createElement(){return {className:'',innerHTML:'',remove(){},parentNode:chat}}};
  let resolve;
  const waiting=new Promise(r=>resolve=r);
  const fetch=(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return waiting};
  const loadChat=()=>history.slice(),saveChat=messages=>{history.splice(0,history.length,...messages)};
  const startProgressPolling=()=>events.push('started'),stopProgressPolling=()=>events.push('stopped');
  const fn=new Function('drawer','document','fetch','loadChat','saveChat','renderChat','startProgressPolling',
    'stopProgressPolling','setInterval','clearInterval',code+'\nreturn submitQuery;');
  const submit=fn(drawer,document,fetch,loadChat,saveChat,()=>{},startProgressPolling,
    stopProgressPolling,()=>1,()=>{});
  const first=submit();
  textarea.value='Second question while first pending';
  const second=submit();
  assert.equal(requests.length,1,'Second Ask dispatched while first Ask was still pending');
  resolve({ok:true,status:200,json:async()=>({ok:true,answer:'One answer'})});
  await Promise.all([first,second]);
  assert.equal(history.filter(x=>x.role==='assistant').length,1);
  assert.equal(history.filter(x=>x.role==='user').length,1);
});
test('cross-page Self-Check is one read-only HTTP observation, with one terminal bubble',async()=>{
  const code=section("const healBtn = drawer.querySelector('#aiHealBtn');","const redirectHealBtn = drawer.querySelector('#aiRedirectHealBtn');");
  let handler=null,requested=[],messages=[];
  const drawer={querySelector:()=>({addEventListener:(name,cb)=>{if(name==='click')handler=cb;}})};
  const loadChat=()=>messages.slice(),saveChat=m=>{messages=m.slice()};
  let resolve;const waiting=new Promise(r=>resolve=r);
  const fetch=(url,opts)=>{requested.push({url,opts});return waiting};
  new Function('drawer','loadChat','saveChat','renderChat','fetch',code)(
    drawer,loadChat,saveChat,()=>{},fetch);
  assert.equal(typeof handler,'function');
  const a=handler(),b=handler();
  assert.equal(requested.length,1,'Repeated Self-Check dispatched multiple requests');
  assert.equal(requested[0].url,'/devproxy/api/ai/self-check?http=1');
  assert.equal(JSON.parse(requested[0].opts.body).heal,false);
  resolve({ok:true,status:200,json:async()=>({
    ok:true,code:'SELF_CHECK_INVENTORY_AND_HTTP_OBSERVATION',
    httpScan:{code:'READONLY_HTTP_SCAN_EVIDENCE_ONLY',observed:2,httpGreen:1,httpNotGreen:1},
    healingPerformed:false
  })});
  await Promise.all([a,b]);
  assert.equal(messages.filter(m=>m.role==='assistant').length,1,
    'Self-Check appended a preface or more than one terminal bubble');
  assert.match(messages[0].content,/no repairs|no repair|not performed/i);
});
test('cross-page reviewed redirect repair remains explicit and separate',()=>{
  assert.match(common,/apply-reviewed-nextjs-redirect/);
  assert.match(common,/Owner declined apply/);
  assert.match(common,/reviewTicket/);
});
