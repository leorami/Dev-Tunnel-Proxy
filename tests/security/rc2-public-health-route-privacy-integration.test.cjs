'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'../../utils/proxyConfigAPI.js'),'utf8');
const getSecureBlock=()=>{
 const head="if(req.method==='GET'&&u.pathname===apiPath('ai/health')&&inlineHostDockerUnavailable()){";
 const start=SRC.indexOf(head);
 assert.ok(start>=0,'exact public secure health route must exist');
 const after=SRC.indexOf('    // RC2_SECURE_HTTP_AUDIT:',start);
 assert.ok(after>start,'following route boundary must exist');
 return SRC.slice(start,after);
};
test('RED: public health must use the fixed safe envelope module, not live activity or credential presence',()=>{
 assert.match(SRC,/require\('\.\/rc2-public-calliope-health-privacy\.cjs'\)/);
 const code=getSecureBlock();
 assert.match(code,/createMinimalPublicCalliopeHealth\(\)/);
 assert.match(code,/publicCalliopeHealthCacheHeaders\(\)/);
 for(const sensitive of ['OPENAI_API_KEY','openaiConfigured','currentActivity','staticNgrokDomain',
  'model:', 'capabilities:'])assert.equal(code.includes(sensitive),false,sensitive);
});
test('RED: secure public health remains GET-only and will not mutate trusted-session policy',()=>{
 const code=getSecureBlock();
 assert.match(code,/req\.method==='GET'/);
 assert.equal(/req\.method==='POST'/.test(code),false);
 assert.match(code,/send\(res,\s*200,\s*createMinimalPublicCalliopeHealth\(\),\s*publicCalliopeHealthCacheHeaders\(\)\)/);
});
test('RED: health helper must not leak owner values via static code hook',()=>{
 const code=getSecureBlock();
 for(const unsafe of ['process.env','req.headers','execSync','writeFile','requestCancel','setActivity'])
  assert.equal(code.includes(unsafe),false,unsafe);
});

test('RED: fallback public health must never spawn Docker logs or reveal model/activity/domain',()=>{
 const i=SRC.indexOf("if (req.method === 'GET' && u.pathname === apiPath('ai/health')){");
 const j=SRC.indexOf('      // GET /api/ai/thoughts',i);
 assert.ok(i>=0&&j>i);
 const block=SRC.slice(i,j);
 assert.match(block,/createMinimalPublicCalliopeHealth\(\)/);
 assert.match(block,/publicCalliopeHealthCacheHeaders\(\)/);
 for(const leak of ['process.env.OPENAI_API_KEY','process.env.OPENAI_MODEL','currentActivity','docker logs',
   'execSync','staticNgrokDomain','mStatic'])assert.equal(block.includes(leak),false,leak);
});
