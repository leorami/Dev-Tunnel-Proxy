'use strict';
/**
 * Fixed-content, read-only candidate manifest for Dev Proxy route activation.
 * Both the caller and the separately trusted host must compute this digest
 * independently. This module NEVER authorizes a reload, edit, or deployment.
 *
 * Unlike the v5 bundle-only digest, this binds the security-sensitive nginx
 * default config and main nginx production config to the generated route
 * bundle. It is an additive future v2 contract, not wired into running RC1.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const PROTOCOL='DEVPROXY_CONFIG_SET_V2';
const CANDIDATE_PATHS=Object.freeze([
 'build/sites-enabled/apps.generated.conf',
 'config/default.production.conf',
 'config/nginx.production.conf'
]);
const MAX_BYTES=Object.freeze([2*1024*1024,1024*1024,1024*1024]);
const HEX=/^[0-9a-f]{64}$/;
function stable(st){return [st.dev,st.ino,st.nlink,st.size,st.mtimeNs,st.ctimeNs];}
function sameStat(a,b){const a1=stable(a),b1=stable(b);return a1.every((x,i)=>x===b1[i]);}
function invalidRoot(root){return typeof root!=='string'||!path.isAbsolute(root)||path.normalize(root)!==root||
 root==='/'||root.endsWith(path.sep)||root.includes('\0');}
async function folder(input,expected){
 let st;
 try{st=await fs.lstat(input,{bigint:true});}
 catch(e){if(e.code==='ENOENT')throw Error('CANDIDATE_UNAVAILABLE');throw e;}
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('UNSAFE_CANDIDATE_DIRECTORY');
 if((await fs.realpath(input))!==expected)throw Error('UNSAFE_CANDIDATE_DIRECTORY');
 return st;
}
async function pinnedRoot(root){
 if(invalidRoot(root))throw Error('INVALID_APPROVED_CANDIDATE_ROOT');
 const st=await fs.lstat(root,{bigint:true});
 if(!st.isDirectory()||st.isSymbolicLink())throw Error('UNSAFE_CANDIDATE_DIRECTORY');
 return {real:await fs.realpath(root),st};
}
async function readPinnedFile(root,canonicalRoot,relative,max){
 let current=root,expected=canonicalRoot;
 const segments=relative.split('/');
 for(const part of segments.slice(0,-1)){
  current=path.join(current,part);expected=path.join(expected,part);
  await folder(current,expected);
 }
 const file=path.join(root,...segments);
 let initial;
 try{initial=await fs.lstat(file,{bigint:true});}
 catch(e){if(e.code==='ENOENT')throw Error('CANDIDATE_UNAVAILABLE');throw e;}
 if(!initial.isFile()||initial.isSymbolicLink()||initial.nlink!==1n||initial.size<=0n||initial.size>BigInt(max))
  throw Error('UNSAFE_CANDIDATE_FILE');
 let fd;
 try{
  fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const opened=await fd.stat({bigint:true});
  if(!opened.isFile()||opened.nlink!==1n||!sameStat(initial,opened))throw Error('UNSAFE_CANDIDATE_FILE');
  const data=await fd.readFile();
  const after=await fd.stat({bigint:true});
  const final=await fs.lstat(file,{bigint:true});
  if(data.length!==Number(initial.size)||!sameStat(initial,after)||!sameStat(after,final))
   throw Error('CANDIDATE_CHANGED_DURING_READ');
  return Object.freeze({path:relative,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});
 }catch(e){if(e.code==='ENOENT')throw Error('CANDIDATE_UNAVAILABLE');throw e;}
 finally{if(fd)await fd.close();}
}
async function createCandidateManifest({approvedRoot}={}){
 const {real,st}=await pinnedRoot(approvedRoot);
 const parts=[];
 for(let i=0;i<CANDIDATE_PATHS.length;i++)
  parts.push(await readPinnedFile(approvedRoot,real,CANDIDATE_PATHS[i],MAX_BYTES[i]));
 const final=await fs.lstat(approvedRoot,{bigint:true});
 if(!sameStat(st,final)||await fs.realpath(approvedRoot)!==real)
  throw Error('CANDIDATE_CHANGED_DURING_READ');
 // Length-delimited, domain-separated v2 digest. No file data or private path
 // leaks into the result. The fixed ordered set prevents partial attestation.
 const hash=crypto.createHash('sha256').update(PROTOCOL+'\0');
 for(const p of parts){
  const name=Buffer.from(p.path,'utf8');
  hash.update(String(name.byteLength)+'\0').update(name).update('\0');
  hash.update(String(p.bytes)+'\0').update(p.sha256).update('\0');
 }
 return Object.freeze({protocol:PROTOCOL,candidateSha256:hash.digest('hex'),parts:Object.freeze(parts)});
}
async function verifyCandidateManifest({approvedRoot,expectedCandidateSha256}={}){
 if(typeof expectedCandidateSha256!=='string'||!HEX.test(expectedCandidateSha256))
  return Object.freeze({ok:false,code:'INVALID_EXPECTED_CONFIG_SET_DIGEST'});
 try{
  const m=await createCandidateManifest({approvedRoot});
  const matched=crypto.timingSafeEqual(Buffer.from(m.candidateSha256,'hex'),Buffer.from(expectedCandidateSha256,'hex'));
  return Object.freeze({ok:matched,code:matched?'CONFIG_SET_BOUND':'CONFIG_SET_DIGEST_MISMATCH'});
 }catch{return Object.freeze({ok:false,code:'CONFIG_SET_UNVERIFIABLE'});}
}
module.exports={PROTOCOL,CANDIDATE_PATHS,createCandidateManifest,verifyCandidateManifest};
