#!/usr/bin/env node
'use strict';
/** LOCAL OPERATOR READ-ONLY EVIDENCE: never extract, fix mtimes, deploy or print paths. */
const {readPrivateConfigManifest,verifyOriginalConfigArchiveHash,verifyRestoredConfigContents}=
 require('../utils/rc2-restore-content-attestation.cjs');
const argv=process.argv.slice(2);
function execute(){
 if(argv.length!==7&&argv.length!==9)return {code:'INVALID_OPERATOR_ARGS'};
 const keys=['--inspect','--manifest','--extract-root','--expected-routes'];
 if(argv[0]!==keys[0]||argv[1]!==keys[1]||argv[3]!==keys[2])return {code:'INVALID_OPERATOR_ARGS'};
 const hasLive=argv.length===9;
 if(hasLive&&argv[5]!=='--live-root')return {code:'INVALID_OPERATOR_ARGS'};
 const offset=hasLive?2:0;
 if(argv[5+offset]!==keys[3]||!/^\d{1,4}$/.test(argv[6+offset]))return {code:'INVALID_OPERATOR_ARGS'};
 const manifest=readPrivateConfigManifest(argv[2]);
 if(!manifest)return {code:'PRIVATE_MANIFEST_UNSAFE'};
 if(!verifyOriginalConfigArchiveHash(require('node:path').dirname(argv[2])))return {code:'PRIVATE_ARCHIVE_UNVERIFIED'};
 const evidence=verifyRestoredConfigContents({
  manifest,extractRoot:argv[4],liveRoot:hasLive?argv[6]:undefined,
  expectedRoutes:Number(argv[6+offset])
 });
 return evidence;
}
const r=execute();
const code=typeof r.code==='string'&&/^[A-Z_]+$/.test(r.code)?r.code:'RESTORE_EVIDENCE_UNAVAILABLE';
const count=Number.isInteger(r.filesVerified)?r.filesVerified:0;
const routes=Number.isInteger(r.routesVerified)?r.routesVerified:0;
process.stdout.write(code+'; files='+count+'; routes='+routes+
 '; SOURCE_CURRENT_UNKNOWN; OWNER_WORK_UNKNOWN; NO_DEPLOY\n');
process.exitCode=r.restoredFilesVerified===true&&r.liveIncludedFilesMatch===true&&
 r.code==='RESTORED_FILES_VERIFIED_LIVE_INCLUDED_MATCH'?0:
 r.restoredFilesVerified===true?3:2;
