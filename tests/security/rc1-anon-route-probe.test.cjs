'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { _test:{classifyAnonymousRouteResponse} }=require('../../utils/rc1-release-drift-attest.cjs');
test('anonymous 200 routes must be treated as exposed without inspecting response content',()=>{
 const response={status:200,location:''};
 Object.defineProperty(response,'body',{get(){throw Error('SECRET_RESPONSE_MUST_NOT_BE_READ');}});
 assert.equal(classifyAnonymousRouteResponse(response),'open');
});
test('only authenticated-looking status or same-origin login redirect denies anonymous access',()=>{
 for(const status of [401,403])assert.equal(classifyAnonymousRouteResponse({status,location:''}),'denied');
 for(const location of ['/admin/login','/admin/login?redirect=%2Froutes.json'])
   assert.equal(classifyAnonymousRouteResponse({status:302,location}),'denied',location);
});
test('arbitrary redirects are NOT false-green authentication proof',()=>{
 for(const location of ['', '/health','https://example.invalid/login','//another.invalid/admin/login'])
   assert.equal(classifyAnonymousRouteResponse({status:302,location}),'unknown',location);
});
test('unreachable, malformed, or unexpected statuses are unknown rather than secure',()=>{
 for(const status of [0,200.3,404,500,503])
   assert.equal(classifyAnonymousRouteResponse({status,location:''}),'unknown',String(status));
 assert.equal(classifyAnonymousRouteResponse(null),'unknown');
});
