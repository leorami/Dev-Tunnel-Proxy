'use strict';
/** Source-only, READ-ONLY verification of existing RC1 private config snapshot.
 * Checks its source inventory and tar integrity; does NOT restore or attest
 * live source identity, runtime, user work, nginx, Docker or deployment.
 */
const fs=require('node:fs');
const path=require('node:path');
const {constants}=fs;
const {hashRegularFile,privateDirectory}=require('./rc2-pinned-current-image-export.cjs');
const MAX_MANIFEST=2*1024*1024;
const HEX64=/^[0-9a-f]{64}$/;
const blocked=()=>Object.freeze({code:'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED',
 archiveHashMatches:false,sessionModePrivate:false,routeFilesRecorded:0,
 productionChangeAuthorized:false,deployed:false,restoreVerified:false,
 sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN'});
function exact(o,keys){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&
 Reflect.ownKeys(o).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));}
function strictRead(file,max){
 let fd;
 try{
  const a=fs.lstatSync(file,{bigint:true});
  if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||(a.mode&0o777n)!==0o600n||
    (typeof process.getuid==='function'&&a.uid!==BigInt(process.getuid()))||
    a.size<2n||a.size>BigInt(max))return null;
  fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const b=fs.fstatSync(fd,{bigint:true});
  if(b.dev!==a.dev||b.ino!==a.ino||b.size!==a.size||b.mtimeNs!==a.mtimeNs)return null;
  const data=fs.readFileSync(fd);
  const c=fs.fstatSync(fd,{bigint:true}),d=fs.lstatSync(file,{bigint:true});
  if(c.dev!==b.dev||c.ino!==b.ino||c.size!==b.size||c.mtimeNs!==b.mtimeNs||
     d.dev!==c.dev||d.ino!==c.ino||d.size!==c.size||d.mtimeNs!==c.mtimeNs||
     BigInt(data.length)!==c.size)return null;
  return data.toString('utf8');
 }catch{return null;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function goodPath(v){return typeof v==='string'&&v.length>0&&v.length<=512&&
 !v.startsWith('/')&&!v.endsWith('/')&&!v.includes('\\')&&
 !/[\x00-\x1f\x7f]/.test(v)&&path.posix.normalize(v)===v&&
 v.split('/').every(x=>x!=='.'&&x!=='..'&&x!=='' );}
function validManifest(o,count){
 if(!exact(o,['version','sourceRoot','sourceHead','sourceDirty','composePresent','fileCount','bytes','files'])||
   o.version!==2||!/^\/[\x20-\x7e]{1,1023}$/.test(o.sourceRoot)||
   !/^[a-f0-9]{40}$/.test(o.sourceHead)||o.sourceDirty!==false||
   !exact(o.composePresent,['yml','override','production'])||o.composePresent.yml!==true||
   !Number.isSafeInteger(o.fileCount)||o.fileCount<1||o.fileCount>100000||
   !Number.isSafeInteger(o.bytes)||o.bytes<1||o.bytes>8*1024*1024*1024||
   !Array.isArray(o.files)||o.files.length!==o.fileCount)return false;
 const seen=new Set(),fileMap=new Map();let sum=0;
 for(const item of o.files){
  if(!exact(item,['path','bytes','mode','mtimeMs','sha256'])||!goodPath(item.path)||seen.has(item.path)||
    !Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>8*1024*1024*1024||
    !Number.isSafeInteger(item.mode)||item.mode<0||item.mode>0o777||
    !Number.isFinite(item.mtimeMs)||!HEX64.test(item.sha256))return false;
  seen.add(item.path);fileMap.set(item.path,item);sum+=item.bytes;
 }
 if(sum!==o.bytes)return false;
 for(const p of ['docker-compose.yml','config/default.conf',
  'build/sites-enabled/apps.generated.conf','.artifacts/admin-session.json']){
  if(!fileMap.has(p))return false;
 }
 if(fileMap.get('.artifacts/admin-session.json').mode!==0o600)return false;
 const env=o.files.filter(x=>/^\.env(?:\.[A-Za-z0-9_-]+)?$/.test(x.path));
 if(env.length<1||env.some(x=>x.mode!==0o600))return false;
 const routes=o.files.filter(x=>/^apps\/[^/]+\.conf$/.test(x.path));
 return routes.length===count;
}
function inspectPrivateConfigArchive({stageRoot,expectedRouteCount}={}){
 try{
  if(typeof stageRoot!=='string'||!path.isAbsolute(stageRoot)||
    path.normalize(stageRoot)!==stageRoot||stageRoot==='/'||stageRoot.endsWith('/')||
    !/^config-[A-Za-z0-9_-]{4,}$/.test(path.basename(stageRoot))||
    path.basename(path.dirname(stageRoot))!=='private-rollbacks'||
    !Number.isSafeInteger(expectedRouteCount)||expectedRouteCount<1||expectedRouteCount>1000)return blocked();
  privateDirectory(path.dirname(stageRoot));privateDirectory(stageRoot);
  const names=fs.readdirSync(stageRoot).sort();
  if(JSON.stringify(names)!==JSON.stringify(['SHA256SUMS.private','config-state.tar','manifest.private.json']))return blocked();
  const sum=strictRead(path.join(stageRoot,'SHA256SUMS.private'),128);
  const match=/^([a-f0-9]{64})  config-state\.tar\n$/.exec(sum||'');
  if(!match)return blocked();
  const archiveSha=hashRegularFile(path.join(stageRoot,'config-state.tar'));
  if(archiveSha!==match[1])return blocked();
  const raw=strictRead(path.join(stageRoot,'manifest.private.json'),MAX_MANIFEST);
  if(raw===null)return blocked();
  let manifest;try{manifest=JSON.parse(raw);}catch{return blocked();}
  if(!validManifest(manifest,expectedRouteCount))return blocked();
  return Object.freeze({code:'RC2_CONFIG_ARCHIVE_CHECKSUM_MATCHES_RESTORE_NOT_VERIFIED',
   archiveHashMatches:true,sessionModePrivate:true,routeFilesRecorded:expectedRouteCount,
   productionChangeAuthorized:false,deployed:false,restoreVerified:false,
   sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN'});
 }catch{return blocked();}
}
module.exports={inspectPrivateConfigArchive};
