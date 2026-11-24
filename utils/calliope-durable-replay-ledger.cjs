'use strict';
/**
 * Source-only, opt-in durable replay reservation for an authentic V191
 * Ed25519-signed metadata envelope. NO Signal ratchet/session storage,
 * owner grant issuer, network listener, credential store or live installation.
 *
 * Caller must provision a dedicated existing owner-private 0700 directory.
 * No automatic directory creation, deletion, expiry sweep or runtime wiring.
 * Existing nonce entries are never evicted: exhaustion FAILS CLOSED.
 *
 * Atomic O_CREAT|O_EXCL is the cross-process single-nonce arbiter. An entry
 * is accepted only after both file and parent directory fsync succeed.
 * Errors leave the reservation denied, potentially requiring operator
 * recovery; the code never cleans up partially persisted claims.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const BRAND=new WeakSet();
const NAME=/^[a-z][a-z0-9-]{0,47}$/;
const NONCE=/^[A-Za-z0-9_-]{43}$/;
const FILENAME=/^[a-f0-9]{64}\.nonce$/;
const DOMAIN='DEVPROXY-CALLIOPE-DURABLE-REPLAY-V1\n';
const FIELDS=['sender','project','nonce','expiresAtMs','at'];
function shape(input){
 try{
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.getPrototypeOf(input)!==Object.prototype||
     Reflect.ownKeys(input).length!==FIELDS.length)return null;
  const out=Object.create(null);
  for(const name of FIELDS){
   const d=Object.getOwnPropertyDescriptor(input,name);
   if(!d||!Object.hasOwn(d,'value'))return null;
   out[name]=d.value;
  }
  return out;
 }catch{return null;}
}
function validateDirectory(directory){
 if(typeof directory!=='string'||directory.length<2||directory.length>2048||
    !path.isAbsolute(directory)||path.normalize(directory)!==directory||
    directory==='/'||directory.endsWith(path.sep)||
    /[\x00-\x1f\x7f]/.test(directory))throw Error('INVALID_REPLAY_DIRECTORY');
 try{
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
     (stat.mode&0o777)!==0o700||
     (typeof process.getuid==='function'&&stat.uid!==process.getuid())||
     fs.realpathSync(directory)!==directory)throw Error('INVALID_REPLAY_DIRECTORY');
  return {dev:stat.dev,ino:stat.ino};
 }catch{throw Error('INVALID_REPLAY_DIRECTORY');}
}
function createDurableCalliopeReplayLedger({directory,maxEntries=1024}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>2048)
  throw Error('INVALID_REPLAY_CAPACITY');
 const expected=validateDirectory(directory);
 function reserve(input){
  const data=shape(input);
  if(!data||typeof data.sender!=='string'||!NAME.test(data.sender)||
    typeof data.project!=='string'||!NAME.test(data.project)||
    typeof data.nonce!=='string'||!NONCE.test(data.nonce)||
    !Number.isSafeInteger(data.at)||data.at<=0||
    !Number.isSafeInteger(data.expiresAtMs)||data.expiresAtMs<=data.at||
    data.expiresAtMs-data.at>60000)return false;
  try{
   const current=validateDirectory(directory);
   if(current.dev!==expected.dev||current.ino!==expected.ino)return false;
   const entries=fs.readdirSync(directory);
   if(entries.length>=maxEntries||entries.some(name=>!FILENAME.test(name)))return false;
   const digest=crypto.createHash('sha256')
     .update(DOMAIN+data.sender+'\0'+data.nonce,'utf8').digest('hex');
   const target=path.join(directory,digest+'.nonce');
   let fd;
   try{
    fd=fs.openSync(target,fs.constants.O_CREAT|fs.constants.O_EXCL|
      fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    const st=fs.fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600||
      (typeof process.getuid==='function'&&st.uid!==process.getuid()))
       throw Error('UNSAFE_REPLAY_ENTRY');
    // Expiry is observational metadata only; never allow a caller to use it
    // to truncate an existing reservation. Do not persist any sender/nonce.
    fs.writeFileSync(fd,'V1\n'+String(data.expiresAtMs)+'\n','utf8');
    fs.fsyncSync(fd);
   }finally{if(fd!==undefined)fs.closeSync(fd);}
   const rootFd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
   try{fs.fsyncSync(rootFd);}finally{fs.closeSync(rootFd);}
   const unchanged=validateDirectory(directory);
   return unchanged.dev===expected.dev&&unchanged.ino===expected.ino;
  }catch{return false;}
 }
 const instance=Object.freeze({reserve});
 BRAND.add(instance);
 return instance;
}
function isDurableCalliopeReplayLedger(value){
 return !!value&&typeof value==='object'&&BRAND.has(value);
}
module.exports=Object.freeze({createDurableCalliopeReplayLedger,
 isDurableCalliopeReplayLedger});
