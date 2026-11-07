'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=()=>fs.readFileSync(path.join(__dirname,'../../utils/proxyConfigAPI.js'),'utf8');
test('RED: external embedding and debug inject are after authenticated fail-closed policy gate',()=>{
 const s=source();
 const auth=s.indexOf('const authBoundary = classifyManagementRequest(');
 const requireAuth=s.indexOf('if (!requireAuth(req, res, u)) return;',auth);
 const gate=s.indexOf('const controlGate=classifySecureManagementOperation({');
 const check=s.indexOf('if(controlGate.blocked)return send(res,503',gate);
 assert.ok(auth>=0&&requireAuth>auth&&gate>requireAuth&&check>gate,
  'management auth and production policy must execute before route handlers');
 for(const needle of ["apiPath('ai/reindex')","apiPath('ai/thoughts/inject')"]){
  let pos=check,found=0;
  while((pos=s.indexOf(needle,pos+1))>=0){
   found++;assert.ok(pos>check,'sensitive POST route must not bypass protected gate');
  }
  assert.ok(found>0,'sensitive route '+needle+' is not represented by policy fixture');
  assert.equal(s.indexOf(needle,0)<check&&s.indexOf(needle,0)>=0,false,
   'sensitive route must not be reachable before secure policy');
 }
});
