'use strict';
/** Existing RC2 archive integrity check, READ ONLY, never a restore claim. */
const fs=require('node:fs');
const path=require('node:path');
const {constants}=fs;
const {readPrivatePin,hashRegularFile,privateDirectory}=require('./rc2-pinned-current-image-export.cjs');
const blocked=()=>Object.freeze({code:'RC2_IMAGE_ARCHIVE_INTEGRITY_BLOCKED',archiveHashMatches:false,
 productionChangeAuthorized:false,deployed:false,restoreVerified:false,liveImageBindingVerified:false});
function verifyPrivateSum(p){
 let fd;
 try{
  const s=fs.lstatSync(p,{bigint:true});
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||
   (typeof process.getuid==='function'&&s.uid!==BigInt(process.getuid()))||
   (s.mode&0o777n)!==0o600n||s.size!==86n)return null;
  fd=fs.openSync(p,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const a=fs.fstatSync(fd,{bigint:true});
  if(a.dev!==s.dev||a.ino!==s.ino||a.size!==s.size||a.mtimeNs!==s.mtimeNs)return null;
  const data=fs.readFileSync(fd).toString('utf8');
  const b=fs.fstatSync(fd,{bigint:true}),c=fs.lstatSync(p,{bigint:true});
  if(b.dev!==a.dev||b.ino!==a.ino||b.size!==a.size||b.mtimeNs!==a.mtimeNs||
     c.dev!==b.dev||c.ino!==b.ino||c.mtimeNs!==b.mtimeNs)return null;
  const m=/^([a-f0-9]{64})  rollback-images\.tar\n$/.exec(data);
  return m?m[1]:null;
 }catch{return null;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function inspectPrivateImageArchive({stageRoot}={}){
 try{
  if(typeof stageRoot!=='string'||!path.isAbsolute(stageRoot)||
   path.normalize(stageRoot)!==stageRoot||stageRoot==='/'||stageRoot.endsWith('/')||
   !/^rc2-images-[A-Za-z0-9_-]{4,}$/.test(path.basename(stageRoot))||
   path.basename(path.dirname(stageRoot))!=='private-rollbacks')return blocked();
  privateDirectory(path.dirname(stageRoot));privateDirectory(stageRoot);
  readPrivatePin(stageRoot);
  const actual=fs.readdirSync(stageRoot).sort();
  if(actual.length!==3||JSON.stringify(actual)!==JSON.stringify([
   'SHA256SUMS.private','rc2-current-images.private.json','rollback-images.tar']))return blocked();
  const digest=verifyPrivateSum(path.join(stageRoot,'SHA256SUMS.private'));
  if(!digest||hashRegularFile(path.join(stageRoot,'rollback-images.tar'))!==digest)return blocked();
  return Object.freeze({code:'RC2_IMAGE_ARCHIVE_CHECKSUM_MATCHES_RESTORE_NOT_VERIFIED',
   archiveHashMatches:true,productionChangeAuthorized:false,deployed:false,
   restoreVerified:false,liveImageBindingVerified:false});
 }catch{return blocked();}
}
module.exports={inspectPrivateImageArchive};
