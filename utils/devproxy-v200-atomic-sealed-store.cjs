'use strict';
/**
 * V200: crash-safe, owner-private, atomic encrypted Signal endpoint store.
 * This helper holds only ciphertext. Its caller must supply a platform-owned
 * sealing key; it does NOT itself provide Keychain custody or Signal sessions.
 *
 * A stale lock means fail CLOSED and explicit operator recovery, never
 * silently reset/downgrade ratchets. No auto-directory creation.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const LIMIT=4*1024*1024;
const FLAGS=fs.constants;
function denyDirectory(){throw Error('UNSAFE_SIGNAL_STORE_DIRECTORY');}
function denyStore(){throw Error('UNSAFE_SIGNAL_SEALED_STORE');}
function canonicalParent(file){
 if(typeof file!=='string'||file.length<4||file.length>2048||
    !path.isAbsolute(file)||file!==path.normalize(file)||
    /[\x00-\x1f\x7f]/.test(file)||!(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/).test(path.basename(file)))
  denyDirectory();
 const dir=path.dirname(file);
 if(dir==='/'||dir.includes(path.sep+'.artifacts'+path.sep)||
    dir.endsWith(path.sep+'.artifacts'))denyDirectory();
 try{
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o777)!==0o700||
     (typeof process.getuid==='function'&&st.uid!==process.getuid())||
     fs.realpathSync(dir)!==dir)denyDirectory();
 }catch{denyDirectory();}
 return dir;
}
function checkOpenFile(fd){
 const st=fs.fstatSync(fd);
 if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600||
    st.size<1||st.size>LIMIT||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))denyStore();
}
function readPrivateSealedStore(file){
 canonicalParent(file);
 let fd;
 try{
  fd=fs.openSync(file,FLAGS.O_RDONLY|FLAGS.O_NOFOLLOW);
  checkOpenFile(fd);
  return fs.readFileSync(fd);
 }catch(err){
  if(err&&err.code==='ENOENT')return null;
  if(err&&err.message==='UNSAFE_SIGNAL_SEALED_STORE')throw err;
  denyStore();
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function fsyncDirectory(dir){
 const fd=fs.openSync(dir,FLAGS.O_RDONLY|FLAGS.O_DIRECTORY|FLAGS.O_NOFOLLOW);
 try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function writePrivateSealedStore(file,bytes,{beforeCommit}={}){
 const dir=canonicalParent(file);
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>LIMIT)
  throw Error('INVALID_SIGNAL_SEALED_BYTES');
 // Before acquiring the writer lock, reject any pre-existing unsafe target.
 readPrivateSealedStore(file);
 const lock=file+'.lock';
 let lockFd,temporary,staged=false;
 try{
  try{
   lockFd=fs.openSync(lock,FLAGS.O_WRONLY|FLAGS.O_CREAT|FLAGS.O_EXCL|FLAGS.O_NOFOLLOW,0o600);
  }catch(err){
   if(err&&err.code==='EEXIST')throw Error('SIGNAL_STORE_WRITE_LOCKED');
   throw err;
  }
  fs.fsyncSync(lockFd);
  fs.closeSync(lockFd);lockFd=undefined;
  fsyncDirectory(dir);
  const tmp=file+'.tmp-'+crypto.randomBytes(12).toString('hex');
  temporary=tmp;
  let fd;
  try{
   fd=fs.openSync(tmp,FLAGS.O_WRONLY|FLAGS.O_CREAT|FLAGS.O_EXCL|FLAGS.O_NOFOLLOW,0o600);
   fs.writeFileSync(fd,bytes);
   fs.fsyncSync(fd);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
  staged=true;
  // Deliberate crash fault point used solely by isolated RED/GREEN tests.
  // Production endpoints never provide this option.
  if(typeof beforeCommit==='function')beforeCommit();
  // Do not replace an attacker-swapped symlink or broad-mode target.
  readPrivateSealedStore(file);
  fs.renameSync(tmp,file);
  temporary=undefined;
  fsyncDirectory(dir);
 }finally{
  if(lockFd!==undefined)fs.closeSync(lockFd);
  if(temporary){
   try{fs.unlinkSync(temporary);}catch{/* preserving original exception */}
  }
  try{fs.unlinkSync(lock);}catch{/* persistent lock is fail-closed */}
  if(staged){try{fsyncDirectory(dir);}catch{/* preserve thrown error */}}
 }
}
module.exports=Object.freeze({readPrivateSealedStore,writePrivateSealedStore});
