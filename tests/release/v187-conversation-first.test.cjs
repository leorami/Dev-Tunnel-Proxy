'use strict';
/**
 * V187 Calliope natural-questions-first acceptance.
 * SOURCE-ONLY: immutable reviewed Git blobs + pure string compiler.
 * Does not load API server or access owner Mac, credentials, model, web.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {buildCalliopeInstalledApiOverlay}=require('../../utils/rc2-v185-calliope-api-overlay.cjs');
const {compileModelFirstApi}=require('../../utils/rc2-v187-calliope-model-first.cjs');
const {explainLocalCalliopeCapability}=require('../../utils/rc2-local-calliope-observe-explain.cjs');

const MAIN='590bcf2a980b434f533ddacac43a24a777a933e7';
const DEPLOYED_BLOB='f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528';
const old=buildCalliopeInstalledApiOverlay({
 installedSource:execFileSync('git',['cat-file','blob','7a22ec61531ac7b39c01370e41196775904c274f'],{encoding:'utf8'}),
 mainSource:execFileSync('git',['show',MAIN+':utils/proxyConfigAPI.js'],{encoding:'utf8'}),
 reviewedSource:fs.readFileSync(path.resolve(__dirname,'../../utils/proxyConfigAPI.js'),'utf8')
});
const sha=(s)=>{const b=Buffer.from(s,'utf8');return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
function secureHandler(text){
 const begin=text.indexOf("if(req.method==='POST'&&u.pathname===apiPath('ai/ask')&&inlineHostDockerUnavailable())");
 const end=text.indexOf("if (req.method==='POST' && u.pathname===apiPath('ai/audit') && inlineHostDockerUnavailable())",begin);
 assert.ok(begin>=0&&end>begin,'same verified secure-mode handler');
 return text.slice(begin,end);
}
const ALT_MODEL="      const ownerSessionId=calliopeAskRuntime().sessionKey(extractSessionToken(req));";
const ALT_EXPLAIN="      const explained=explainLocalCalliopeCapability(request.query);";
const ALT_FALLBACK="      const answer=answerFromLocalProjectDocs({root:ROOT,query:request.query,maxDocs:request.maxDocs});";
const EXPLAIN_LINES=ALT_EXPLAIN+"\n      if(explained.ok)return send(res,200,explained);\n";
const EXPECTED=old.source.replace(EXPLAIN_LINES,'').replace(ALT_FALLBACK,EXPLAIN_LINES+ALT_FALLBACK);

test('real deployed source template hijacks important questions even with live local model',()=>{
 assert.equal(old.ok,true);
 assert.equal(sha(old.source),DEPLOYED_BLOB);
 const help=explainLocalCalliopeCapability('How can you fix a Next.js redirect loop?');
 const head=explainLocalCalliopeCapability('What does the fixed-host HTTP HEAD observation prove?');
 assert.equal(help.ok,true);
 assert.equal(head.ok,true);
 assert.equal(help.usedAI,false);
 assert.equal(head.usedAI,false);
 const h=secureHandler(old.source);
 assert.ok(h.indexOf(ALT_EXPLAIN)<h.indexOf(ALT_MODEL),'RED baseline proves deterministic intercept comes first');
});

test('RED: model turn takes priority for natural explanation/repair questions; fallback remains when model fails',()=>{
 const r=compileModelFirstApi({deployedSource:old.source});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.code,'SOURCE_ONLY_CONVERSATION_FIRST');
 const h=secureHandler(r.source);
 const m=h.indexOf(ALT_MODEL),e=h.indexOf(ALT_EXPLAIN),f=h.indexOf(ALT_FALLBACK);
 assert.ok(m>0&&e>m&&f>e,'model call must be attempted ahead of templates, templates before docs');
 assert.ok(h.includes('if(local&&local.ok===true&&local.usedAI===true&&local.mode===\'local_model_readonly\')'));
 assert.ok(h.includes('if(explained.ok)return send(res,200,explained);'));
 assert.ok(h.includes('const code=answer.ok?200:'));
});

test('RED: exactly two existing explanatory lines move, no other changes to installed API behavior',()=>{
 const r=compileModelFirstApi({deployedSource:old.source});
 assert.equal(r.ok,true);
 assert.equal(typeof r.source,'string');
 assert.equal(r.source,EXPECTED,'must be byte-identical except the two line move');
 assert.equal(r.movedLineCount,2);
 assert.notEqual(sha(r.source),DEPLOYED_BLOB);
 assert.equal(r.sourceGitBlobSha1,sha(r.source));
 assert.doesNotThrow(()=>new vm.Script(r.source,{filename:'v187-proposed-API.js'}));
 assert.equal(r.source.includes('const shouldInstall = options.install !== false;'),true);
 assert.equal(r.source.includes("require('./reports-list-catalog.cjs')"),false);
 assert.equal(r.source.includes("require('./create-route-install-intent.cjs')"),false);
});

test('RED: strict deployed source CAS, source-only result, no permission or model tool grant',()=>{
 const r=compileModelFirstApi({deployedSource:old.source});
 assert.equal(r.ok,true);
 for(const k of ['productionChangeAuthorized','apiRestartAuthorized','hostAttested',
  'processLoaded','ownerUatAccepted','healingPerformed']){
   assert.equal(r[k],false,k);
 }
 assert.equal(compileModelFirstApi({deployedSource:old.source+'\n'}).ok,false);
 assert.equal(compileModelFirstApi({deployedSource:r.source}).ok,false);
 assert.equal(compileModelFirstApi({deployedSource:old.source,ownerGo:true}).ok,false);
 assert.equal(compileModelFirstApi({unexpected:old.source}).ok,false);
 assert.equal(compileModelFirstApi({}).ok,false);
});
