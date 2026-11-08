'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {inspectNotificationBridgePolicyReadOnly}=require('../../utils/notification-bridge-readonly-policy-probe.cjs');
function fake(values){const calls=[];return {calls,request:async input=>{
 calls.push(input);const v=values[calls.length-1];if(typeof v==='string'){const e=Error(v);e.code=v;throw e;}
 return {statusCode:v};}};}
test('RED: patched bridge denies unpaired local, hostile origin, forged Host; read only',async()=>{
 const f=fake([200,401,403,403]);const r=await inspectNotificationBridgePolicyReadOnly({request:f.request});
 assert.equal(r.code,'BRIDGE_POLICY_OBSERVED_SOURCE_UNVERIFIED');
 assert.equal(f.calls.length,4);
 for(const c of f.calls){assert.equal(c.method,undefined);assert.ok(['/health','/service/status'].includes(c.path));
  assert.equal('token' in c,false);assert.equal('body' in c,false);assert.equal('authorization' in c,false);}
 assert.equal(f.calls[2].origin,'https://untrusted-bridge-check.invalid');
 assert.equal(f.calls[3].hostHeader,'untrusted-bridge-check.invalid');
 for(const flag of ['privilegedActionAttempted','credentialsUsed','liveProcessSourceVerified','productionChangeAuthorized'])
  assert.equal(r[flag],false);
 assert.equal(Object.isFrozen(r),true);
});
test('RED: an old unauthenticated status 200 is a P0 live risk',async()=>{
 for(const codes of [[200,200,200,200],[200,200,403,403],[200,401,200,403]]){
  assert.equal((await inspectNotificationBridgePolicyReadOnly({request:fake(codes).request})).code,
   'BRIDGE_POTENTIAL_UNAUTHENTICATED_CONTROL');
 }
});
test('RED: no active listener is not a permission to install or start one',async()=>{
 const r=await inspectNotificationBridgePolicyReadOnly({request:fake(Array(4).fill('ECONNREFUSED')).request});
 assert.equal(r.code,'BRIDGE_NOT_RUNNING');assert.equal(r.productionChangeAuthorized,false);
});
test('RED: malformed responses, 5xx, partial outages, and timeouts are unverified',async()=>{
 for(const codes of [[200,503,403,403],[200,401,403,500],[200,401,403,'ETIMEDOUT'],[200,401,403,99]]){
  assert.equal((await inspectNotificationBridgePolicyReadOnly({request:fake(codes).request})).code,
   'BRIDGE_POLICY_UNVERIFIED');
 }
 assert.equal((await inspectNotificationBridgePolicyReadOnly({request:null})).code,'BRIDGE_POLICY_UNVERIFIED');
});
test('RED: source never contains unsafe HTTP methods or sensitive logs',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../../utils/notification-bridge-readonly-policy-probe.cjs'),'utf8');
 assert.match(src,/method:'GET'/);assert.doesNotMatch(src,/method:'POST'/);
 assert.doesNotMatch(src,/console\.log|launchctl|osascript\(/);
});
