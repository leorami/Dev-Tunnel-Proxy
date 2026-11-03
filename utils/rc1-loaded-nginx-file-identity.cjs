'use strict';
/**
 * Read-only, test-owned equality evidence for the three fixed candidate nginx
 * files and the corresponding names/bytes of a separately supplied loaded
 * filesystem snapshot. This does NOT inspect Docker, attest a real process,
 * guarantee runtime inode immutability, or complete nginx's include graph
 * (notably mime.types and image-supplied module files).
 *
 * The callback supplying a runtimeRoot is explicitly NOT an authority. A
 * successful comparison can only inform a trusted host operator's review.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const {checkEffectiveNginxConfigClosure}=require('./rc1-effective-nginx-config-closure.cjs');
const CANDIDATE_TO_LOADED=Object.freeze({
 'config/nginx.production.conf':'etc/nginx/nginx.conf',
 'config/default.production.conf':'etc/nginx/conf.d/default.conf',
 'build/sites-enabled/apps.generated.conf':'etc/nginx/conf.d/sites-enabled/apps.generated.conf'
});
const expectedConfD=Object.freeze(['default.conf','sites-enabled']);
const expectedSites=Object.freeze(['apps.generated.conf']);
const limit=2*1024*1024;
function output(code,verifiedFileCount=0){return Object.freeze({
 code,verifiedFileCount,productionChangeAuthorized:false,deployed:false,
 actualHostAttested:false,effectiveNginxConfigComplete:false,ownerUatApproved:false
});}
function validRoot(root){return typeof root==='string'&&path.isAbsolute(root)&&
 path.normalize(root)===root&&root!=='/'&&!root.endsWith(path.sep)&&!root.includes('\0');}
async function checkRoot(root){
 const stat=await fs.lstat(root);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o022)!==0||await fs.realpath(root)!==root)
  throw Error('LOADED_DIRECTORY_UNSAFE');
}
async function checkParents(root,relative){
 const segments=relative.split('/');let cur=root;
 for(const x of segments.slice(0,-1)){
  cur=path.join(cur,x);const st=await fs.lstat(cur);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0||await fs.realpath(cur)!==cur)
   throw Error('LOADED_DIRECTORY_UNSAFE');
 }
}
async function secureFile(root,relative){
 await checkParents(root,relative);
 const file=path.join(root,relative);
 const before=await fs.lstat(file,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||
    before.size<1n||before.size>BigInt(limit)||(before.mode&0o022n)!==0n)throw Error('LOADED_FILE_UNSAFE');
 const fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await fd.stat({bigint:true});
  if(opened.dev!==before.dev||opened.ino!==before.ino||
     opened.nlink!==1n||opened.size!==before.size)throw Error('LOADED_FILE_UNSAFE');
  const bytes=await fd.readFile();
  const after=await fd.stat({bigint:true});
  const final=await fs.lstat(file,{bigint:true});
  if(BigInt(bytes.length)!==opened.size||after.dev!==opened.dev||after.ino!==opened.ino||
    after.size!==opened.size||after.ctimeNs!==opened.ctimeNs||after.mtimeNs!==opened.mtimeNs||
    final.dev!==opened.dev||final.ino!==opened.ino||final.size!==opened.size||
    final.ctimeNs!==opened.ctimeNs||final.mtimeNs!==opened.mtimeNs)
   throw Error('LOADED_FILE_CHANGED_DURING_READ');
  return crypto.createHash('sha256').update(bytes).digest('hex');
 }finally{await fd.close();}
}
async function exactDirectory(root,relative,expected){
 await checkParents(root,relative+'/placeholder');
 const dir=path.join(root,relative);
 const entries=await fs.readdir(dir,{withFileTypes:true});
 const names=entries.map(x=>x.name).sort();
 if(names.length!==expected.length||names.some((x,i)=>x!==expected[i]))
  throw Error('UNEXPECTED_LOADED_CONFIG_NAME');
 for(const entry of entries){
  const st=await fs.lstat(path.join(dir,entry.name));
  if(st.isSymbolicLink()||!(st.isFile()||st.isDirectory()))throw Error('LOADED_FILE_UNSAFE');
 }
}
async function inspectLoadedNginxFileIdentity({approvedRoot,runtimeRoot}={}){
 if(!validRoot(approvedRoot)||!validRoot(runtimeRoot)||approvedRoot===runtimeRoot)
  return output('INVALID_LOADED_IDENTITY_ROOT');
 try{
  await checkRoot(approvedRoot);await checkRoot(runtimeRoot);
  const staticClosure=await checkEffectiveNginxConfigClosure({approvedRoot});
  if(staticClosure.code!=='STATIC_CONFIG_CLOSURE_VERIFIED')return output('CANDIDATE_INCLUDE_CLOSURE_BLOCKED');
  const baseline=await createCandidateManifest({approvedRoot});
  await exactDirectory(runtimeRoot,'etc/nginx/conf.d',expectedConfD);
  await exactDirectory(runtimeRoot,'etc/nginx/conf.d/sites-enabled',expectedSites);
  for(const [candidate,loaded] of Object.entries(CANDIDATE_TO_LOADED)){
   const got=await secureFile(runtimeRoot,loaded);
   const expected=baseline.parts.find(x=>x.path===candidate)?.sha256;
   const approved=await secureFile(approvedRoot,candidate);
   if(expected!==got||expected!==approved)return output('LOADED_CONFIG_BYTES_MISMATCH');
  }
  // Double-check around runtime read; not a lease against later mutations.
  const after=await createCandidateManifest({approvedRoot});
  if(after.candidateSha256!==baseline.candidateSha256)return output('CANDIDATE_CHANGED_DURING_LOADED_READ');
  await exactDirectory(runtimeRoot,'etc/nginx/conf.d',expectedConfD);
  await exactDirectory(runtimeRoot,'etc/nginx/conf.d/sites-enabled',expectedSites);
  return output('FIXED_NGINX_FILES_MATCH_REPORTED',3);
 }catch(e){
  if(e?.message==='UNEXPECTED_LOADED_CONFIG_NAME')return output('UNEXPECTED_LOADED_CONFIG_NAME');
  if(e?.message==='LOADED_FILE_UNSAFE'||e?.message==='LOADED_DIRECTORY_UNSAFE')return output('LOADED_CONFIG_UNSAFE');
  return output('LOADED_CONFIG_UNVERIFIABLE');
 }
}
/**
 * This host-view adapter is evidence from test-owned filesystem bytes, NOT a
 * real Mac/Docker identity or runtime mount attestation. It is deliberately
 * compatible only with the nonauthorizing v9 closure test seam.
 */
function createReadOnlyHostViewFromLoadedFiles({approvedRoot,runtimeRoot}={}){
 if(!validRoot(approvedRoot)||!validRoot(runtimeRoot)||approvedRoot===runtimeRoot)
  throw Error('INVALID_LOADED_IDENTITY_ROOT');
 return async function reportTestOwnedLoadedFiles(){
  const result=await inspectLoadedNginxFileIdentity({approvedRoot,runtimeRoot});
  if(result.code!=='FIXED_NGINX_FILES_MATCH_REPORTED')
   throw Error('LOADED_FILES_CANNOT_BE_ATTESTED');
  return Object.freeze({confD:Object.freeze(['default.conf']),
    siteEnabled:Object.freeze(['apps.generated.conf'])});
 };
}
module.exports={inspectLoadedNginxFileIdentity,CANDIDATE_TO_LOADED,
 createReadOnlyHostViewFromLoadedFiles};
