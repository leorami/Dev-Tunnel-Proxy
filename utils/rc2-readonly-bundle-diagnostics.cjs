'use strict';
/** A GET must not mutate route/configuration files or spawn generator processes.
 * Reads only a pre-existing, regular, bounded and stable JSON artifact.
 * Returns redacted fixed error codes and no side effects.
 */
const fs=require('node:fs');
const path=require('node:path');
const {constants}=fs;
const MAX_BYTES=256*1024;
const MAX_INCLUDED=2048;
const missing=()=>Object.freeze({code:'BUNDLE_DIAGNOSTICS_MISSING'});
const unsafe=()=>Object.freeze({code:'BUNDLE_DIAGNOSTICS_UNSAFE'});
const invalid=()=>Object.freeze({code:'BUNDLE_DIAGNOSTICS_INVALID'});
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
 a.mode===b.mode&&a.uid===b.uid&&a.size===b.size&&
 a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
function readExistingBundleDiagnostics({file}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file||
    path.basename(file)!=='bundle-diagnostics.json'||file.length>1024||
    /[\x00-\x1f\x7f]/.test(file))return invalid();
 let fd;
 try{
  let before;
  try{before=fs.lstatSync(file,{bigint:true});}
  catch(e){return e?.code==='ENOENT'?missing():unsafe();}
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||
     (before.mode&0o022n)!==0n||before.size<2n||before.size>BigInt(MAX_BYTES))return unsafe();
  fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const open=fs.fstatSync(fd,{bigint:true});
  if(!open.isFile()||!same(before,open))return unsafe();
  const bytes=fs.readFileSync(fd);
  const after=fs.fstatSync(fd,{bigint:true});
  if(!same(open,after)||BigInt(bytes.length)!==open.size||
     !same(after,fs.lstatSync(file,{bigint:true})))return unsafe();
  let parsed;
  try{parsed=JSON.parse(bytes.toString('utf8'));}catch{return invalid();}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
     Object.getPrototypeOf(parsed)!==Object.prototype||
     !Array.isArray(parsed.included)||parsed.included.length>MAX_INCLUDED||
     parsed.included.some(row=>!row||typeof row!=='object'||Array.isArray(row)||
       Object.getPrototypeOf(row)!==Object.prototype))return invalid();
  return Object.freeze({code:'BUNDLE_DIAGNOSTICS_OK',diagnostics:parsed});
 }catch{return unsafe();}
 finally{if(fd!==undefined){try{fs.closeSync(fd);}catch{}}}
}
module.exports={readExistingBundleDiagnostics};
