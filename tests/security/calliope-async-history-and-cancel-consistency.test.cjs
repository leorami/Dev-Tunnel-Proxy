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
  const handlerSource = sourceBetween(
    '// Allow user to stop current work by clicking the status chip',
    '// Wire global diagnose button'
  );
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
