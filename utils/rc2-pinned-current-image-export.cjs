'use strict';
/**
 * Operator-explicit RC2 CURRENT-image archive, never a release/restore decision.
 * Unlike the historical RC1 exporter, this reads owner-private full live IDs
 * from a separately reviewed stage pin; never saves a stale hard-coded tag.
 * No path, image identity, Docker output, or secret appears in status output.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {constants}=fs;
const {spawnSync}=require('node:child_process');
const PIN_NAME='rc2-current-images.private.json';
const ARCHIVE_NAME='rollback-images.tar';
const DIGEST_NAME='SHA256SUMS.private';
const CID=/^[0-9a-f]{64}$/;
const IMAGE=/^sha256:[0-9a-f]{64}$/;
const DOCKER=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const DAEMON=/^[A-Za-z0-9:_-]{8,128}$/;
const MAX_ARCHIVE=8*1024*1024*1024;
function deny(code){throw Error(code);}
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const present=Reflect.ownKeys(o);
 return present.length===keys.length&&keys.every(k=>present.includes(k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function abs(p){return typeof p==='string'&&p.startsWith('/')&&p.length>1&&p.length<1025&&
 path.posix.normalize(p)===p&&!p.endsWith('/')&&!/[\x00-\x1f\x7f]/.test(p);}
function own(st){return typeof process.getuid!=='function'||st.uid===BigInt(process.getuid());}
function privateDirectory(p){
 let s,real,realStat;
 try{s=fs.lstatSync(p,{bigint:true});}catch{deny('RC2_PRIVATE_STAGE_UNSAFE');}
 // Reject a symlink leaf. On macOS, /var/folders resolves through /var -> /private/var;
 // require the same inode after realpath rather than identical path strings.
 try{real=fs.realpathSync(p);realStat=fs.lstatSync(real,{bigint:true});}catch{deny('RC2_PRIVATE_STAGE_UNSAFE');}
 if(!s.isDirectory()||s.isSymbolicLink()||!own(s)||(s.mode&0o777n)!==0o700n||
    !realStat.isDirectory()||realStat.isSymbolicLink()||realStat.dev!==s.dev||
    realStat.ino!==s.ino||!own(realStat)||(realStat.mode&0o777n)!==0o700n)
  deny('RC2_PRIVATE_STAGE_UNSAFE');
 return s;
}
function stable(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
 a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&a.size===b.size;}
function readPrivatePin(stageRoot){
 const file=path.join(stageRoot,PIN_NAME);
 let s,fd;
 try{
  s=fs.lstatSync(file,{bigint:true});
  if(!s.isFile()||s.isSymbolicLink()||!own(s)||s.nlink!==1n||
      (s.mode&0o777n)!==0o600n||s.size<2n||s.size>16384n)deny('RC2_PRIVATE_PIN_UNSAFE');
  fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const a=fs.fstatSync(fd,{bigint:true});
  if(!stable(s,a)||!a.isFile())deny('RC2_PRIVATE_PIN_UNSAFE');
  const bytes=fs.readFileSync(fd);
  const b=fs.fstatSync(fd,{bigint:true}),c=fs.lstatSync(file,{bigint:true});
  if(!stable(a,b)||!stable(b,c)||BigInt(bytes.length)!==b.size)deny('RC2_PRIVATE_PIN_UNSAFE');
  let pin;
  try{pin=JSON.parse(bytes.toString('utf8'));}catch{deny('RC2_PRIVATE_PIN_UNSAFE');}
  if(!exact(pin,['protocol','dockerBinary','dockerDaemonId','containers','ownerExportAuthorized'])||
    pin.protocol!=='DEVPROXY_RC2_PRIVATE_IMAGE_EXPORT_V1'||
    !DOCKER.has(pin.dockerBinary)||!DAEMON.test(pin.dockerDaemonId)||
    pin.ownerExportAuthorized!==true||!Array.isArray(pin.containers)||pin.containers.length!==2)
    deny('RC2_PRIVATE_PIN_UNSAFE');
  for(const [i,role] of ['proxy','api'].entries()){
   const item=pin.containers[i];
   if(!exact(item,['role','containerId','imageId'])||item.role!==role||
      !CID.test(item.containerId)||!IMAGE.test(item.imageId))deny('RC2_PRIVATE_PIN_UNSAFE');
  }
  if(pin.containers[0].containerId===pin.containers[1].containerId||
     pin.containers[0].imageId===pin.containers[1].imageId)deny('RC2_PRIVATE_PIN_UNSAFE');
  return pin;
 }catch(e){if(e?.message==='RC2_PRIVATE_PIN_UNSAFE')throw e;deny('RC2_PRIVATE_PIN_UNSAFE');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function hashRegularFile(file){
 let fd;
 try{
  const a=fs.lstatSync(file,{bigint:true});
  if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||!own(a)||
     (a.mode&0o777n)!==0o600n||a.size<512n||a.size>BigInt(MAX_ARCHIVE))
    deny('RC2_IMAGE_EXPORT_FAILED');
  fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const b=fs.fstatSync(fd,{bigint:true});
  if(!stable(a,b))deny('RC2_IMAGE_EXPORT_FAILED');
  const digest=crypto.createHash('sha256');const buf=Buffer.alloc(1024*1024);let bytes=0;
  while(true){const n=fs.readSync(fd,buf,0,buf.length,null);if(n===0)break;bytes+=n;digest.update(buf.subarray(0,n));}
  const c=fs.fstatSync(fd,{bigint:true});
  if(!stable(b,c)||!stable(c,fs.lstatSync(file,{bigint:true}))||BigInt(bytes)!==c.size)
   deny('RC2_IMAGE_EXPORT_FAILED');
  return digest.digest('hex');
 }catch(e){if(e?.message==='RC2_IMAGE_EXPORT_FAILED')throw e;deny('RC2_IMAGE_EXPORT_FAILED');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function exportPinnedCurrentImages({stageRoot,execute=false,spawnSyncImpl=spawnSync,home=process.env.HOME}={}){
 // The CLI's flags and a true private pin are accident guards, NOT owner authorization.
 if(execute!==true)deny('RC2_OWNER_EXECUTION_REQUIRED');
 if(!abs(stageRoot)||!abs(home)||typeof spawnSyncImpl!=='function'||
   !/^rc2-images-[A-Za-z0-9_-]{4,}$/.test(path.basename(stageRoot))||
   path.basename(path.dirname(stageRoot))!=='private-rollbacks')deny('RC2_PRIVATE_STAGE_UNSAFE');
 privateDirectory(path.dirname(stageRoot));privateDirectory(stageRoot);
 const pin=readPrivatePin(stageRoot);
 const pinStart=fs.lstatSync(path.join(stageRoot,PIN_NAME),{bigint:true});
 if(fs.readdirSync(stageRoot).length!==1)deny('RC2_EXPORT_STAGE_NOT_EMPTY');
 const env=Object.freeze({HOME:home,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'});
 const common=Object.freeze({shell:false,windowsHide:true,timeout:7000,maxBuffer:8192,env,
  encoding:'utf8',stdio:['ignore','pipe','pipe']});
 function query(args){
  let r;
  try{r=spawnSyncImpl(pin.dockerBinary,args,common);}catch{deny('RC2_IMAGE_IDENTITY_MISMATCH');}
  // encoding:'utf8' yields a string; Buffer-only adapters (tests) are also accepted.
  const out=typeof r?.stdout==='string'?r.stdout:Buffer.isBuffer(r?.stdout)?r.stdout.toString('utf8'):null;
  if(r?.error||r?.status!==0||typeof out!=='string'||Buffer.byteLength(out)>8192)
   deny('RC2_IMAGE_IDENTITY_MISMATCH');
  try{return JSON.parse(out.trim());}catch{deny('RC2_IMAGE_IDENTITY_MISMATCH');}
 }
 function verifyLive(){
  if(query(['info','--format','{{json .ID}}'])!==pin.dockerDaemonId)
   deny('RC2_IMAGE_IDENTITY_MISMATCH');
  for(const {containerId,imageId} of pin.containers){
   if(query(['container','inspect','--format','{{json .Id}}',containerId])!==containerId||
      query(['container','inspect','--format','{{json .Image}}',containerId])!==imageId||
      query(['container','inspect','--format','{{json .State.Running}}',containerId])!==true||
      query(['image','inspect','--format','{{json .Id}}',imageId])!==imageId)
    deny('RC2_IMAGE_IDENTITY_MISMATCH');
  }
 }
 verifyLive();
 // Never overwrite another attempt; any incomplete output is quarantined
 // for operator review rather than auto-removed or silently reused.
 let fd;
 try{
  fd=fs.openSync(path.join(stageRoot,ARCHIVE_NAME),constants.O_CREAT|constants.O_EXCL|
    constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  const r=spawnSyncImpl(pin.dockerBinary,['image','save',...pin.containers.map(c=>c.imageId)],{
   shell:false,windowsHide:true,timeout:180000,maxBuffer:8192,env,stdio:['ignore',fd,'pipe']});
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  if(r?.error||r?.status!==0)deny('RC2_IMAGE_EXPORT_FAILED');
 }catch(e){if(e?.message==='RC2_IMAGE_EXPORT_FAILED')throw e;deny('RC2_IMAGE_EXPORT_FAILED');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 verifyLive();
 // Bind the exported bytes to the exact original owner pin, not merely to
 // equivalent JSON that a same-UID process swapped during a slow save.
 const pinEnd=fs.lstatSync(path.join(stageRoot,PIN_NAME),{bigint:true});
 if(!stable(pinStart,pinEnd)||pinStart.mode!==pinEnd.mode||pinStart.uid!==pinEnd.uid||
    pinStart.gid!==pinEnd.gid)deny('RC2_IMAGE_IDENTITY_MISMATCH');
 const sha=hashRegularFile(path.join(stageRoot,ARCHIVE_NAME));
 let sfd;
 try{
  sfd=fs.openSync(path.join(stageRoot,DIGEST_NAME),constants.O_CREAT|constants.O_EXCL|
    constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  fs.writeSync(sfd,sha+'  '+ARCHIVE_NAME+'\n');fs.fsyncSync(sfd);fs.closeSync(sfd);sfd=undefined;
  const d=fs.openSync(stageRoot,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }catch{deny('RC2_IMAGE_EXPORT_FAILED');}
 finally{if(sfd!==undefined)fs.closeSync(sfd);}
 return Object.freeze({code:'RC2_PRIVATE_IMAGE_EXPORT_CREATED_RESTORE_NOT_VERIFIED',
  productionChangeAuthorized:false,deployed:false,restoreVerified:false,
  currentImageIdsRechecked:true,privateArchiveChecksumWritten:true});
}
module.exports={exportPinnedCurrentImages,readPrivatePin,hashRegularFile,privateDirectory};
