'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {classifySecureManagementOperation} = require('../../utils/rc2-management-safety-policy.cjs');
const {shouldBlockInlineDocker} = require('../../utils/rc2-inline-docker-policy.cjs');

const base='/devproxy/api';
const classify=(method,route,spool='/private/spool',override={})=>classifySecureManagementOperation({method,pathname:base+route,base,spoolDirectory:spool,...override});

test('RED: secure spool blocks inline Docker even with legacy optout zero',()=>{
  assert.equal(shouldBlockInlineDocker({spoolDirectory:'/private/spool',denyFlag:'0'}),true);
  assert.equal(shouldBlockInlineDocker({spoolDirectory:'/private/spool',denyFlag:'1'}),true);
  assert.equal(shouldBlockInlineDocker({spoolDirectory:'/private/spool',denyFlag:undefined}),true);
});
test('secure mode cannot be disabled by empty-but-present spool variable',()=>{
  assert.equal(shouldBlockInlineDocker({spoolDirectory:'',denyFlag:'0'}),true);
  assert.equal(shouldBlockInlineDocker({spoolDirectory:null,denyFlag:'0'}),true);
});
test('explicit deny still blocks without configured spool',()=>{
  assert.equal(shouldBlockInlineDocker({denyFlag:'1'}),true);
  assert.equal(shouldBlockInlineDocker({denyFlag:'0'}),false);
  assert.equal(shouldBlockInlineDocker({denyFlag:undefined}),false);
});
test('unknown feature flags and non-string options fail closed',()=>{
  assert.equal(shouldBlockInlineDocker({denyFlag:'potato'}),true);
  assert.equal(shouldBlockInlineDocker({denyFlag:1}),true);
  assert.equal(shouldBlockInlineDocker({spoolDirectory:{},denyFlag:'0'}),true);
  assert.equal(shouldBlockInlineDocker({spoolDirectory:'/private/spool',denyFlag:false}),true);
});

test('RED: legacy root-level Docker restart route denied in secure mode',()=>{
  const r=classify('POST','/ai/restart-containers');
  assert.equal(r.blocked,true);assert.equal(r.code,'LEGACY_UNSETTLED_MANAGEMENT_BLOCKED');
  assert.equal(r.productionChangeAuthorized,false);
});
for(const route of [
 '/ai/ask','/ai/audit-and-heal','/ai/self-check','/ai/advanced-heal',
 '/ai/fix-react-bundle','/ai/fix-storybook-vite','/ai/fix-mxtk-api',
 '/ai/snapshot-analyze','/ai/code-review-container','/ai/code-review',
 '/ai/review-code','/ai/inspect-container','/ai/audit',
 '/ai/reindex','/ai/thoughts/inject',
 '/apps/scan'
]) test(`deny legacy privileged or untransactional POST ${route} in spool mode`,()=>{
  const r=classify('POST',route);
  assert.equal(r.blocked,true);assert.equal(r.productionChangeAuthorized,false);
});
for(const route of ['/apps/install','/apps/create-route'])
 test(`retain transactional POST ${route} in spool mode`,()=>{
  const r=classify('POST',route);
  assert.equal(r.blocked,false);assert.equal(r.productionChangeAuthorized,false);
 });
test('deny inspect-container GET which also invokes privileged helper',()=>{
  assert.equal(classify('GET','/ai/inspect-container').blocked,true);
  assert.equal(classify('GET','/ai/code-review-container').blocked,true);
});
for(const [method,route] of [
 ['GET','/ai/health'],['GET','/apps/list'],['GET','/apps/active'],
 ['GET','/ai/chat-history'],['GET','/ai/stats'],['GET','/reports/list'],
 ['POST','/apps/regenerate'],['POST','/overrides/promote'],
 ['POST','/config/example.conf'],['POST','/promotions'],
 ['POST','/settings/auto-scan'],['GET','/ai/thoughts'],
 ['POST','/ai/cancel'],['GET','/config/example.conf']
]) test(`retain ${method} ${route} if settled or nonprivileged`,()=>{
  assert.equal(classify(method,route).blocked,false);
});
test('deny strictly by method and exact path, no substring shadowing',()=>{
  assert.equal(classify('POST','/ai/ask-something').blocked,false);
  assert.equal(classify('POST','/ai/restart-containers-audit').blocked,false);
  assert.equal(classify('GET','/ai/restart-containers').blocked,false);
  assert.equal(classify('POST','/apps/regenerate').blocked,false);
});
test('secure mode disabled still does not claim deployment authority',()=>{
  const r=classify('POST','/ai/ask',undefined,{spoolDirectory:undefined});
  assert.equal(r.blocked,false);assert.equal(r.productionChangeAuthorized,false);
});
test('bad route options are fail-closed and never disclose private paths',()=>{
  const r=classifySecureManagementOperation({method:'POST',pathname:{a:1},base,spoolDirectory:'/private/owner/spool'});
  assert.equal(r.blocked,true);
  assert.equal(JSON.stringify(r).includes('/private'),false);
});
test('untrusted accessors cannot execute from policy arguments',()=>{
  const o={method:'POST',pathname:base+'/ai/ask',base,spoolDirectory:'/private/spool'};
  Object.defineProperty(o,'method',{get(){throw Error('bad');},enumerable:true});
  assert.equal(classifySecureManagementOperation(o).blocked,true);
});
test('supported custom API prefix cannot bypass guard',()=>{
  assert.equal(classifySecureManagementOperation({method:'POST',pathname:'/p0/ai/ask',base:'/p0',spoolDirectory:'/private/spool'}).blocked,true);
});

for(const flags of [
 {spoolDirectory:'/private/spool',allowFlag:'1',denyFlag:'0',nodeEnv:'development'},
 {spoolDirectory:'/private/spool',allowFlag:'1',denyFlag:'0',nodeEnv:'production'},
 {spoolDirectory:undefined,allowFlag:'1',denyFlag:'0',nodeEnv:'production',dockerSocketPresent:true},
 {spoolDirectory:undefined,allowFlag:'1',denyFlag:'0',nodeEnv:'production',dockerSocketPresent:false},
 {spoolDirectory:undefined,allowFlag:'1',denyFlag:'1',nodeEnv:'development'}
])test('RED: production or spool mode is not opt-out via env '+JSON.stringify(flags),()=>{
 assert.equal(shouldBlockInlineDocker(flags),true);
});
test('production /ai/ask is blocked even when spool variable is mistakenly absent',()=>{
 assert.equal(classifySecureManagementOperation({method:'POST',pathname:base+'/ai/ask',base,nodeEnv:'production',spoolDirectory:undefined}).blocked,true);
});
test('production /ai/restart-containers is blocked under allow-flag attack',()=>{
 assert.equal(classifySecureManagementOperation({method:'POST',pathname:base+'/ai/restart-containers',base,nodeEnv:'production',allowFlag:'1',spoolDirectory:undefined}).blocked,true);
});
test('RED: unrelated read-only health remains usable in production even with hardening flags',()=>{
 const result=classifySecureManagementOperation({method:'GET',pathname:base+'/ai/health',base,
  spoolDirectory:undefined,nodeEnv:'production',allowFlag:'0'});
 assert.equal(result.blocked,false);
});
test('RED: developer fixture can choose inline Docker only when not production nor spool',()=>{
 assert.equal(shouldBlockInlineDocker({spoolDirectory:undefined,denyFlag:'0',allowFlag:'1',nodeEnv:'development'}),false);
});
test('RED: production read-only route inventory remains usable',()=>{
 const result=classifySecureManagementOperation({method:'GET',pathname:base+'/apps/list',base,nodeEnv:'production'});
 assert.equal(result.blocked,false);
});
