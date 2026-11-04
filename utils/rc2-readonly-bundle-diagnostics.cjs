'use strict';
/**
 * Production API GET must never regenerate route configuration as a side effect.
 * This reader only opens an existing, regular, bounded artifact with O_NOFOLLOW.
 * It makes no Docker, network, process, write or permission-repair calls.
 */
const fs=require('node:fs');
const path=require('node:path');
const {constants}=fs;
const MAX_BYTES=256*1024;
const missing=()=>Object.freeze({code:'BUNDLE_DIAGNOSTICS_MISSING'});
const unsafe=()=>Object.freeze({code:'BUNDLE_DIAGNOSTICS_UNSAFE'});
const invalid=()=>Object.freeze({code:'BUNDLE_DIAGNOSTICS_INVALID'});
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
 a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function readExistingBundleDiagnostics({file}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file||
    path.basename(file)!=='bundle-diagnostics.json'||file.length>1024||
    /[\x00-\x1f\x7f]/.test(file))return invalid();
 let stat,fd;
 try{
  stat=fs.lstatSync(file,{bigint:true});
 }catch(e){return e?.code==='ENOENT'?missing():unsafe();}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||
    stat.size<2n||stat.size>BigInt(MAX_BYTES))return unsafe();
 try{
  fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const before=fs.fstatSync(fd,{bigint:true});
  if(!before.isFile()||!same(stat,before))return unsafe();
  const bytes=fs.readFileSync(fd);
  const after=fs.fstatSync(fd,{bigint:true});
  if(!same(before,after)||BigInt(bytes.length)!==before.size||
     !same(after,fs.lstatSync(file,{bigint:true})))return unsafe();
  let parsed;
  try{parsed=JSON.parse(bytes.toString('utf8'));}catch{return invalid();}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
     Object.getPrototypeOf(parsed)!==Object.prototype||
     (Object.hasOwn(parsed,'included')&&!Array.isArray(parsed.included)))return invalid();
  return Object.freeze({code:'BUNDLE_DIAGNOSTICS_OK',diagnostics:parsed});
 }catch{return unsafe();}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={readExistingBundleDiagnostics};
