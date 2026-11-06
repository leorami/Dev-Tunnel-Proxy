'use strict';
/**
 * READ-ONLY byte comparison for an owner-held RC2 activation secret copied
 * into a durable recovery stage. This is NOT a bootstrap or an authorization
 * to rotate or recover a key: the reference BACKUP must be separately
 * authenticated as original, and queued HMAC replay/lease state separately
 * attested. Output never includes secret bytes, hashes, locations or metadata.
 *
 * This guard intentionally creates no files, directories, credentials, or
 * Docker processes. It never invokes rc2-provision-private-host-worker,
 * whose fresh CSPRNG key is appropriate for an INITIAL bootstrap, but would
 * be a dangerous substitution for original material during a live recovery.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const KEYS=Object.freeze(['backupSecretPath','restoredSecretPath']);
const COMMON=Object.freeze({
 backupProvenanceVerified:false,spoolReplayHistoryVerified:false,
 productionChangeAuthorized:false,filesystemModified:false,
 liveRuntimeAttested:false
});
const MATCH=Object.freeze({code:'RC2_SECRET_COPIES_IDENTICAL_NOT_AUTHENTICATED',
 copiesIdentical:true,...COMMON});
const DIFFER=Object.freeze({code:'RC2_SECRET_COPIES_DIFFER',
 copiesIdentical:false,...COMMON});
const DENY=Object.freeze({code:'RC2_SECRET_COPY_UNVERIFIABLE',
 copiesIdentical:false,...COMMON});
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
   Object.getPrototypeOf(o)!==Object.prototype)return false;
 const own=Reflect.ownKeys(o);
 return own.length===keys.length&&own.every(k=>
  typeof k==='string'&&keys.includes(k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
const field=(o,k)=>Object.getOwnPropertyDescriptor(o,k).value;
function validPath(p){
 return typeof p==='string'&&p.length>=20&&p.length<=2048&&
  path.isAbsolute(p)&&path.normalize(p)===p&&
  !p.endsWith(path.sep)&&!/[\x00-\x1f\x7f]/.test(p)&&
  path.basename(p)==='activation.secret';
}
function stable(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
  a.size===b.size&&a.mode===b.mode&&a.uid===b.uid&&
  a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
function readPrivateKey(file,uid){
 let bytes,fd;
 try{
  const parent=path.dirname(file);
  const dirBefore=fs.lstatSync(parent,{bigint:true});
  if(!dirBefore.isDirectory()||dirBefore.isSymbolicLink()||
   (dirBefore.mode&0o777n)!==0o700n||dirBefore.uid!==uid||
   fs.realpathSync(parent)!==parent)return null;
  const before=fs.lstatSync(file,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||
   before.uid!==uid||(before.mode&0o777n)!==0o600n||
   before.size<32n||before.size>128n)return null;
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|
    fs.constants.O_NONBLOCK);
  const opened=fs.fstatSync(fd,{bigint:true});
  if(!stable(before,opened))return null;
  bytes=fs.readFileSync(fd);
  const after=fs.fstatSync(fd,{bigint:true});
  if(!stable(opened,after)||!stable(after,fs.lstatSync(file,{bigint:true}))||
   !stable(dirBefore,fs.lstatSync(parent,{bigint:true}))||
   bytes.length!==Number(before.size)||new Set(bytes).size<2)return null;
  const copy=Buffer.from(bytes);
  return copy;
 }catch{return null;}
 finally{
  if(bytes)bytes.fill(0);
  if(fd!==undefined)try{fs.closeSync(fd);}catch{}
 }
}
function compareRecoveredActivationSecret(input){
 let a,b;
 try{
  if(!exact(input,KEYS))return DENY;
  const original=field(input,'backupSecretPath');
  const restored=field(input,'restoredSecretPath');
  if(!validPath(original)||!validPath(restored)||original===restored||
    path.dirname(original)===path.dirname(restored))return DENY;
  if(typeof process.getuid!=='function')return DENY;
  const uid=BigInt(process.getuid());
  a=readPrivateKey(original,uid);
  b=readPrivateKey(restored,uid);
  if(!a||!b||a.length!==b.length)return DENY;
  return crypto.timingSafeEqual(a,b)?MATCH:DIFFER;
 }catch{return DENY;}
 finally{if(a)a.fill(0);if(b)b.fill(0);}
}
module.exports={compareRecoveredActivationSecret};
