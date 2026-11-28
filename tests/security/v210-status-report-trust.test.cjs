'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../../status/status.html'),'utf8');
function region(start,end) {
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'missing report source region');
  return html.slice(a,b);
}
function parse(input) {
  const ctx={input};
  vm.createContext(ctx);
  vm.runInContext(region('function parseConflictWarnings(warnings)', 'async function resolveConflict(route)')+'\nresult=parseConflictWarnings(input);',ctx);
  return JSON.parse(JSON.stringify(ctx.result));
}
test('legacy report parser handles both actual producer grammars, qualified identities and every participant',()=>{
  const result=parse([
    'Route /api/: NEW CONFLICT - apps/one.conf wins (first config) over apps/two.conf, overrides/three.conf',
    'Route /app/: Using persisted resolution - overrides/one.conf wins (conflicts with apps/one.conf, apps/four.conf)'
  ]);
  assert.deepEqual(result.map(({route,winner,configs})=>({route,winner,configs})),[
    {route:'/api/',winner:'apps/one.conf',configs:['apps/one.conf','apps/two.conf','overrides/three.conf']},
    {route:'/app/',winner:'overrides/one.conf',configs:['overrides/one.conf','apps/one.conf','apps/four.conf']}
  ]);
});
test('malformed, non-string, unsafe or ambiguous evidence cannot become a conflict selection',()=>{
  for(const value of [null,{},'warning']) assert.deepEqual(parse(value),[]);
  assert.deepEqual(parse([
    null,{},'Route /x/: NEW CONFLICT - apps/one.conf wins (first config) over ../bad.conf',
    'Route /x/: NEW CONFLICT - apps/one.conf wins (first config) over apps/<bad>.conf',
    'Route /x/: NEW CONFLICT - apps/one.conf wins (first config) over apps/one.conf',
    'Route /../x/: NEW CONFLICT - apps/one.conf wins (first config) over apps/two.conf',
    'Route /x/: unknown - apps/one.conf wins over apps/two.conf'
  ]),[]);
  assert.deepEqual(parse([
    'Route /same/: NEW CONFLICT - apps/one.conf wins (first config) over apps/two.conf',
    'Route /same/: Using persisted resolution - apps/two.conf wins (conflicts with apps/one.conf)'
  ]),[]);
});
test('report rendering is observational and never interpolates report data into executable markup or route mutation actions',()=>{
  const render=region('function showConflictManagement(routes)', 'function parseConflictWarnings(warnings)');
  assert.doesNotMatch(render,/innerHTML|insertAdjacentHTML|onclick\s*=\s*["'\x60]|resolveConflict\(|renameRoute\(|autoFixConflict\(|viewConfig\(/);
  assert.match(render,/textContent/);
  assert.match(render,/not live routing/i);
  assert.match(render,/details unavailable|could not decode/i);
  assert.doesNotMatch(render,/conflicts\.map\(/,'do not auto-send report-controlled strings as an AI prompt');
});
test('overview explicitly distinguishes last scan observations from live status and fetches report without cached reuse',()=>{
  assert.match(html,/appendLabeledSummaryChip\('Last scan',/);
  assert.match(html,/Last scan only; not live health/);
  const loader=region('async function loadJSON(url)', 'let routesData');
  assert.match(loader,/cache:\s*['"]no-store['"]/);
});
test('reachable diagnose modal does not place report-controlled values into HTML markup',()=>{
  const fn=region('function openDiagnoseModal(routeKey, targets, routes){','function openRecommendModal');
  assert.doesNotMatch(fn,/innerHTML\s*=\s*`/);
  assert.doesNotMatch(fn,/issues\.map\(i=>`<li>/);
  assert.match(fn,/textContent/);
});
test('report re-read does not claim a new scan or name the legacy scanner',()=>{
  const fn=region('async function reloadConfigs()','function viewSourceJson');
  assert.doesNotMatch(fn,/scanApps|Reloaded!|smart-build\.sh/);
  assert.match(fn,/cache:\s*['"]no-store['"]/);
  assert.match(fn,/Report re-read/);
  assert.match(fn,/does not start a new scan/);
  const button=html.slice(html.indexOf('id="reloadConfigs"'), html.indexOf('id="reloadConfigs"')+240);
  assert.doesNotMatch(button,/rescan/);
  assert.match(button,/last scan report/i);
});
test('historical server errors stay observations from that scan',()=>{
  const fn=region('function addStatusChips(container, route, targets, routes){','function severityOf');
  assert.doesNotMatch(fn,/upstream service issue/);
  assert.match(fn,/Last scan only:/);
  assert.match(fn,/Reported server error on that scan/);
  assert.match(fn,/No response recorded on that scan/);
});
