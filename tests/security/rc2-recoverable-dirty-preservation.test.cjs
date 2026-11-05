'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessRecoverableDirtyPreservation}=require('../../utils/rc2-recoverable-dirty-preservation.cjs');

test('module loads and denies forged clean promotion',()=>{
 const r=assessRecoverableDirtyPreservation({
  sourceDirty:false,
  byteReplay:{
   code:'OWNER_DIRTY_BYTE_REPLAY_MATCHED',
   ownerWorkByteReplayVerified:true,
   sourceDirty:true,
   formalCleanPass:false,
   releaseAuthorized:false
  },
  dirtyInventoryExhaustiveAttested:true,
  originalArchiveTarAttested:true,
  secureNonrootCandidateRestoreAttested:true
 });
 assert.equal(r.code,'RECOVERABLE_DIRTY_PRESERVATION_REQUIRES_DIRTY_TRUE');
 assert.equal(r.formalCleanPass,false);
});
