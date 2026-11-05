'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {answerFromLocalProjectDocs, validateLocalQuestion}=require('../../utils/rc2-local-calliope-evidence.cjs');
const BASE=()=>fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-local-evidence-'));
function makeDocs(){
 const root=BASE();fs.mkdirSync(path.join(root,'docs'),{recursive:true});
 fs.writeFileSync(path.join(root,'README.md'),'# Dev Proxy\n\nThe proxy uses nginx to route local applications.\n');
 fs.writeFileSync(path.join(root,'docs','ARCHITECTURE.md'),'# Route routing\n\nThe proxy config uses a signed private worker to reload nginx after review.\n\n## Sessions\n\nAdmin sessions must be authenticated for changes.\n');
 fs.writeFileSync(path.join(root,'docs','USER_GUIDE.md'),'# Self-healing\n\nCalliope can propose a redirect-loop fix for Next.js assets, and an owner must review before applying it.\n');
 return root;
}
const done=(root)=>fs.rmSync(root,{recursive:true,force:true});
test('RED: owner question retrieves relevant documented evidence with source labels, no pretend AI',()=>{
 const root=makeDocs();try{const r=answerFromLocalProjectDocs({root,query:'How does Calliope fix Next.js redirect loops?'});
  assert.equal(r.ok,true);assert.equal(r.mode,'local_documentation');assert.equal(r.usedAI,false);assert.equal(r.healingPerformed,false);assert.equal(r.liveAttested,false);
  assert.ok(r.sources.includes('docs/USER_GUIDE.md'),JSON.stringify(r));assert.match(r.answer,/owner must review/i);
 }finally{done(root);}
});
test('RED: missing docs fail closed without creating files or external side effects',()=>{
 const root=BASE();try{const before=fs.readdirSync(root);const r=answerFromLocalProjectDocs({root,query:'how do routes work?'});assert.equal(r.ok,false);assert.equal(r.code,'LOCAL_DOCUMENTATION_UNAVAILABLE');assert.equal(r.healingPerformed,false);assert.deepEqual(fs.readdirSync(root),before);}finally{done(root);}
});
test('RED: nonmatching query returns explicit evidence gap, not a fabricated answer',()=>{
 const root=makeDocs();try{const r=answerFromLocalProjectDocs({root,query:'How do quantum pumpkins file taxes?'});assert.equal(r.ok,true);assert.equal(r.mode,'local_documentation');assert.equal(r.sources.length,0);assert.match(r.answer,/could not find|couldn't find/i);}finally{done(root);}
});
test('RED: arbitrary query cannot steer file traversal or choose root paths',()=>{
 const root=makeDocs();try{fs.writeFileSync(path.join(root,'.env'),'SECRET_VALUE_DO_NOT_LEAK');const r=answerFromLocalProjectDocs({root,query:'../.env SECRET_VALUE_DO_NOT_LEAK'});assert.equal(JSON.stringify(r).includes('SECRET_VALUE_DO_NOT_LEAK'),false);assert.equal(r.healingPerformed,false);}finally{done(root);}
});
test('RED: fixed allowlist rejects symlinks without reading private path targets',()=>{
 const root=makeDocs(),priv=fs.mkdtempSync(path.join(os.tmpdir(),'private-doc-'));try{fs.writeFileSync(path.join(priv,'private.md'),'PROTECTED_PERSONAL_SECRET');fs.unlinkSync(path.join(root,'docs','USER_GUIDE.md'));fs.symlinkSync(path.join(priv,'private.md'),path.join(root,'docs','USER_GUIDE.md'));const r=answerFromLocalProjectDocs({root,query:'self-healing Calliope PROTECTED_PERSONAL_SECRET'});assert.equal(JSON.stringify(r).includes('PROTECTED_PERSONAL_SECRET'),false);assert.equal(r.sources.includes('docs/USER_GUIDE.md'),false);}finally{done(root);done(priv);}
});
test('RED: world-writable docs and hard-linked aliases never become citations',()=>{
 const root=makeDocs();try{fs.chmodSync(path.join(root,'docs','USER_GUIDE.md'),0o666);const external=path.join(root,'extra.md');fs.linkSync(path.join(root,'README.md'),external);const r=answerFromLocalProjectDocs({root,query:'Calliope self-healing nginx local apps?'});assert.equal(r.sources.includes('docs/USER_GUIDE.md'),false);assert.equal(r.sources.includes('README.md'),false);}finally{done(root);}
});
test('RED: bounded output and no file-list disclosure for oversized docs',()=>{
 const root=makeDocs();try{fs.writeFileSync(path.join(root,'docs','USER_GUIDE.md'),'self-healing '.repeat(50000));const r=answerFromLocalProjectDocs({root,query:'self-healing'});assert.ok(r.answer.length<1900,JSON.stringify(r).slice(0,100));assert.equal(r.sources.includes('docs/USER_GUIDE.md'),false);}finally{done(root);}
});
test('RED: reject overlong/control-char/malformed query and untrusted maxDocs',()=>{
 assert.equal(validateLocalQuestion('a'.repeat(1500)).ok,false);assert.equal(validateLocalQuestion('a\r\nb').ok,false);assert.equal(validateLocalQuestion('').ok,false);
 const root=makeDocs();try{const r=answerFromLocalProjectDocs({root,query:'nginx',maxDocs:999999999});assert.equal(r.ok,false);}finally{done(root);}
});
test('RED: fixed max snippets and strict output schema; no auto action permission',()=>{
 const root=makeDocs();try{const r=answerFromLocalProjectDocs({root,query:'nginx configuration route proxy admin session',maxDocs:3});assert.ok(r.sources.length<=3);assert.equal(r.executionAuthorized,false);assert.equal(r.productionChangeAuthorized,false);assert.equal(r.networkTransferAuthorized,false);assert.equal(r.usedAI,false);assert.ok(!Object.hasOwn(r,'rawConfig'));}finally{done(root);}
});
test('RED: ranking is deterministic across repeated requests and local file traversal ignored',()=>{
 const root=makeDocs();try{const a=answerFromLocalProjectDocs({root,query:'proxy nginx route'}),b=answerFromLocalProjectDocs({root,query:'proxy nginx route'});assert.deepEqual(a.sources,b.sources);assert.equal(a.answer,b.answer);}finally{done(root);}
});
const {PassThrough}=require('node:stream');
const {readBoundedLocalQuestionBody}=require('../../utils/rc2-local-calliope-evidence.cjs');
test('RED: local chat POST body accepted only for exact bounded query schema',async()=>{
 const req=new PassThrough(); const p=readBoundedLocalQuestionBody(req);req.end(JSON.stringify({query:'why is nginx redirecting?',maxDocs:2}));
 const r=await p;assert.equal(r.ok,true);assert.equal(r.query,'why is nginx redirecting?');assert.equal(r.maxDocs,2);
});
test('RED: unbounded JSON body and injected host/approval fields fail closed',async()=>{
 const req=new PassThrough();const p=readBoundedLocalQuestionBody(req);req.end(JSON.stringify({query:'heal nginx',maxDocs:2,ownerApprovalGranted:true,host:'evil.invalid'}));
 assert.equal((await p).ok,false);
 const huge=new PassThrough();const q=readBoundedLocalQuestionBody(huge);huge.end(JSON.stringify({query:'x'.repeat(7000)}));
 assert.equal((await q).ok,false);
});
test('RED: malformed body and invalid maxDocs never invoke retrieval',async()=>{
 for(const raw of ['bad json','{"query":"hi","maxDocs":99}','[]','{"query":{},"maxDocs":2}']){
  const req=new PassThrough();const p=readBoundedLocalQuestionBody(req);req.end(raw);assert.equal((await p).ok,false,raw);
 }
});
test('RED: existing Calliope chat UI POST {query} remains compatible',async()=>{
 const req=new PassThrough();const p=readBoundedLocalQuestionBody(req);req.end(JSON.stringify({query:'How do routes work?'}));
 const r=await p;assert.equal(r.ok,true);assert.equal(r.maxDocs,3);
});
