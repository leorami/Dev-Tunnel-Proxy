'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLessonStore}=require('../../utils/calliope-lesson-reuse.cjs');
const {proposeNextjsRedirectLoopRepair}=require('../../utils/calliope-redirect-loop-proposal.cjs');
const {disposableBrokenLyraSource}=require('../../utils/calliope-nextjs-redirect-fixture.cjs');

const DIGEST='b'.repeat(64);
const SRC={
 repository:'leorami/Dev-Tunnel-Proxy',
 commit:'93962a98a5213b1ff4f4749928673839f0383e32',
 receipt:'docs/receipts/DEVPROXY_RC2_V92_ATOMIC_CAS_BROWSER_ENGINEER_COMPLETION.md'
};

function compileAdmitted(store,lessonId='v92-lyra-redirect'){
 const before=disposableBrokenLyraSource();
 const p=proposeNextjsRedirectLoopRepair({source:before,route:'lyra'});
 const candidate=store.compile({
  lessonId,source:SRC,route:'lyra',beforeConfig:before,afterConfig:p.candidateConfig,
  browserEvidenceDigest:DIGEST,
  githubAttestation:{fullSha:SRC.commit,exists:true,repository:SRC.repository}
 });
 assert.equal(candidate.status,'REVIEW_REQUIRED');
 return {before,after:p.candidateConfig,p,candidate,admit:store.admit(candidate)};
}

test('RED: learn→reuse — second disposable equivalent failure offers reviewed propose, not auto-heal',()=>{
 const store=createLessonStore();
 const first=compileAdmitted(store);
 assert.equal(first.admit.code,'ADMITTED');

 // Second disposable failure: same class, different route slug → still offers propose path.
 const secondBroken=`# second disposable\nlocation ^~ /aurora/_next/ {\n  proxy_set_header X-Forwarded-Proto $scheme;\n  proxy_pass http://aurora-dev:4000/aurora/_next/;\n}\nlocation /other/ { proxy_pass http://other-dev:3000; }\n`;
 const recog=store.recognizeNextjsRedirectFailure({source:secondBroken,route:'aurora'});
 assert.equal(recog.status,'EQUIVALENT_FAILURE_OFFERS_REVIEWED_PROPOSE');
 assert.equal(recog.healingPerformed,false);
 assert.equal(recog.executionAuthorized,false);
 assert.equal(recog.offeredAbility.id,'nginx.nextjs_redirect.propose');
 assert.equal(recog.offeredAbility.runnable,false);
 assert.ok(recog.requires.includes('v92_locked_cas'));
 assert.ok(recog.requires.includes('authenticated_owner_review'));
 assert.ok(recog.matchedLessonIds.includes('v92-lyra-redirect'));
});

test('RED: exact hash replay against admitted lesson still not autonomous heal',()=>{
 const store=createLessonStore();
 const {before}=compileAdmitted(store);
 const recog=store.recognizeNextjsRedirectFailure({source:before,route:'lyra'});
 assert.equal(recog.status,'EXACT_LESSON_REPLAY_AVAILABLE');
 assert.equal(recog.healingPerformed,false);
 assert.equal(recog.executionAuthorized,false);
});

test('RED: duplicate import ignored; conflicting claim preserves original',()=>{
 const store=createLessonStore();
 const {candidate,before,after}=compileAdmitted(store,'lesson-a');
 assert.equal(store.admit(candidate).code,'DUPLICATE_IGNORED');
 const conflict=store.compile({
  lessonId:'lesson-a',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:'c'.repeat(64), // different browser digest → different fingerprint
  githubAttestation:{fullSha:SRC.commit,exists:true,repository:SRC.repository}
 });
 const r=store.admit(conflict);
 assert.equal(r.code,'CONFLICT_PRESERVED_ORIGINAL');
 assert.equal(r.overwrote,false);
 assert.equal(store.snapshot().lessons.length,1);
 assert.equal(store.snapshot().lessons[0].browserEvidenceDigest,DIGEST);
});

test('RED: missing ability is non-executable request and never self-grants',()=>{
 const store=createLessonStore();
 const r=store.requestMissingAbility('nginx.x_forwarded_proto.propose');
 assert.equal(r.status,'NEW_ABILITY_REQUEST_NOT_IMPLEMENTED');
 assert.equal(r.runnable,false);
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.healingPerformed,false);
 assert.equal(store.requestMissingAbility('../evil').ok,false);
});

test('RED: privileged candidate flags cannot be admitted',()=>{
 const store=createLessonStore();
 const {candidate}=compileAdmitted(store,'tmp');
 // craft a poisoned object resembling candidate with privilege flags
 const poisoned={...candidate,executionAuthorized:true,runnable:true};
 const r=store.admit(poisoned);
 assert.equal(r.ok,false);
 assert.equal(r.code,'INVALID_OR_PRIVILEGED_CANDIDATE');
});

test('RED: recognition without admitted lessons does not invent heal success',()=>{
 const store=createLessonStore();
 const before=disposableBrokenLyraSource();
 const r=store.recognizeNextjsRedirectFailure({source:before,route:'lyra'});
 assert.equal(r.status,'NO_ADMITTED_LESSON');
 assert.equal(r.healingPerformed,false);
 assert.equal(r.offeredAbility,null);
});

test('RED: outcomes are deterministic for admit/duplicate/conflict/missing',()=>{
 const store=createLessonStore();
 compileAdmitted(store,'det');
 compileAdmitted(store,'det');
 store.requestMissingAbility('browser.mixed_content.inspect');
 const types=store.snapshot().outcomes.map(o=>o.type);
 assert.deepEqual(types,['ADMITTED','DUPLICATE_IGNORED','MISSING_ABILITY_REQUESTED']);
});
