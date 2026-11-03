'use strict';
/**
 * Host-side evidence check for a FIXED, owner-attested generated nginx bundle.
 * No Docker, no HTTP, no caller-controlled paths, no secret/route text output.
 * This is content parity only; the caller must separately validate nginx,
 * perform a successful scoped reload and verify the active worker/route.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const RELATIVE='build/sites-enabled/apps.generated.conf';
const MAX_BYTES=2*1024*1024;
function createHostBundleDigestVerifier({approvedRoot,relativeBundle=RELATIVE}={}){
 if(typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||path.normalize(approvedRoot)!==approvedRoot||
   approvedRoot==='/'||approvedRoot.endsWith('/')||relativeBundle!==RELATIVE)
  throw Error('INVALID_FIXED_BUNDLE_ROOT');
 const components=['build','sites-enabled'];
 const file=path.join(approvedRoot,RELATIVE);
 async function safeDirectory(p){
  const st=await fs.lstat(p);
  if(!st.isDirectory()||st.isSymbolicLink())return false;
  return await fs.realpath(p)===p;
 }
 return async function verifyBundle(signal,expectedSha256){
  if(signal?.aborted||typeof expectedSha256!=='string'||!/^[0-9a-f]{64}$/.test(expectedSha256))return false;
  let handle;
  try{
   let current=approvedRoot;
   if(!await safeDirectory(current))return false;
   for(const component of components){current=path.join(current,component);if(!await safeDirectory(current))return false;}
   const before=await fs.lstat(file);
   if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>MAX_BYTES)return false;
   handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
   const opened=await handle.stat();
   if(opened.dev!==before.dev||opened.ino!==before.ino||!opened.isFile()||opened.nlink!==1||opened.size!==before.size)return false;
   const bytes=await handle.readFile();
   const after=await handle.stat();
   if(signal?.aborted||after.dev!==opened.dev||after.ino!==opened.ino||after.size!==bytes.length||bytes.length<1||bytes.length>MAX_BYTES)return false;
   return crypto.createHash('sha256').update(bytes).digest('hex')===expectedSha256;
  }catch{return false;}finally{if(handle)await handle.close();}
 };
}
module.exports={createHostBundleDigestVerifier};
