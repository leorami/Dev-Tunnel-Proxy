#!/usr/bin/env node
'use strict';
/** Exact owner-only operator invocation, not authority to restore or deploy. */
const {exportPinnedCurrentImages}=require('../utils/rc2-pinned-current-image-export.cjs');
const argv=process.argv.slice(2);
if(argv.length!==3||argv[0]!=='--execute'||argv[1]!=='--owner-approved'){
 process.stderr.write('RC2_OWNER_EXECUTION_REQUIRED; NO_EXPORT; NO_DEPLOY\n');process.exitCode=2;
}else{
 try{const r=exportPinnedCurrentImages({stageRoot:argv[2],execute:true});
  process.stdout.write(r.code+'; NO_RESTORE; NO_DEPLOY\n');
 }catch(e){
  const code=typeof e?.message==='string'&&/^RC2_[A-Z_]+$/.test(e.message)?e.message:'RC2_IMAGE_EXPORT_FAILED';
  process.stderr.write(code+'; NO_DEPLOY\n');process.exitCode=2;
 }
}
