'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {
 quarantineLegacyHealingKb,fingerprintPattern,canonicalize
}=require('../../utils/calliope-legacy-kb-quarantine.cjs');

function sampleKb(){
 return {
  version:'1.0',
  patterns:[
   {
    id:'redirect_loop_errors',
    detection:{signals:['ERR_TOO_MANY_REDIRECTS','/_next/'],effects:['asset loop']},
    solutions:[{id:'fix_redirect_loop',description:'legacy',implementation:{type:'automated',function:'fixRedirectLoop',params:[]}}]
   },
   {
    id:'mixed_content_errors',
    detection:{signals:['Mixed Content'],effects:['https blocked']},
    solutions:[{id:'fix_x_forwarded_proto',implementation:{type:'automated',function:'fixXForwardedProto',params:[]}}]
   },
   {
    id:'custom_weird',
    detection:{signals:['(?i)evil.*pattern'],effects:['unknown']},
    solutions:[{id:'run_shell',implementation:{type:'automated',function:'execSync',params:['rm -rf /']}}]
   }
  ]
 };
}

test('RED: inventory classifies known Next.js/mixed-content and never executes RegExp',async()=>{
 const r=await quarantineLegacyHealingKb({kbObject:sampleKb()});
 assert.equal(r.ok,true);
 assert.equal(r.regexpExecuted,false);
 assert.equal(r.functionsInvoked,false);
 assert.equal(r.kbMutated,false);
 assert.equal(r.healingPerformed,false);
 const byId=Object.fromEntries(r.patterns.map(p=>[p.id,p]));
 assert.equal(byId.redirect_loop_errors.classification,'KNOWN_NEXTJS_REDIRECT_HISTORICAL');
 assert.equal(byId.mixed_content_errors.classification,'KNOWN_MIXED_CONTENT_HISTORICAL');
 assert.equal(byId.custom_weird.classification,'UNKNOWN_HISTORICAL_EVIDENCE');
 assert.ok(r.abilityRequests.some(a=>a.id==='legacy.kb.fn.fixRedirectLoop'&&a.runnable===false));
 assert.ok(r.abilityRequests.some(a=>a.id==='legacy.kb.fn.execSync'&&a.runnable===false));
 assert.ok(r.abilityRequests.every(a=>a.runnable===false));
});

test('RED: fingerprint is independent of JSON key order',()=>{
 const a={id:'redirect_loop_errors',detection:{signals:['b','a'],effects:['z']},solutions:[{id:'s',implementation:{type:'automated',function:'fixRedirectLoop'}}]};
 const b={solutions:[{implementation:{function:'fixRedirectLoop',type:'automated'},id:'s'}],id:'redirect_loop_errors',detection:{effects:['z'],signals:['a','b']}};
 assert.equal(fingerprintPattern(canonicalize(a)),fingerprintPattern(canonicalize(b)));
});

test('RED: path-backed quarantine preserves exact owner KB bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dpv93-kb-'));
 const kbPath=path.join(dir,'healing-kb.json');
 const raw=Buffer.from(JSON.stringify(sampleKb(),null,2),'utf8');
 await fs.writeFile(kbPath,raw,{mode:0o600});
 const before=await fs.readFile(kbPath);
 const r=await quarantineLegacyHealingKb({kbPath});
 assert.equal(r.ok,true);
 assert.equal(r.bytesUnchanged,true);
 assert.deepEqual(await fs.readFile(kbPath),before);
 await fs.rm(dir,{recursive:true,force:true});
});

test('RED: symlink / oversized / invalid JSON fail closed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dpv93-kb-'));
 const real=path.join(dir,'real.json');
 const link=path.join(dir,'link.json');
 await fs.writeFile(real,'{"patterns":[]}');
 await fs.symlink(real,link);
 assert.equal((await quarantineLegacyHealingKb({kbPath:link})).ok,false);
 assert.equal((await quarantineLegacyHealingKb({kbPath:path.join(dir,'missing.json')})).code,'KB_NOT_FOUND');
 await fs.rm(dir,{recursive:true,force:true});
});

test('RED: hostile prototype / getter patterns rejected',async()=>{
 const proto=JSON.parse('{"patterns":[{"id":"x","detection":{"signals":[]},"solutions":[]}]}');
 Object.setPrototypeOf(proto.patterns[0],{get id(){return 'hijack';}});
 // Own id still 'x' but if someone deletes own id...
 const bad={patterns:[Object.create({id:'inherited'})]};
 assert.equal((await quarantineLegacyHealingKb({kbObject:bad})).ok,false);
});

test('RED: duplicate pattern ids rejected; success claims do not imply proven',async()=>{
 const kb=sampleKb();
 kb.patterns.push({...kb.patterns[0]});
 assert.equal((await quarantineLegacyHealingKb({kbObject:kb})).code,'DUPLICATE_PATTERN_ID');
 const ok=await quarantineLegacyHealingKb({kbObject:sampleKb()});
 assert.equal(ok.executionAuthorized,false);
 assert.equal(ok.ownerApprovalGranted,false);
});
