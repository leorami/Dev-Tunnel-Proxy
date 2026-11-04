'use strict';
/**
 * RC2: read-only attestation of every file in an already-extracted PRIVATE config
 * archive. Separates byte-accurate restore from git dirty-state / live UAT.
 * NOT a tar extractor, not a Docker/host action, never a production release GO.
 * Responses contain only fixed codes/counts, NEVER owner paths or file content.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {constants}=fs;
const MAX_NODES=100000,MAX_BYTES=8*1024*1024*1024,MAX_PATH=1024;
const SHA=/^[a-f0-9]{64}$/;
function result(code,restoredFilesVerified=false,liveIncludedFilesMatch=null,filesVerified=0,routesVerified=0){
 return Object.freeze({code,restoredFilesVerified,liveIncludedFilesMatch,filesVerified,routesVerified,
  sourceCurrent:'UNKNOWN',ownerWorkPreserved:'UNKNOWN',restoreVerified:false,
  releaseAuthorized:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false});
}
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const actual=Reflect.ownKeys(o);
 return actual.length===keys.length&&keys.every(k=>Object.hasOwn(o,k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function safeRelative(rel){return typeof rel==='string'&&rel.length>0&&rel.length<=MAX_PATH&&
  !rel.startsWith('/')&&!rel.endsWith('/')&&!rel.includes('\\')&&
  !/[\x00-\x1f\x7f]/.test(rel)&&path.posix.normalize(rel)===rel&&
  rel.split('/').every(p=>p.length>0&&p!=='.'&&p!=='..');}
function validateManifest(m,expectedRoutes){
 if(!exact(m,['version','sourceRoot','sourceHead','sourceDirty','composePresent','fileCount','bytes','files'])||
   m.version!==2||typeof m.sourceRoot!=='string'||!path.isAbsolute(m.sourceRoot)||
   m.sourceRoot.length>1024||!/^\/[\x20-\x7e]{1,1023}$/.test(m.sourceRoot)||
   !/^[0-9a-f]{40}$/.test(m.sourceHead)||typeof m.sourceDirty!=='boolean'||
   !exact(m.composePresent,['yml','override','production'])||m.composePresent.yml!==true||
   typeof m.composePresent.override!=='boolean'||typeof m.composePresent.production!=='boolean'||
   !Number.isInteger(expectedRoutes)||expectedRoutes<1||expectedRoutes>1000||
   !Number.isSafeInteger(m.fileCount)||m.fileCount<1||m.fileCount>MAX_NODES||
   !Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>MAX_BYTES||
   !Array.isArray(m.files)||m.files.length!==m.fileCount)return null;
 const paths=new Set();let bytes=0,routes=0,envCount=0;
 for(const f of m.files){
  if(!exact(f,['path','bytes','mode','mtimeMs','sha256'])||!safeRelative(f.path)||
   paths.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>MAX_BYTES||
   !Number.isInteger(f.mode)||f.mode<0||f.mode>0o777||
   !Number.isFinite(f.mtimeMs)||f.mtimeMs<0||!SHA.test(f.sha256))return null;
  paths.add(f.path);bytes+=f.bytes;
  if(/^apps\/[^/]+\.conf$/.test(f.path))routes++;
  if(/^\.env(?:\.[A-Za-z0-9_-]+)?$/.test(f.path)){
   if(f.mode!==0o600)return null;envCount++;
  }
 }
 if(bytes!==m.bytes||routes!==expectedRoutes||envCount===0)return null;
 for(const p of ['docker-compose.yml','config/default.conf','build/sites-enabled/apps.generated.conf','.artifacts/admin-session.json'])
  if(!paths.has(p))return null;
 if(m.files.find(f=>f.path==='.artifacts/admin-session.json').mode!==0o600)return null;
 return {paths,routes};
}
function safeRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root)||path.normalize(root)!==root||root==='/'||root.endsWith('/')||root.length>2048)
  throw Error('UNSAFE_ROOT');
 const before=fs.lstatSync(root,{bigint:true}),real=fs.realpathSync(root);
 const after=fs.lstatSync(real,{bigint:true});
 if(!before.isDirectory()||before.isSymbolicLink()||!after.isDirectory()||after.isSymbolicLink()||
    before.dev!==after.dev||before.ino!==after.ino||
    (typeof process.getuid==='function'&&before.uid!==BigInt(process.getuid())))throw Error('UNSAFE_ROOT');
 return root;
}
function stable(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
 a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&a.mode===b.mode;}
function regularNode(root,rel){
 let current=root;
 const parts=rel.split('/');
 for(let i=0;i<parts.length;i++){
  current=path.join(current,parts[i]);
  const s=fs.lstatSync(current,{bigint:true});
  if(s.isSymbolicLink())throw Error('UNSAFE_NODE');
  if(i===parts.length-1){
   if(!s.isFile()||s.nlink!==1n||(typeof process.getuid==='function'&&s.uid!==BigInt(process.getuid())))
    throw Error('UNSAFE_NODE');
  }else if(!s.isDirectory())throw Error('UNSAFE_NODE');
 }
 return current;
}
function validateOne(root,f){
 let fd;
 try{
  const p=regularNode(root,f.path),before=fs.lstatSync(p,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||
     before.size!==BigInt(f.bytes)||(before.mode&0o777n)!==BigInt(f.mode))return 'CONTENT';
  fd=fs.openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const started=fs.fstatSync(fd,{bigint:true});
  if(!stable(before,started))return 'CONTENT';
  const hash=crypto.createHash('sha256');const buf=Buffer.alloc(1024*1024);let nTotal=0;
  for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(n===0)break;
   nTotal+=n;if(nTotal>f.bytes)return 'CONTENT';hash.update(buf.subarray(0,n));}
  const ended=fs.fstatSync(fd,{bigint:true}),latest=fs.lstatSync(p,{bigint:true});
  if(!stable(started,ended)||!stable(ended,latest)||nTotal!==f.bytes||hash.digest('hex')!==f.sha256)
   return 'CONTENT';
  if(Math.abs(Number(ended.mtimeNs)/1e6-f.mtimeMs)>1.01)return 'MTIME';
  return 'OK';
 }catch{return 'CONTENT';}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function scanNodes(root){
 const files=new Set(),todo=[{abs:root,prefix:''}];let nodes=0;
 while(todo.length){
  const {abs,prefix}=todo.pop();
  for(const name of fs.readdirSync(abs)){
   const rel=prefix?prefix+'/'+name:name;
   if(!safeRelative(rel))throw Error('UNSAFE_SCAN_NODE');
   const target=path.join(abs,name),s=fs.lstatSync(target,{bigint:true});nodes++;
   if(nodes>MAX_NODES||s.isSymbolicLink())throw Error('UNSAFE_SCAN_NODE');
   if(s.isDirectory())todo.push({abs:target,prefix:rel});
   else if(s.isFile()&&s.nlink===1n)files.add(rel);
   else throw Error('UNSAFE_SCAN_NODE');
  }
 }
 return files;
}
/** Fully snapshotted owner-data directories must not gain unarchived files. */
function verifyLiveScopedInventory(liveRoot,expectedPaths){
 for(const scope of ['apps','overrides','config','build/sites-enabled']){
  const expected=new Set([...expectedPaths].filter(p=>p.startsWith(scope+'/')).map(p=>p.slice(scope.length+1)));
  const absolute=path.join(liveRoot,...scope.split('/'));
  let stat;
  try{stat=fs.lstatSync(absolute,{bigint:true});}
  catch(e){if(e?.code==='ENOENT'&&expected.size===0)continue;return false;}
  if(!stat.isDirectory()||stat.isSymbolicLink())return false;
  let actual;
  try{actual=scanNodes(absolute);}catch{return false;}
  if(actual.size!==expected.size)return false;
  for(const rel of actual)if(!expected.has(rel))return false;
 }
 return true;
}
function verifyRestoredConfigContents({extractRoot,liveRoot,manifest,expectedRoutes}={}){
 const valid=validateManifest(manifest,expectedRoutes);
 if(!valid)return result('RESTORE_MANIFEST_INVALID');
 let extracted;
 try{extracted=safeRoot(extractRoot);}catch{return result('RESTORED_ROOT_UNSAFE');}
 let found;
 try{found=scanNodes(extracted);}catch{return result('RESTORED_UNSAFE_NODE');}
 for(const name of found)if(!valid.paths.has(name))return result('RESTORED_UNLISTED_NODE');
 if(found.size!==valid.paths.size)return result('RESTORED_MISSING_NODE');
 let filesVerified=0;
 for(const f of manifest.files){
  const check=validateOne(extracted,f);
  if(check==='CONTENT')return result('RESTORED_CONTENT_MISMATCH');
  if(check==='MTIME')return result('RESTORED_MTIME_PRECEDENCE_UNVERIFIED');
  filesVerified++;
 }
 let liveEqual=null;
 if(liveRoot!==undefined&&liveRoot!==null){
  let live;
  try{live=safeRoot(liveRoot);}catch{return result('LIVE_ROOT_UNSAFE',true,false,filesVerified,valid.routes);}
  liveEqual=true;
  for(const f of manifest.files){if(validateOne(live,f)!=='OK'){liveEqual=false;break;}}
  if(!liveEqual)return result('LIVE_INCLUDED_FILES_DIFFER_FROM_SNAPSHOT',true,false,filesVerified,valid.routes);
  if(!verifyLiveScopedInventory(live,valid.paths))
   return result('LIVE_OWNER_DATA_NOT_IN_SNAPSHOT',true,false,filesVerified,valid.routes);
 }
 const code=manifest.sourceDirty?'RESTORED_FILES_VERIFIED_DIRTY_SOURCE_UNACCOUNTED':
  liveEqual===true?'RESTORED_FILES_VERIFIED_LIVE_INCLUDED_MATCH':'RESTORED_FILES_VERIFIED_OFFLINE_ONLY';
 return result(code,true,liveEqual,filesVerified,valid.routes);
}
module.exports={verifyRestoredConfigContents};
/** Safely load the existing owner-private RC1 v2 manifest. No archive extraction. */
function readPrivateConfigManifest(manifestPath){
 let fd;
 try{
  if(typeof manifestPath!=='string'||!path.isAbsolute(manifestPath)||
     path.normalize(manifestPath)!==manifestPath||path.basename(manifestPath)!=='manifest.private.json'||
     !/^config-[A-Za-z0-9_-]{4,}$/.test(path.basename(path.dirname(manifestPath)))||
     path.basename(path.dirname(path.dirname(manifestPath)))!=='private-rollbacks')return null;
  const parent=path.dirname(path.dirname(manifestPath)),stage=path.dirname(manifestPath);
  for(const dir of [parent,stage]){
   const a=fs.lstatSync(dir,{bigint:true}),b=fs.lstatSync(fs.realpathSync(dir),{bigint:true});
   if(!a.isDirectory()||a.isSymbolicLink()||(a.mode&0o777n)!==0o700n||
      a.dev!==b.dev||a.ino!==b.ino||
      (typeof process.getuid==='function'&&a.uid!==BigInt(process.getuid())))return null;
  }
  const stat=fs.lstatSync(manifestPath,{bigint:true});
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||
     (stat.mode&0o777n)!==0o600n||stat.size<2n||stat.size>2n*1024n*1024n||
     (typeof process.getuid==='function'&&stat.uid!==BigInt(process.getuid())))return null;
  fd=fs.openSync(manifestPath,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const before=fs.fstatSync(fd,{bigint:true});if(!stable(stat,before))return null;
  const contents=fs.readFileSync(fd);const after=fs.fstatSync(fd,{bigint:true});
  if(!stable(before,after)||!stable(after,fs.lstatSync(manifestPath,{bigint:true}))||
     BigInt(contents.length)!==after.size)return null;
  const decoded=JSON.parse(contents.toString('utf8'));
  return decoded&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded:null;
 }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports.readPrivateConfigManifest=readPrivateConfigManifest;
/** This separately verifies the ORIGINAL tar's private checksum without extracting. */
function verifyOriginalConfigArchiveHash(stageRoot){
 try{
  if(typeof stageRoot!=='string'||!path.isAbsolute(stageRoot)||
     path.normalize(stageRoot)!==stageRoot||
     !/^config-[A-Za-z0-9_-]{4,}$/.test(path.basename(stageRoot))||
     path.basename(path.dirname(stageRoot))!=='private-rollbacks')return false;
  for(const dir of [path.dirname(stageRoot),stageRoot]){
   const a=fs.lstatSync(dir,{bigint:true}),b=fs.lstatSync(fs.realpathSync(dir),{bigint:true});
   if(!a.isDirectory()||a.isSymbolicLink()||(a.mode&0o777n)!==0o700n||
      a.dev!==b.dev||a.ino!==b.ino||
      (typeof process.getuid==='function'&&a.uid!==BigInt(process.getuid())))return false;
  }
  const entries=fs.readdirSync(stageRoot).sort();
  if(JSON.stringify(entries)!==JSON.stringify(['SHA256SUMS.private','config-state.tar','manifest.private.json']))return false;
  function openPrivate(file,min,max){
   const a=fs.lstatSync(file,{bigint:true});
   if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||
      (a.mode&0o777n)!==0o600n||a.size<BigInt(min)||a.size>BigInt(max)||
      (typeof process.getuid==='function'&&a.uid!==BigInt(process.getuid())))return null;
   const fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   const b=fs.fstatSync(fd,{bigint:true});
   if(!stable(a,b)){fs.closeSync(fd);return null;}
   return {fd,b};
  }
  const sumPath=path.join(stageRoot,'SHA256SUMS.private');
  const sumFd=openPrivate(sumPath,70,128);if(!sumFd)return false;
  let sum;
  try{
   sum=fs.readFileSync(sumFd.fd).toString('utf8');
   if(!stable(sumFd.b,fs.fstatSync(sumFd.fd,{bigint:true}))||
      !stable(sumFd.b,fs.lstatSync(sumPath,{bigint:true})))return false;
  }finally{fs.closeSync(sumFd.fd);}
  const match=/^([a-f0-9]{64})  config-state\.tar\n$/.exec(sum);
  if(!match)return false;
  const tarPath=path.join(stageRoot,'config-state.tar'),tarFd=openPrivate(tarPath,512,MAX_BYTES);
  if(!tarFd)return false;
  try{
   const sha=crypto.createHash('sha256'),buf=Buffer.alloc(1024*1024);let size=0;
   for(;;){const n=fs.readSync(tarFd.fd,buf,0,buf.length,null);if(!n)break;
    size+=n;if(size>MAX_BYTES)return false;sha.update(buf.subarray(0,n));}
   if(!stable(tarFd.b,fs.fstatSync(tarFd.fd,{bigint:true}))||
      !stable(tarFd.b,fs.lstatSync(tarPath,{bigint:true}))||
      size!==Number(tarFd.b.size))return false;
   return sha.digest('hex')===match[1];
  }finally{fs.closeSync(tarFd.fd);}
 }catch{return false;}
}
module.exports.verifyOriginalConfigArchiveHash=verifyOriginalConfigArchiveHash;
