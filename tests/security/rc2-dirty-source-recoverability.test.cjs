'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyDirtySourceRecoverability}=require('../../utils/rc2-dirty-source-recoverability.cjs');
test('RED: all dirty paths covered by archive+supplement is recoverable but never formal clean or GO',()=>{
 const r=classifyDirtySourceRecoverability({
  sourceDirty:true,
  dirtyRelativePaths:['docker-compose.yml','smart-build.sh','.cursor/rules/x.mdc'],
  archivedMatches:[{path:'docker-compose.yml',sha256:'a'.repeat(64)}],
  supplementMatches:[
   {path:'smart-build.sh',sha256:'b'.repeat(64)},
   {path:'.cursor/rules/x.mdc',sha256:'c'.repeat(64)}
  ]
 });
 assert.equal(r.code,'VERIFIED_RECOVERABLE_DIRTY_SOURCE');
 assert.equal(r.sourceDirty,true);
 assert.equal(r.recoverable,true);
 assert.equal(r.formalCleanPass,false);
 assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.deployed,false);
 assert.equal(r.ownerWorkPreserved,'PARTIAL_PRIVATE_ARCHIVE_AND_SUPPLEMENT');
});
test('RED: any unaccounted dirty path blocks recoverability claims',()=>{
 const r=classifyDirtySourceRecoverability({
  sourceDirty:true,
  dirtyRelativePaths:['apps/secret.conf','docker-compose.yml'],
  archivedMatches:[{path:'docker-compose.yml',sha256:'a'.repeat(64)}],
  supplementMatches:[]
 });
 assert.equal(r.code,'DIRTY_OWNER_PATHS_UNACCOUNTED');
 assert.equal(r.recoverable,false);
 assert.equal(r.unaccountedCount,1);
 assert.equal(r.formalCleanPass,false);
});
test('RED: never invents sourceDirty false from recoverable dirty evidence',()=>{
 const r=classifyDirtySourceRecoverability({
  sourceDirty:true,
  dirtyRelativePaths:['a'],
  archivedMatches:[{path:'a',sha256:'d'.repeat(64)}],
  supplementMatches:[]
 });
 assert.equal(r.sourceDirty,true);
 assert.equal(r.formalCleanPass,false);
});
test('RED: path traversal and bad hashes fail closed',()=>{
 assert.equal(classifyDirtySourceRecoverability({
  sourceDirty:true,dirtyRelativePaths:['../etc/passwd'],archivedMatches:[],supplementMatches:[]
 }).code,'DIRTY_RECOVERY_INPUT_INVALID');
 assert.equal(classifyDirtySourceRecoverability({
  sourceDirty:true,dirtyRelativePaths:['a'],
  archivedMatches:[{path:'a',sha256:'nope'}],supplementMatches:[]
 }).code,'DIRTY_RECOVERY_INPUT_INVALID');
});
