'use strict';
/**
 * Source-only, read-only Git blob closure attestation for the exact V118 host
 * worker release. This never launches, stops, stages or authorizes a worker.
 * A MATCH is solely current disk bytes, not loaded-process provenance.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const REVIEWED_COMMIT_SHA='20427efaf372d19f341d39c84e21139e9413a907';
const REVIEWED_WORKER_FILES=Object.freeze([
 ['scripts/rc2-supervised-mac-host-worker.cjs','fefb1f52830cfb52f6836bb8d4875dfbc87e2193'],
 ['utils/rc2-private-host-worker-pin.cjs','7638d841ca773e639ef19105cf112621f477dfa3'],
 ['utils/rc2-exclusive-host-worker-service.cjs','0970e79c87f3aae267abcfcaf3a71371cff9a10c'],
 ['utils/rc2-pending-host-worker.cjs','6a084d5f697e999219de5bd078032cbe8fde1536'],
 ['utils/rc2-mac-host-worker.cjs','b2d51f9fd76e0df9d0ca9a7cc96188e94cedae9f'],
 ['utils/rc2-cross-process-settlement.cjs','280132577d9ac28e7abb269c5279dc3d3c005bd7'],
 ['utils/rc1-host-mount-locked-docker-driver.cjs','81f355438fd83702d75cc22e7dc864e72af183bd'],
 ['utils/rc1-route-candidate-manifest.cjs','ee8318c2f86a3db5158916c29b9317f88c196e1a'],
 ['utils/rc1-content-bound-activation-request.cjs','d032a3ca9f8590321ef15ef992b0374b2c9c04fe'],
 ['utils/rc1-activation-spool.cjs','c8b52ac9bda93cbef5fa2fb667e13d48f876be17'],
 ['utils/rc1-two-phase-host-settlement.cjs','453c821489e188c9a4d9b601b8b606cfeb7e0e6b'],
 ['utils/host-execfile-adapter.cjs','6ac7f96934fd0cc89c3bc03eaf424b741cc609a4']
].map(([name,blob])=>Object.freeze({path:name,gitBlobSha:blob})));
const RESULT_FIELDS=Object.freeze({readOnly:true,productionChangeAuthorized:false,
 ownerApprovalGranted:false,runningProcessAttested:false,productStageModified:false,
 launchAgentInstalled:false,requiresOwnerGrant:true});
function outcome(code){return Object.freeze({code,...RESULT_FIELDS});}
function exactFields(value,fields){
 try{return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===fields.length&&
  fields.every(name=>{const d=Object.getOwnPropertyDescriptor(value,name);
    return d&&Object.hasOwn(d,'value');});}catch{return false;}
}
function isPath(p){return typeof p==='string'&&p.length>1&&p.length<1024&&
 p.startsWith('/')&&p!=='/'&&!p.endsWith('/')&&path.posix.normalize(p)===p&&
 !/[\x00-\x1f\x7f]/.test(p);}
function validManifest(rows){
 if(!Array.isArray(rows)||rows.length===0||rows.length>32)return false;
 const seen=new Set();
 return rows.every(row=>{
  if(!exactFields(row,['path','gitBlobSha']))return false;
  const name=row.path,blob=row.gitBlobSha;
  if(typeof name!=='string'||!/^(?:scripts|utils)\/[a-z0-9][a-z0-9-]*\.cjs$/.test(name)||
    typeof blob!=='string'||!/^[a-f0-9]{40}$/.test(blob)||seen.has(name))return false;
  seen.add(name);return true;
 });
}
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.uid===b.uid&&
 a.gid===b.gid&&a.mode===b.mode&&a.nlink===b.nlink&&a.size===b.size&&
 a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function owner(st){return typeof process.getuid!=='function'||
 st.uid===0n||st.uid===BigInt(process.getuid());}
async function checkedDir(directory){
 const a=await fs.lstat(directory,{bigint:true});
 // Root-owned + sticky 01777 is accepted for /tmp-style ancestors only.
 const writable=(a.mode&0o022n)!==0n;
 const stickyRoot=a.uid===0n&&(a.mode&0o1777n)===0o1777n;
 if(!a.isDirectory()||a.isSymbolicLink()||!owner(a)||
    (writable&&!stickyRoot)||await fs.realpath(directory)!==directory)
    throw Error('UNTRUSTED_RELEASE_DIRECTORY');
 const b=await fs.lstat(directory,{bigint:true});
 if(!same(a,b))throw Error('CHANGED_RELEASE_DIRECTORY');
 return a;
}
function directoriesFor(root,rows){
 const paths=new Set(['/']);
 function add(full){let part='/';for(const name of full.split('/').filter(Boolean)){
   part=path.posix.join(part,name);paths.add(part);
 }}
 add(root);
 for(const row of rows)add(path.posix.dirname(path.posix.join(root,row.path)));
 return [...paths].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
}
async function checkedFile(filename,expected){
 const a=await fs.lstat(filename,{bigint:true});
 if(!a.isFile()||a.isSymbolicLink()||!owner(a)||a.nlink!==1n||
   (a.mode&0o022n)!==0n||a.size<1n||a.size>1048576n)
   throw Error('UNSAFE_RELEASE_FILE');
 const fd=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await fd.stat({bigint:true});
  if(!same(a,before)||!before.isFile())throw Error('UNSAFE_RELEASE_FILE');
  const bytes=await fd.readFile();
  const after=await fd.stat({bigint:true});
  const named=await fs.lstat(filename,{bigint:true});
  if(!same(before,after)||!same(after,named)||bytes.length!==Number(after.size))
   throw Error('CHANGED_RELEASE_FILE');
  return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')===expected;
 }finally{await fd.close();}
}
async function inspect(root,rows,{testOnly=false}={}){
 if(!isPath(root)||!validManifest(rows))return outcome('WORKER_CLOSURE_UNVERIFIED');
 try{
  const dirs=directoriesFor(root,rows);
  const before=[];
  for(const name of dirs)before.push(await checkedDir(name));
  let matching=true;
  for(const item of rows){
   if(!await checkedFile(path.posix.join(root,item.path),item.gitBlobSha))matching=false;
  }
  for(let i=0;i<dirs.length;i++){
   const again=await checkedDir(dirs[i]);
   if(!same(again,before[i]))throw Error('CHANGED_RELEASE_DIRECTORY');
  }
  return outcome(testOnly?(matching?'TEST_ONLY_WORKER_CLOSURE_MATCH':'TEST_ONLY_WORKER_CLOSURE_MISMATCH'):
   (matching?'REVIEWED_WORKER_CLOSURE_MATCH_SOURCE_ONLY':'REVIEWED_WORKER_CLOSURE_MISMATCH'));
 }catch{return outcome('WORKER_CLOSURE_UNSAFE');}
}
async function inspectReviewedWorkerReleaseClosure(input={}){
 if(!exactFields(input,['approvedRoot','reviewedCommitSha']))return outcome('WORKER_CLOSURE_UNVERIFIED');
 if(input.reviewedCommitSha!==REVIEWED_COMMIT_SHA)return outcome('WORKER_CLOSURE_UNVERIFIED');
 return inspect(input.approvedRoot,REVIEWED_WORKER_FILES);
}
async function inspectTestOnlyWorkerReleaseClosure(input={}){
 if(!exactFields(input,['approvedRoot','reviewedFiles']))return outcome('WORKER_CLOSURE_UNVERIFIED');
 return inspect(input.approvedRoot,input.reviewedFiles,{testOnly:true});
}
module.exports={inspectReviewedWorkerReleaseClosure,inspectTestOnlyWorkerReleaseClosure,
 REVIEWED_WORKER_FILES,REVIEWED_COMMIT_SHA};
