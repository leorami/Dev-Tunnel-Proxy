'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {classifyDirtySourceRecoverability}=require('../../utils/rc2-dirty-source-recoverability.cjs');
const {verifyOwnerDirtyByteReplay}=require('../../utils/rc2-owner-dirty-byte-replay.cjs');
const {assessRecoverableDirtyPreservation}=require('../../utils/rc2-recoverable-dirty-preservation.cjs');

function write(file,data,mode=0o644){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,data,{mode});
 fs.chmodSync(file,mode);
}
function sha(buf){return crypto.createHash('sha256').update(buf).digest('hex');}

test('RED: path-only classifier can claim VERIFIED_RECOVERABLE with fake hashes; byte replay blocks',()=>{
 const live=fs.mkdtempSync(path.join(os.tmpdir(),'v96-live-'));
 const archive=fs.mkdtempSync(path.join(os.tmpdir(),'v96-arch-'));
 const supplement=fs.mkdtempSync(path.join(os.tmpdir(),'v96-supp-'));
 try{
  fs.chmodSync(supplement,0o700);
  const relA='docker-compose.yml';
  const relB='smart-build.sh';
  const liveA=Buffer.from('LIVE_COMPOSE_BYTES\n');
  const liveB=Buffer.from('LIVE_SMART_BYTES\n');
  write(path.join(live,relA),liveA,0o644);
  write(path.join(live,relB),liveB,0o755);
  // Recovery roots intentionally DIFFERENT bytes than live.
  write(path.join(archive,relA),Buffer.from('ARCHIVE_OTHER\n'),0o644);
  write(path.join(supplement,relB),Buffer.from('SUPPLEMENT_OTHER\n'),0o755);

  const fakeHashA=sha(Buffer.from('not-the-live-bytes'));
  const fakeHashB=sha(Buffer.from('also-wrong'));
  const pathOnly=classifyDirtySourceRecoverability({
   sourceDirty:true,
   dirtyRelativePaths:[relA,relB],
   archivedMatches:[{path:relA,sha256:fakeHashA}],
   supplementMatches:[{path:relB,sha256:fakeHashB}]
  });
  assert.equal(pathOnly.code,'VERIFIED_RECOVERABLE_DIRTY_SOURCE');
  assert.equal(pathOnly.recoverable,true);

  const byteReplay=verifyOwnerDirtyByteReplay({
   sourceDirty:true,
   sourceHead:'a'.repeat(40),
   expectedDirtyCount:2,
   dirtyFiles:[
    {path:relA,sha256:sha(liveA),mode:0o644},
    {path:relB,sha256:sha(liveB),mode:0o755}
   ],
   archiveDirtyPaths:[relA],
   supplementDirtyPaths:[relB],
   liveRoot:live,
   archiveRestoreRoot:archive,
   privateSupplementRoot:supplement
  });
  assert.equal(byteReplay.ownerWorkByteReplayVerified,false);
  assert.notEqual(byteReplay.code,'OWNER_DIRTY_BYTE_REPLAY_MATCHED');
 }finally{
  fs.rmSync(live,{recursive:true,force:true});
  fs.rmSync(archive,{recursive:true,force:true});
  fs.rmSync(supplement,{recursive:true,force:true});
 }
});

test('RED: preservation decision rejects missing exhaustive/tar/nonroot proofs even after matched replay shape',()=>{
 const matched={
  code:'OWNER_DIRTY_BYTE_REPLAY_MATCHED',
  ownerWorkByteReplayVerified:true,
  sourceDirty:true,
  formalCleanPass:false,
  releaseAuthorized:false
 };
 assert.equal(assessRecoverableDirtyPreservation({
  sourceDirty:true,byteReplay:matched,
  dirtyInventoryExhaustiveAttested:false,
  originalArchiveTarAttested:true,
  secureNonrootCandidateRestoreAttested:true
 }).code,'RECOVERABLE_DIRTY_INVENTORY_EXHAUSTIVE_REQUIRED');
 assert.equal(assessRecoverableDirtyPreservation({
  sourceDirty:true,byteReplay:matched,
  dirtyInventoryExhaustiveAttested:true,
  originalArchiveTarAttested:false,
  secureNonrootCandidateRestoreAttested:true
 }).code,'RECOVERABLE_DIRTY_ORIGINAL_ARCHIVE_TAR_REQUIRED');
 assert.equal(assessRecoverableDirtyPreservation({
  sourceDirty:true,byteReplay:matched,
  dirtyInventoryExhaustiveAttested:true,
  originalArchiveTarAttested:true,
  secureNonrootCandidateRestoreAttested:false
 }).code,'RECOVERABLE_DIRTY_SECURE_NONROOT_RESTORE_REQUIRED');
});

test('RED: complete preservation evidence stays sourceDirty and never authorizes release alone',()=>{
 const r=assessRecoverableDirtyPreservation({
  sourceDirty:true,
  byteReplay:{
   code:'OWNER_DIRTY_BYTE_REPLAY_MATCHED',
   ownerWorkByteReplayVerified:true,
   sourceDirty:true,
   formalCleanPass:false,
   releaseAuthorized:false
  },
  dirtyInventoryExhaustiveAttested:true,
  originalArchiveTarAttested:true,
  secureNonrootCandidateRestoreAttested:true,
  featureScopeOwnerAuthorized:false
 });
 assert.equal(r.code,'VERIFIED_RECOVERABLE_DIRTY_PRESERVATION');
 assert.equal(r.sourceDirty,true);
 assert.equal(r.formalCleanPass,false);
 assert.equal(r.releaseAuthorized,false);
 assert.equal(r.cutoverPermittedByThisModule,false);
 assert.equal(r.deployed,false);
});
