'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createScopedNginxReloadMediator}=require('../utils/scoped-nginx-reload-mediator.cjs');
function f(o={}) {
 const commands=[];
 const auth=async()=>o.allow===true;
 const run=async(exe,args)=>{commands.push([exe,...args]);return o.failAt===commands.length?1:0;};
 const verify=async()=>o.active!==false;
 const mediator=createScopedNginxReloadMediator({authorize:auth,run,verify});
 return {commands,mediator};
}
const req=id=>({type:'VALIDATE_AND_RELOAD_FIXED_DEV_PROXY',requestId:id});
test('RED: deny mutation when owner-approved host authority absent',async()=>{
 const {commands,mediator}=f();
 const r=await mediator.run(req('aaaa1111'));
 assert.equal(r.status,'BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
 assert.equal(commands.length,0);
});
test('RED: reject arbitrary service, argv, and unexpected properties',async()=>{
 const {commands,mediator}=f({allow:true});
 for(const x of [{type:'ARBITRARY_DOCKER',requestId:'aaaa1111'},
 {type:'VALIDATE_AND_RELOAD_FIXED_DEV_PROXY',requestId:'aaaa1111',service:'other'},
 {type:'VALIDATE_AND_RELOAD_FIXED_DEV_PROXY',requestId:'aaaa1111',args:['-c','malicious']},
 {type:'VALIDATE_AND_RELOAD_FIXED_DEV_PROXY',requestId:'bad/injection'}]) {
  assert.equal((await mediator.run(x)).status,'BLOCKED_INVALID_REQUEST');
 }
 assert.equal(commands.length,0);
});
test('RED: exactly two allowlisted argument-vector calls and private active route proof',async()=>{
 const {commands,mediator}=f({allow:true});
 const r=await mediator.run(req('aaaa1111'));
 assert.equal(r.status,'HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY');
 assert.deepEqual(commands,[
  ['docker','exec','dev-proxy','nginx','-t'],
  ['docker','exec','dev-proxy','nginx','-s','reload']
 ]);
 assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.liveAttested,false);
});
test('RED: validation failure must never reload',async()=>{
 const {commands,mediator}=f({allow:true,failAt:1});
 assert.equal((await mediator.run(req('aaaa1111'))).status,'NGINX_VALIDATION_FAILED');
 assert.equal(commands.length,1);
});
test('RED: reload failure cannot look like success',async()=>{
 const {commands,mediator}=f({allow:true,failAt:2});
 assert.equal((await mediator.run(req('aaaa1111'))).status,'NGINX_RELOAD_FAILED');
 assert.equal(commands.length,2);
});
test('RED: route activation proof failure must not report success',async()=>{
 const {mediator}=f({allow:true,active:false});
 assert.equal((await mediator.run(req('aaaa1111'))).status,'ROUTE_NOT_VERIFIED');
});
test('RED: repeated requestId cannot trigger another reload',async()=>{
 const {commands,mediator}=f({allow:true});
 assert.equal((await mediator.run(req('aaaa1111'))).status,'HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY');
 assert.equal((await mediator.run(req('aaaa1111'))).status,'BLOCKED_REPLAY');
 assert.equal(commands.length,2);
});
test('RED: missing callbacks never fall back to direct Docker operations',async()=>{
 const m=createScopedNginxReloadMediator({authorize:()=>true});
 assert.equal((await m.run(req('aaaa1111'))).status,'BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
});
