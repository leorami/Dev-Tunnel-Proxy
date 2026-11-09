'use strict';
/**
 * Independent V124 RED-first contract: reproduce real chat messages returning
 * after "Clear view", and false "I've stopped" claims from an idle Cancel.
 * Purely local Node VM simulation of the exact checked-in status-page handlers.
 * No owner app, bridge, Docker, private route, source mutation or network.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../status/status.html'), 'utf8');
function sourceBetween(begin, end) {
  const start = html.indexOf(begin);
  assert.notEqual(start, -1, 'source handler missing: ' + begin);
  const stop = html.indexOf(end, start + begin.length);
  assert.ok(stop > start, 'source terminator missing: ' + end);
  return html.slice(start, stop);
}

test('history response arriving after Clear view must not resurrect old bubbles', async () => {
  const handlers = sourceBetween('function clearChat(){', '// Wire the drawer Self');
  const displayed = [];
  const chatEl = {replaceChildren: () => displayed.splice(0)};
  const queryEl = {value: '', focus() {}};
  const askBtn = {disabled: false, textContent: 'Ask'};
  const badge = {classList: {add() {}, remove() {}}};
  const label = {textContent: 'Local-only'};
  const document = {getElementById: id => id === 'aiHealingStatus' ? badge : label};
  const window = {DTP: {config: {apiPath: v => '/api/' + v}}};
  let resume;
  const fetch = () => new Promise(resolve => {resume = resolve;});
  const create = new Function('fetch', 'window', 'appendBubble', 'chatEl', 'queryEl', 'askBtn', 'document',
    'let nextAskSeq=0,activeAskSeq=0,activeAskAbort=null,chatEpoch=0;\n' +
    handlers + '\nreturn {loadChatHistory,clearChat};');
  const view = create(fetch, window, (role, message) => displayed.push({role,message}),
    chatEl, queryEl, askBtn, document);
  const pending = view.loadChatHistory();
  view.clearChat();
  resume({ok:true,json:async () => ({messages:[{role:'assistant',content:'stale restored bubble'}]})});
  await pending;
  assert.deepEqual(displayed, [], 'A late persisted-history fetch reappeared after the user cleared the view');
});

test('idle status chip cannot claim it stopped work merely because cancel endpoint answered HTTP 200', async () => {
  const cancelSectionStart = html.includes('// The secure status chip is informational, not a Cancel control.')
    ? '// The secure status chip is informational, not a Cancel control.'
    : '// Allow user to stop current work by clicking the status chip';
  const handlerSource = sourceBetween(cancelSectionStart, '// Wire global diagnose button');
  const displayed = [];
  let clickHandler = null;
  const statusChip = {addEventListener: (event, fn) => {
    if (event === 'click') clickHandler = fn;
  }};
  const document = {getElementById: () => statusChip};
  const window = {DTP: {config: {apiPath: v => '/api/' + v}}};
  const fetch = async () => ({ok: true,status:200,json:async () => ({ok:true,message:'Cancellation requested'})});
  const attach = new Function('document', 'window', 'fetch', 'appendBubble',
    'let activeAskSeq=0,selfCheckInFlight=false,diagnosisInFlight=false;\n' + handlerSource);
  attach(document, window, fetch, (role, message) => displayed.push({role, message}));
  if (clickHandler) await clickHandler();
  assert.equal(displayed.some(row => /(?:I've stopped|stopped and|pause now)/i.test(row.message)), false,
    'Cancel endpoint acknowledgement is not proof that any local Ask, Self-Check or Diagnose was stopped');
});


test('a different route must not be dropped while another route is being observed', async () => {
  const handlerSource = sourceBetween('// Only session-gated fixed-host HEAD observations, never audit-and-heal.', '// Expose for inline handlers');
  const calls = [];
  let resolveFirst;
  const first = new Promise(resolve => {resolveFirst=resolve;});
  const good = {ok:true,status:200,json:async()=>({
    ok:true,code:'LOCAL_HTTP_OK',summary:{status:200}
  })};
  const fetch = (url,opts) => {
    const route = JSON.parse(opts.body).url;
    calls.push(route);
    return route === '/oauth' ? first : Promise.resolve(good);
  };
  const badge = {classList:{add(){},remove(){}}};
  const document = {getElementById:id=>id==='aiHealingStatus'?badge:{textContent:''}};
  const window = {DTP:{config:{apiPath:p=>'/api/'+p}}};
  const make = new Function('fetch','window','document','appendBubble','appendThinking','ensureAiOpen',
    'let chatEpoch=0,chatEngaged=false;\n' + handlerSource + '\nreturn runCalliopeHealth;');
  const diagnose=make(fetch,window,document,()=>{},()=>({remove(){}}),()=>{});
  const one=diagnose('/oauth');
  const two=diagnose('/tigerslam');
  const observed=calls.slice();
  resolveFirst(good);
  await Promise.all([one,two]);
  assert.deepEqual(observed,['/oauth','/tigerslam'],
    'Global diagnosisInFlight silently discarded a distinct second route');
});

test('initial history fetch cannot append old bubbles after a new user interaction', async () => {
  const handlers=sourceBetween('function clearChat(){','// Wire the drawer Self');
  const displayed=[];
  let resume;
  const fetch=()=>new Promise(resolve=>{resume=resolve;});
  const window={DTP:{config:{apiPath:k=>'/api/'+k}}};
  const chatEl={replaceChildren:()=>displayed.splice(0)};
  const queryEl={value:'',focus(){}};
  const askBtn={disabled:false,textContent:'Ask'};
  const badge={classList:{remove(){},add(){}}};
  const document={getElementById:k=>k==='aiHealingStatus'?badge:{textContent:''}};
  const create=new Function('fetch','window','appendBubble','chatEl','queryEl','askBtn','document',
    'let nextAskSeq=0,activeAskSeq=0,activeAskAbort=null,chatEpoch=0,chatEngaged=false;\n'+handlers+
    '\nreturn {loadChatHistory,onUser:()=>{chatEngaged=true;}};');
  const view=create(fetch,window,(role,message)=>displayed.push({role,message}),
    chatEl,queryEl,askBtn,document);
  const history=view.loadChatHistory();
  view.onUser(); // user starts typing/asking before the old history response
  resume({ok:true,json:async()=>({messages:[{role:'assistant',content:'late history'}]})});
  await history;
  assert.deepEqual(displayed,[],
    'A late initial history response appended an unrelated old bubble after a new user interaction');
});
