'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../utils/proxyConfigAPI.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../../status/common.js'),'utf8');
const {classifyManagementRequest}=require('../../utils/managementAuthPolicy.cjs');

test('local Ask is authenticated, trusted Origin-gated and precedes legacy Docker/AI',()=>{
 const auth=src.indexOf('const authBoundary = classifyManagementRequest(');
 const safe=src.indexOf("if(req.method==='POST'&&u.pathname===apiPath('ai/ask')&&inlineHostDockerUnavailable())");
 const deny=src.indexOf('const controlGate=classifySecureManagementOperation(',safe);
 const legacy=src.indexOf("if (req.method === 'POST' && u.pathname === apiPath('ai/ask'))",deny);
 assert.ok(auth>0&&safe>auth&&deny>safe&&legacy>deny,JSON.stringify({auth,safe,deny,legacy}));
 assert.equal(classifyManagementRequest('POST','/devproxy/api/ai/ask').requiresAuth,true);
 assert.match(src.slice(auth,safe),/requireAuth\(req, res, u\)/);
 assert.match(src.slice(safe,deny),/readBoundedLocalQuestionBody\(req\)/);
 assert.match(src.slice(safe,deny),/explainLocalCalliopeCapability\(request.query\)/);
 assert.match(src.slice(safe,deny),/answerFromLocalProjectDocs\(\{root:ROOT,query:request.query,maxDocs:request.maxDocs\}\)/);
 const protectedHandler=src.slice(safe,deny);
 assert.doesNotMatch(protectedHandler,/\b(?:spawnSync|execSync|appendChat|fetch)\s*\(/);
});

test('local response contract matches existing chat UI and never claims healing or AI model',()=>{
 assert.match(ui,/fetch\('\/devproxy\/api\/ai\/ask'/);
 assert.match(ui,/JSON\.stringify\(\{\s*query\s*:\s*q\s*\}\)/);
 assert.match(ui,/fetch\('\/devproxy\/api\/ai\/ask',\s*\{\s*method:\s*'POST',\s*credentials:\s*'include'/);
 assert.match(src,/usedAI:false,healingPerformed:false,liveAttested:false/);
 const safeStart=src.indexOf("if(req.method==='POST'&&u.pathname===apiPath('ai/ask')&&inlineHostDockerUnavailable())");
 const safeEnd=src.indexOf('// RC2_SECURE_HTTP_AUDIT',safeStart);
 assert.match(src.slice(safeStart,safeEnd),/return send\(res,code,answer\)/);
});

test('secure ai/health advertises local_documentation without claiming OpenAI as the only Ask path',()=>{
 const healthEarly=src.indexOf('RC2_V95_LOCAL_CHAT health');
 const gate=src.indexOf('const controlGate=classifySecureManagementOperation(');
 assert.ok(healthEarly>0&&healthEarly<gate);
 const block=src.slice(healthEarly,src.indexOf('// RC2_SECURE_HTTP_AUDIT',healthEarly));
 assert.match(block,/createMinimalPublicCalliopeHealth\(\)/);
 assert.match(block,/publicCalliopeHealthCacheHeaders\(\)/);
 const health=require('../../utils/rc2-public-calliope-health-privacy.cjs');
 assert.deepEqual(health.createMinimalPublicCalliopeHealth(),{enabled:true,mode:'local_documentation',usedAI:false,healingPerformed:false,liveAttested:false});
 const explanation=require('../../utils/rc2-local-calliope-observe-explain.cjs').explainLocalCalliopeCapability('How does Calliope fix a Next.js redirect loop?');
 assert.equal(explanation.mode,'local_reviewed_heal_explain');
 assert.equal(explanation.executionAuthorized,false);
 assert.equal(explanation.healingPerformed,false);
});
