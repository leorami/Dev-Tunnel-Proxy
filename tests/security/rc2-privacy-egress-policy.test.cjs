'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {classifySecureManagementOperation}=require('../../utils/rc2-management-safety-policy.cjs');
const base='/devproxy/api';
const protectedRoutes=['ai/reindex','ai/thoughts/inject'];
const secureModes=[
 ['hmac-spool',{spoolDirectory:'/private/spool',nodeEnv:'development',denyFlag:'0',allowFlag:'1'}],
 ['production',{nodeEnv:'production',denyFlag:'0',allowFlag:'1'}],
 ['explicit-deny',{nodeEnv:'development',denyFlag:'1',allowFlag:'1'}],
];
for(const [mode,flags] of secureModes){
 for(const route of protectedRoutes){
  test('RED: '+mode+' rejects POST '+route+' even with legacy opt-in',()=>{
   const r=classifySecureManagementOperation({method:'POST',pathname:base+'/'+route,base,...flags});
   assert.equal(r.blocked,true);
   assert.equal(r.productionChangeAuthorized,false);
   assert.equal(r.deployed,false);
  });
 }
}
for(const route of protectedRoutes){
 test('developer-only route '+route+' retains legacy behavior without secure mode',()=>{
  const r=classifySecureManagementOperation({method:'POST',pathname:base+'/'+route,base,nodeEnv:'development'});
  assert.equal(r.blocked,false);
  assert.equal(r.productionChangeAuthorized,false);
 });
}
test('no regression in existing transaction and read-only app management',()=>{
 for(const [method,suffix] of [['POST','apps/install'],['POST','apps/create-route'],
  ['POST','apps/regenerate'],['POST','overrides/promote'],['GET','ai/stats'],
  ['GET','apps/list'],['GET','ai/health']]){
  const r=classifySecureManagementOperation({method,pathname:base+'/'+suffix,base,nodeEnv:'production'});
  assert.equal(r.blocked,false,method+' '+suffix);
 }
});
test('untrusted encoded path cannot smuggle a mutating route',()=>{
 for(const bad of ['/ai/%72eindex','/ai//reindex','/ai/../ai/reindex','/ai/reindex\\x']){
  const r=classifySecureManagementOperation({method:'POST',pathname:base+bad,base,nodeEnv:'production'});
  assert.equal(r.blocked,true,bad);
 }
});
