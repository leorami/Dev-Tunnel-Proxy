#!/usr/bin/env node
'use strict';
/**
 * Read-only private owner-work reconstruction check. This command cannot
 * attest that the Git dirty inventory is exhaustive or that the recovered
 * bytes came from the original tar. It is NOT a cutover authorization.
 */
const fs=require('node:fs');
const path=require('node:path');
const {verifyOwnerDirtyByteReplay}=require('../utils/rc2-owner-dirty-byte-replay.cjs');
const LIMIT=256*1024;
const REQUIRED=['sourceDirty','sourceHead','expectedDirtyCount','dirtyFiles',
 'archiveDirtyPaths','supplementDirtyPaths','liveRoot','archiveRestoreRoot','privateSupplementRoot'];
function privateDir(folder){
 const a=fs.lstatSync(folder,{bigint:true}),real=fs.realpathSync(folder),b=fs.lstatSync(real,{bigint:true});
 return a.isDirectory()&&!a.isSymbolicLink()&&(a.mode&0o777n)===0o700n&&
   a.dev===b.dev&&a.ino===b.ino&&
   (typeof process.getuid!=='function'||a.uid===BigInt(process.getuid()));
}
function stable(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
 a.size===b.size&&a.mode===b.mode&&a.ctimeNs===b.ctimeNs&&a.mtimeNs===b.mtimeNs;}
function readPlan(planPath){
 if(typeof planPath!=='string'||!path.isAbsolute(planPath)||path.normalize(planPath)!==planPath||
    path.basename(planPath)!=='plan.private.json'||planPath.length>2048||
    path.basename(path.dirname(path.dirname(planPath)))!=='private-rollbacks'||
    !/^owner-replay-[a-zA-Z0-9_-]{4,}$/.test(path.basename(path.dirname(planPath))))return null;
 const parent=path.dirname(path.dirname(planPath)),stage=path.dirname(planPath);
 if(!privateDir(parent)||!privateDir(stage))return null;
 let fd;
 try{
  const a=fs.lstatSync(planPath,{bigint:true});
  if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||(a.mode&0o777n)!==0o600n||
     a.size<2n||a.size>BigInt(LIMIT)||
     (typeof process.getuid==='function'&&a.uid!==BigInt(process.getuid())))return null;
  fd=fs.openSync(planPath,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  const b=fs.fstatSync(fd,{bigint:true});if(!stable(a,b))return null;
  const bytes=fs.readFileSync(fd);
  if(!stable(b,fs.fstatSync(fd,{bigint:true}))||
     !stable(b,fs.lstatSync(planPath,{bigint:true}))||BigInt(bytes.length)!==b.size)return null;
  const value=JSON.parse(bytes.toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.getPrototypeOf(value)!==Object.prototype||
     Reflect.ownKeys(value).length!==REQUIRED.length||
     REQUIRED.some(k=>!Object.hasOwn(value,k)))return null;
  return value;
 }catch{return null;}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}
}
function run(argv){
 if(argv.length!==3||argv[0]!=='--inspect'||argv[1]!=='--plan'){
  process.stdout.write('OWNER_DIRTY_BYTE_REPLAY_BLOCKED filesVerified=0\n');return 2;
 }
 const input=readPlan(argv[2]);
 if(!input){process.stdout.write('OWNER_DIRTY_BYTE_REPLAY_BLOCKED filesVerified=0\n');return 2;}
 const result=verifyOwnerDirtyByteReplay(input);
 if(result.code!=='OWNER_DIRTY_BYTE_REPLAY_MATCHED'||result.ownerWorkByteReplayVerified!==true){
  process.stdout.write('OWNER_DIRTY_BYTE_REPLAY_BLOCKED filesVerified=0\n');return 2;
 }
 // No owner paths, SHA, staging details, secrets or provenance assertions.
 process.stdout.write('OWNER_DIRTY_BYTE_REPLAY_MATCHED filesVerified='+result.filesVerified+
  ' archived='+result.archivedDirtyCount+' supplemented='+result.supplementDirtyCount+
  ' sourceDirty=true formalCleanPass=false releaseAuthorized=false\n');
 return 0;
}
if(require.main===module)process.exitCode=run(process.argv.slice(2));
module.exports={readPlan,run};
