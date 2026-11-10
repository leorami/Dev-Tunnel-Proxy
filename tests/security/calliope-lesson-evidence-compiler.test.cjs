'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {compileNextjsRedirectLessonEvidence}=require('../../utils/calliope-lesson-evidence-compiler.cjs');
const {proposeNextjsRedirectLoopRepair}=require('../../utils/calliope-redirect-loop-proposal.cjs');
const {disposableBrokenLyraSource}=require('../../utils/calliope-nextjs-redirect-fixture.cjs');

const DIGEST='a'.repeat(64);
const SRC={
 repository:'leorami/Dev-Tunnel-Proxy',
 commit:'93962a98a5213b1ff4f4749928673839f0383e32',
 receipt:'docs/receipts/DEVPROXY_RC2_V92_ATOMIC_CAS_BROWSER_ENGINEER_COMPLETION.md'
};

function goodPair(){
 const before=disposableBrokenLyraSource();
 const p=proposeNextjsRedirectLoopRepair({source:before,route:'lyra'});
 return {before,after:p.candidateConfig,p};
}

test('RED: exact V91 proposal replay compiles to REVIEW_REQUIRED without raw config',()=>{
 const {before,after,p}=goodPair();
 const r=compileNextjsRedirectLessonEvidence({
  lessonId:'v92-nextjs-redirect-disposable',source:SRC,route:'lyra',
  beforeConfig:before,afterConfig:after,browserEvidenceDigest:DIGEST
 });
 assert.equal(r.status,'REVIEW_REQUIRED');
 assert.equal(r.rawConfigIncluded,false);
 assert.equal(r.runnable,false);
 assert.equal(r.installedAbility,false);
 assert.equal(r.ownerApprovalGranted,false);
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.healingPerformed,false);
 assert.equal(r.evidence.beforeSha256,p.beforeSha256);
 assert.equal(r.evidence.afterSha256,p.afterSha256);
 assert.equal(r.provenanceStatus,'COMMIT_SHAPE_ONLY_UNVERIFIED');
 assert.equal(r.provenanceVerified,false);
 assert.equal(r.offeredAbility.id,'nginx.nextjs_redirect.propose');
 assert.equal(JSON.stringify(r).includes('proxy_pass'),false);
});

test('RED: independent GitHub attestation flips provenanceVerified without granting execution',()=>{
 const {before,after}=goodPair();
 const r=compileNextjsRedirectLessonEvidence({
  lessonId:'v92-nextjs-redirect-disposable',source:SRC,route:'lyra',
  beforeConfig:before,afterConfig:after,browserEvidenceDigest:DIGEST,
  githubAttestation:{fullSha:SRC.commit,exists:true,repository:SRC.repository}
 });
 assert.equal(r.provenanceVerified,true);
 assert.equal(r.provenanceStatus,'GITHUB_COMMIT_ATTESTED');
 assert.equal(r.executionAuthorized,false);
 assert.equal(r.healingPerformed,false);
});

test('RED: SHA-shaped commit alone cannot be forged into verified via getter injection',()=>{
 const {before,after}=goodPair();
 const poisoned={
  lessonId:'x',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:DIGEST,
  get ownerApprovalGranted(){return true;},
  get executionAuthorized(){return true;}
 };
 // Extra keys → INVALID; even if somehow accepted, compiler never sets true.
 const r=compileNextjsRedirectLessonEvidence(poisoned);
 assert.equal(r.status,'REJECTED');
 assert.notEqual(r.ownerApprovalGranted,true);
});

test('RED: unrelated after bytes rejected',()=>{
 const {before}=goodPair();
 const r=compileNextjsRedirectLessonEvidence({
  lessonId:'bad',source:SRC,route:'lyra',beforeConfig:before,
  afterConfig:before+'\n# unrelated\n',browserEvidenceDigest:DIGEST
 });
 assert.equal(r.code,'AFTER_DOES_NOT_MATCH_DETERMINISTIC_PROPOSAL');
});

test('RED: already-fixed before is not a lesson',()=>{
 const {after}=goodPair();
 const r=compileNextjsRedirectLessonEvidence({
  lessonId:'fixed',source:SRC,route:'lyra',beforeConfig:after,afterConfig:after,
  browserEvidenceDigest:DIGEST
 });
 assert.equal(r.status,'REJECTED');
 assert.ok(['BEFORE_NOT_KNOWN_REDIRECT_LOOP','AFTER_DOES_NOT_MATCH_DETERMINISTIC_PROPOSAL'].includes(r.code)||
  r.code==='BEFORE_NOT_KNOWN_REDIRECT_LOOP');
});

test('RED: forged github attestation rejected',()=>{
 const {before,after}=goodPair();
 assert.equal(compileNextjsRedirectLessonEvidence({
  lessonId:'forged-attestation',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:DIGEST,
  githubAttestation:{fullSha:'0'.repeat(40),exists:true,repository:SRC.repository}
 }).code,'INVALID_GITHUB_ATTESTATION');
 assert.equal(compileNextjsRedirectLessonEvidence({
  lessonId:'forged-attestation',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:DIGEST,
  githubAttestation:{fullSha:SRC.commit,exists:false,repository:SRC.repository}
 }).code,'INVALID_GITHUB_ATTESTATION');
});

test('RED: unknown host route and bad digests rejected',()=>{
 const {before,after}=goodPair();
 assert.equal(compileNextjsRedirectLessonEvidence({
  lessonId:'bad-route',source:SRC,route:'../x',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:DIGEST
 }).status,'REJECTED');
 assert.equal(compileNextjsRedirectLessonEvidence({
  lessonId:'bad-digest',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:'zz'
 }).status,'REJECTED');
});

test('RED: stable fingerprint across identical inputs',()=>{
 const {before,after}=goodPair();
 const a=compileNextjsRedirectLessonEvidence({
  lessonId:'same',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:DIGEST
 });
 const b=compileNextjsRedirectLessonEvidence({
  lessonId:'same',source:SRC,route:'lyra',beforeConfig:before,afterConfig:after,
  browserEvidenceDigest:DIGEST
 });
 assert.equal(a.lessonFingerprint,b.lessonFingerprint);
 assert.equal(a.lessonFingerprint.length,64);
});
