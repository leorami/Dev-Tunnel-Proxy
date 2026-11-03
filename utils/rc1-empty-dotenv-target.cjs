'use strict';
// SAFE STAGING UTILITY ONLY. Never reads or copies owner credentials.
// Always returns fixed redacted codes, never authorizes live Docker or Git writes.
const fs=require('node:fs');
const path=require('node:path');
const {constants:C}=fs;
const K=new Set(['stageRoot','candidateRoot','apply']);
function reply(code){return Object.freeze({code,productionChangeAuthorized:false,productionMutation:false,secretBytesRead:false});}
function own(o,k){const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.prototype.hasOwnProperty.call(d,'value')?d.value:undefined;}
function record(o){
 if(o===null||typeof o!=='object'||Array.isArray(o))return false;
 const p=Object.getPrototypeOf(o);return (p===Object.prototype||p===null)&&Reflect.ownKeys(o).every(k=>typeof k==='string'&&K.has(k)&&Object.getOwnPropertyDescriptor(o,k)&&Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function noSymlinkStageRoots(stageRoot,candidateRoot){
 // Reject symlink stage/candidate leaves. Do not walk OS ancestor mounts:
 // macOS /var -> /private/var would false-BLOCKED_SYMLINK under os.tmpdir().
 if(fs.lstatSync(stageRoot).isSymbolicLink()||fs.lstatSync(candidateRoot).isSymbolicLink())return false;
 const realStage=fs.realpathSync(stageRoot),realCand=fs.realpathSync(candidateRoot);
 return path.dirname(realCand)===realStage;
}
function existingTarget(target){
 try{
  const st=fs.lstatSync(target);
  if(!st.isFile()||st.isSymbolicLink()||st.size!==0||st.nlink!==1||(st.mode&0o777)!==0o600)return 'BLOCKED_EXISTING_TARGET';
  return 'ALREADY_EMPTY_PRIVATE_PLACEHOLDER';
 }catch(e){
  if(e&&e.code==='ENOENT')return null;
  return 'BLOCKED_IO';
 }
}
function prepareEmptyDotenvTarget(input){
 try{
  if(!record(input))return reply('BLOCKED_INVALID_ARGUMENTS');
  const stageRoot=own(input,'stageRoot'),candidateRoot=own(input,'candidateRoot'),apply=own(input,'apply');
  if(typeof stageRoot!=='string'||typeof candidateRoot!=='string'||typeof apply!=='boolean'||
     !path.isAbsolute(stageRoot)||!path.isAbsolute(candidateRoot)||
     stageRoot!==path.normalize(stageRoot)||candidateRoot!==path.normalize(candidateRoot)||
     path.dirname(candidateRoot)!==stageRoot)return reply('BLOCKED_STAGE_BOUNDARY');
  if(!noSymlinkStageRoots(stageRoot,candidateRoot))return reply('BLOCKED_SYMLINK');
  const s=fs.lstatSync(stageRoot),c=fs.lstatSync(candidateRoot);
  if(!s.isDirectory()||!c.isDirectory()||(s.mode&0o777)!==0o700||
     (c.mode&0o022)!==0||s.uid!==c.uid||
     (typeof process.getuid==='function'&&s.uid!==process.getuid()))return reply('BLOCKED_STAGE_PERMISSIONS');
  const gitMeta=path.join(candidateRoot,'.git');
  try{fs.lstatSync(gitMeta);return reply('BLOCKED_GIT_WORKTREE');}
  catch(e){if(!e||e.code!=='ENOENT')return reply('BLOCKED_IO');}
  const target=path.join(candidateRoot,'.env');
  const previous=existingTarget(target);
  if(previous)return reply(previous);
  if(!apply)return reply('READY_PRIVATE_STAGE_ONLY');
  // Must create an empty regular-file mountpoint, NEVER owner dotenv contents.
  // O_EXCL and O_NOFOLLOW reject collisions and final-component symlinks.
  const flags=C.O_WRONLY|C.O_CREAT|C.O_EXCL|(C.O_NOFOLLOW||0);
  let fd;
  try{
   fd=fs.openSync(target,flags,0o600);
   const st=fs.fstatSync(fd);
   if(!st.isFile()||st.size!==0||st.nlink!==1)throw Error('UNSAFE_NEW_FILE');
   fs.fchmodSync(fd,0o600);
   return reply('CREATED_EMPTY_PRIVATE_PLACEHOLDER');
  }catch(e){return reply('BLOCKED_CREATE');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }catch{return reply('BLOCKED_IO');}
}
module.exports={prepareEmptyDotenvTarget};
