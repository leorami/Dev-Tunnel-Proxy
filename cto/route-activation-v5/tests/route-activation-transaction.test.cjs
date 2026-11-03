'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createRouteMutationTransaction} = require('../utils/route-activation-transaction.cjs');
const mutex={acquire:async()=>({release:async()=>{}})};

function harness(options = {}) {
  const files = new Map([['app','original-route'], ['bundle','original-bundle']]);
  const actions=[];
  let oneShotWriteFailure=false;
  const io = {
    async read(kind) { actions.push('read:'+kind); return files.has(kind) ? files.get(kind) : null; },
    async write(kind, bytes) { actions.push('write:'+kind); if(options.failWrite===kind && !oneShotWriteFailure){oneShotWriteFailure=true; throw Error('synthetic failure');} files.set(kind,bytes); },
    async remove(kind) { actions.push('remove:'+kind); files.delete(kind); },
    async generateBundle() { actions.push('generate'); if(options.failGenerate) throw Error('synthetic failure'); files.set('bundle','new-bundle'); }
  };
  const activation = options.noActivation ? null : {
    async validate() {actions.push('validate'); return options.failValidate?false:true;},
    async reload() {actions.push('reload'); return options.failReload?false:true;},
    async verifyRoute() {actions.push('verify'); return options.failVerify?false:true;}
  };
  const controller=createRouteMutationTransaction({io,activation,mutex});
  return {files,actions,controller};
}

test('RED: refuses absent scoped activation interface before touching state',async()=>{
  const h=harness({noActivation:true});
  const r=await h.controller.apply({name:'synthetic',content:'location /synthetic { return 200; }'});
  assert.equal(r.status,'BLOCKED_NO_SCOPED_ACTIVATION');
  assert.deepEqual(h.actions,[]);
  assert.equal(h.files.get('app'),'original-route');
});
test('RED: unsafe names and empty route content rejected without reads or writes',async()=>{
  const h=harness();
  for(const name of ['../secrets','.env','a/b','x;id','']){
    const r=await h.controller.apply({name,content:'safe'});
    assert.equal(r.status,'BLOCKED_INVALID_INPUT');
  }
  assert.equal((await h.controller.apply({name:'valid',content:''})).status,'BLOCKED_INVALID_INPUT');
  assert.deepEqual(h.actions,[]);
});
test('RED: successful synthetic activation validates, reloads, verifies, and reports nonauthorization',async()=>{
  const h=harness();
  const r=await h.controller.apply({name:'synthetic',content:'new-route'});
  assert.equal(r.status,'ACTIVATION_VERIFIED_BY_CALLER');
  assert.equal(r.productionChangeAuthorized,false);
  assert.equal(r.liveAttested,false);
  assert.deepEqual(h.actions,['read:app','read:bundle','write:app','generate','validate','reload','verify']);
  assert.equal(h.files.get('app'),'new-route');
  assert.equal(h.files.get('bundle'),'new-bundle');
});
for(const [flag,at,expected] of [
 ['failGenerate','generate','ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION'],
 ['failValidate','validate','ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION'],
 ['failReload','reload','ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION'],
 ['failVerify','verify','ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION'],
 ['failWrite','write:app','ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION']
]) test('RED: failure at '+at+' restores previous files without claiming active config rollback',async()=>{
 const h=harness(flag==='failWrite'?{failWrite:'app'}:{[flag]:true});
 const r=await h.controller.apply({name:'synthetic',content:'new-route'});
 assert.equal(r.status,expected);
 assert.equal(h.files.get('app'),'original-route');
 assert.equal(h.files.get('bundle'),'original-bundle');
 assert.equal(r.liveAttested,false);
});
test('RED: incomplete actor cannot result in writes',async()=>{
 const h=harness();
 const x=createRouteMutationTransaction({mutex,io:{},activation:{validate:()=>true,reload:()=>true}});
 assert.equal((await x.apply({name:'valid',content:'content'})).status,'BLOCKED_NO_SCOPED_ACTIVATION');
});
test('RED: controller serializes concurrent requests',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const h=harness();
 const realRead=h.controller; // use a separate controller with delayed read
 const files=h.files;
 const io={read:async k=>{await gate;return files.get(k)||null},write:async(k,v)=>files.set(k,v),remove:async k=>files.delete(k),generateBundle:async()=>files.set('bundle','new')};
 const activation={validate:async()=>true,reload:async()=>true,verifyRoute:async()=>true};
 const t=createRouteMutationTransaction({io,activation,mutex});
 const p1=t.apply({name:'a',content:'new'});
 const p2=await t.apply({name:'b',content:'second'});
 assert.equal(p2.status,'BLOCKED_TRANSACTION_BUSY');
 release();
 assert.equal((await p1).status,'ACTIVATION_VERIFIED_BY_CALLER');
});
test('RED: rollback write failure reports unreconciled disk state, never success',async()=>{
 const h=harness();
 let fail=false;
 const io={read:async k=>h.files.get(k)||null,write:async(k,v)=>{if(fail)throw Error('fail');h.files.set(k,v)},remove:async k=>h.files.delete(k),generateBundle:async()=>{h.files.set('bundle','new-bundle');fail=true;}};
 const t=createRouteMutationTransaction({mutex,io,activation:{validate:async()=>false,reload:async()=>true,verifyRoute:async()=>true}});
 const r=await t.apply({name:'synthetic',content:'new-route'});
 assert.equal(r.status,'ROLLBACK_FAILED_REQUIRES_OPERATOR_INTERVENTION');
 assert.equal(r.productionChangeAuthorized,false);
});
test('adversarial: failed validation with previously absent app removes only new route',async()=>{
 const h=harness({failValidate:true});
 h.files.delete('app');
 const r=await h.controller.apply({name:'new_route',content:'new-route'});
 assert.equal(r.status,'ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION');
 assert.equal(h.files.has('app'),false);
 assert.equal(h.files.get('bundle'),'original-bundle');
 assert.equal(h.actions.includes('reload'),false);
});
test('adversarial: oversized UTF-8 route content rejected without touching state',async()=>{
 const h=harness();
 const r=await h.controller.apply({name:'valid-name',content:'😀'.repeat(32769)});
 assert.equal(r.status,'BLOCKED_INVALID_INPUT');
 assert.deepEqual(h.actions,[]);
});
test('adversarial: preimage read failure is not misreported as restored',async()=>{
 let touched=0;
 const t=createRouteMutationTransaction({
   mutex,io:{read:async()=>{throw Error('unreadable')},write:async()=>{touched++},remove:async()=>{touched++},generateBundle:async()=>{touched++}},
   activation:{validate:async()=>true,reload:async()=>true,verifyRoute:async()=>true}
 });
 const r=await t.apply({name:'valid',content:'new'});
 assert.equal(r.status,'BLOCKED_PREIMAGE_READ_FAILED');
 assert.equal(touched,0);
});
test('adversarial: no reload happens after invalid candidate or generation failure',async()=>{
 for(const o of [{failValidate:true},{failGenerate:true}]){
  const h=harness(o);
  await h.controller.apply({name:'valid',content:'new'});
  assert.equal(h.actions.includes('reload'),false);
 }
});
test('adversarial: callback alone cannot authorize or independently attest live state',async()=>{
 const h=harness();
 const r=await h.controller.apply({name:'valid',content:'new'});
 assert.deepEqual(Object.keys(r).sort(),['liveAttested','productionChangeAuthorized','status']);
 assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.liveAttested,false);
});
