'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {proposeNextjsRedirectLoopRepair}=require('../../utils/calliope-redirect-loop-proposal.cjs');
const SOURCE=`# owner route\nlocation ^~ /lyra/_next/ {\n  proxy_set_header X-Forwarded-Proto $scheme;\n  proxy_pass http://lyra-dev:4000/lyra/_next/;\n}\nlocation /other/ { proxy_pass http://other-dev:3000; }\n`;
const draft=(source=SOURCE,route='lyra')=>proposeNextjsRedirectLoopRepair({source,route});
test('RED: proposes concrete recorded Cursor redirect-loop fix with before/after attestations',()=>{
 const r=draft();
 assert.equal(r.status,'PATCH_PROPOSAL_ONLY');
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.ownerApprovalGranted,false);
 assert.match(r.candidateConfig,/proxy_pass http:\/\/lyra-dev:4000;/);
 assert.doesNotMatch(r.candidateConfig,/proxy_pass http:\/\/lyra-dev:4000\/lyra\/_next\//);
 assert.match(r.candidateConfig,/location \/other\/ \{ proxy_pass http:\/\/other-dev:3000; \}/);
 assert.equal(r.beforeSha256.length,64);
 assert.equal(r.afterSha256.length,64);
 assert.notEqual(r.beforeSha256,r.afterSha256);
});
test('RED: idempotent, no claim of healing when already fixed',()=>{
 const proposed=draft();
 const r=draft(proposed.candidateConfig);
 assert.equal(r.status,'NO_KNOWN_REDIRECT_LOOP');
 assert.equal(r.candidateConfig,undefined);
 assert.equal(r.healingPerformed,false);
});
test('RED: ambiguous multiple matching locations fail closed',()=>{
 const r=draft(SOURCE+SOURCE);
 assert.equal(r.status,'AMBIGUOUS_ROUTE_BLOCK');
 assert.equal(r.candidateConfig,undefined);
});
test('RED: nested Nginx context cannot be regex-patched',()=>{
 const s=SOURCE.replace('proxy_pass http://lyra-dev:4000/lyra/_next/;', 'if ($bad) { return 400; }\n  proxy_pass http://lyra-dev:4000/lyra/_next/;');
 const r=draft(s);
 assert.notEqual(r.status,'PATCH_PROPOSAL_ONLY');
});
test('RED: arbitrary external proxy URL and DNS aliases with dot are not modified',()=>{
 assert.equal(draft(SOURCE.replace('lyra-dev:4000','evil.test:4000')).status,'UNSUPPORTED_PROXY_PASS');
 assert.equal(draft(SOURCE.replace('lyra-dev:4000','127.0.0.1:4000')).status,'UNSUPPORTED_PROXY_PASS');
});
test('RED: no arbitrary route paths, oversized data or embedded controls',()=>{
 assert.equal(draft(SOURCE,'../admin').status,'INVALID_REPAIR_INPUT');
 assert.equal(draft(SOURCE+'a'.repeat(262145)).status,'INVALID_REPAIR_INPUT');
 assert.equal(draft(SOURCE,'/lyra').status,'INVALID_REPAIR_INPUT');
});
test('RED: no modification without exact location and exact known upstream path',()=>{
 assert.equal(draft(SOURCE.replace('/lyra/_next/ {','/lyra/assets/ {')).status,'NO_KNOWN_REDIRECT_LOOP');
 assert.equal(draft(SOURCE.replace('http://lyra-dev:4000/lyra/_next/','http://lyra-dev:4000/api')).status,'UNSUPPORTED_PROXY_PASS');
});
test('RED: duplicate proxy directives in one location rejected',()=>{
 const modified=SOURCE.replace('  proxy_pass http://lyra-dev:4000/lyra/_next/;', '  proxy_pass http://lyra-dev:4000/lyra/_next/;\n  proxy_pass http://other-dev:3000;');
 assert.equal(draft(modified).status,'UNSUPPORTED_PROXY_PASS');
});
