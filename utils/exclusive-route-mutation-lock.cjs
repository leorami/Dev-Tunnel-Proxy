'use strict';
/**
 * Fail-closed, cross-process O_CREAT|O_EXCL lock for one private route workspace.
 * A crashed process leaves a stale lock: an operator must investigate and
 * explicitly clear it. NEVER auto-unlink an unknown/stale lock by PID/time.
 * This protects only cooperating operations; no untrusted symlink paths or
 * unsafe filesystem writes are authorized by acquiring it.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
function createExclusiveMutationLock({directory}={}) {
 if(typeof directory!=='string' || !path.isAbsolute(directory) ||
    path.normalize(directory)!==directory || directory.endsWith('/')) throw Error('INVALID_PRIVATE_LOCK_DIRECTORY');
 const file=path.join(directory,'route-mutation.lock');
 async function acquire() {
   const d=await fs.lstat(directory);
   if(!d.isDirectory()||d.isSymbolicLink() || (d.mode&0o077)!==0 ||
      (typeof process.getuid==='function' && d.uid!==process.getuid())) throw Error('PRIVATE_LOCK_DIRECTORY_REQUIRED');
   let fd;
   try {fd=await fs.open(file,'wx',0o600);}catch(err){
     if(err.code==='EEXIST') return null;
     throw err;
   }
   const original=await fd.stat();
   await fd.sync();
   let released=false;
   return Object.freeze({
     async release(){
       if(released)throw Error('LOCK_ALREADY_RELEASED');
       released=true;
       try {
         const current=await fs.lstat(file);
         if(!current.isFile()||current.isSymbolicLink() || current.dev!==original.dev || current.ino!==original.ino)
           throw Error('LOCK_IDENTITY_REPLACED');
         await fs.unlink(file);
       }finally {await fd.close();}
     }
   });
 }
 return Object.freeze({acquire});
}
module.exports={createExclusiveMutationLock};
