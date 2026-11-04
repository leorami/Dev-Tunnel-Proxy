'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {classifyManagementRequest}=require('../../utils/managementAuthPolicy.cjs');
const {classifySecureManagementOperation}=require('../../utils/rc2-management-safety-policy.cjs');
const base='/devproxy/api';
test('secure route remains authenticated and CSRF-bound, not public',()=>{
 const auth=classifyManagementRequest('POST',base+'/ai/audit',base);
 assert.equal(auth.requiresAuth,true);assert.equal(auth.isPublic,false);
 // Legacy behavior must remain fail-closed unless the explicit safe dispatch
 // intercepts the exact method/path after authentication.
 const gate=classifySecureManagementOperation({
  method:'POST',pathname:base+'/ai/audit',base,nodeEnv:'production',denyFlag:'1'
 });
 assert.equal(gate.blocked,true);
 assert.equal(gate.productionChangeAuthorized,false);
});
test('RC2 safe HTTP audit API dispatch executes AFTER auth and BEFORE old deny',()=>{
 const api=fs.readFileSync(path.join(__dirname,'../../utils/proxyConfigAPI.js'),'utf8');
 const auth=api.indexOf('const authBoundary = classifyManagementRequest(');
 const intercept=api.indexOf('const rc2SafeAuditInput=await readBoundedAuditBody(req);');
 const gate=api.indexOf('const controlGate=classifySecureManagementOperation({');
 const legacy=api.indexOf("if (req.method === 'POST' && u.pathname === apiPath('ai/audit')){",gate);
 assert.ok(auth>0&&intercept>auth&&gate>intercept&&legacy>gate);
 const excerpt=api.slice(intercept-380,intercept+550);
 assert.match(excerpt,/requireAuth|RC2_SECURE_HTTP_AUDIT|inlineHostDockerUnavailable\(\)/);
 assert.match(api,/require\('\.\/rc2-secure-http-audit\.cjs'\)/);
 // Fail-closed management guard must not be weakened to unblock all AI actions.
 assert.match(api,/if\(controlGate\.blocked\)/);
});
