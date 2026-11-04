#!/usr/bin/env node
'use strict';
/**
 * Explicit, source-only local candidate renderer. Does NOT talk to Docker,
 * restart anything, read credentials, alter owner config or deploy.
 * Reads one stage-private 0600 JSON pin file, emits one 0600 standalone Compose
 * JSON candidate using exclusive no-clobber creation, then stops.
 *
 * Operator invocation (in owner-private test staging only):
 *   node scripts/rc2-render-private-compose-candidate.cjs /abs/private/stage
 * Input must be /abs/private/stage/rc2-candidate-pins.json, output appears as
 * /abs/private/stage/rc2-compose-candidate.json. No paths, keys or pins logged.
 */
const path=require('node:path');
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const {createProductionComposeCandidate}=require('../utils/rc2-production-compose-candidate.cjs');
const INPUT_NAME='rc2-candidate-pins.json';
const OUTPUT_NAME='rc2-compose-candidate.json';
function unsafe(code){throw Error(code);}
function exactArgs(args){
 return args&&typeof args==='object'&&!Array.isArray(args)&&
  Object.getPrototypeOf(args)===Object.prototype&&
  Reflect.ownKeys(args).length===1&&
  Object.hasOwn(args,'stageRoot')&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(args,'stageRoot'),'value');
}
function validRoot(p){
 return typeof p==='string'&&path.isAbsolute(p)&&path.normalize(p)===p&&
  p!=='/'&&!p.endsWith(path.sep)&&!/[\x00-\x1f\x7f]/.test(p);
}
function pinned(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
  a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
}
function own(st){return typeof process.getuid!=='function'||st.uid===BigInt(process.getuid());}
async function privateStage(stageRoot){
 let s;
 try{s=await fs.lstat(stageRoot,{bigint:true});}catch{unsafe('RC2_PRIVATE_STAGE_UNSAFE');}
 if(!s.isDirectory()||s.isSymbolicLink()||!own(s)||(s.mode&0o077n)!==0n||
  await fs.realpath(stageRoot)!==stageRoot)unsafe('RC2_PRIVATE_STAGE_UNSAFE');
 return s;
}
async function readPrivateManifest(stageRoot){
 const manifest=path.join(stageRoot,INPUT_NAME);
 let stat;
 try{stat=await fs.lstat(manifest,{bigint:true});}
 catch{unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||!own(stat)||
    (stat.mode&0o077n)!==0n||stat.size<2n||stat.size>16384n)
   unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');
 let h;
 try{
  h=await fs.open(manifest,constants.O_RDONLY|constants.O_NOFOLLOW);
  const before=await h.stat({bigint:true});
  if(!pinned(stat,before))unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');
  const content=await h.readFile();
  const after=await h.stat({bigint:true});
  const final=await fs.lstat(manifest,{bigint:true});
  if(BigInt(content.length)!==stat.size||!pinned(before,after)||!pinned(after,final))
   unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');
  try{return JSON.parse(content.toString('utf8'));}
  catch{unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');}
 }catch(e){
  if(e?.message==='RC2_PRIVATE_MANIFEST_UNSAFE')throw e;
  unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');
 }finally{if(h)await h.close();}
}
async function writeExclusive(stageRoot,body){
 const out=path.join(stageRoot,OUTPUT_NAME);
 let h;
 try{
  h=await fs.open(out,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await h.writeFile(body,'utf8');
  await h.sync();
  const st=await h.stat({bigint:true});
  if(!st.isFile()||st.nlink!==1n||!own(st)||(st.mode&0o077n)!==0n||
    st.size!==BigInt(Buffer.byteLength(body)))unsafe('RC2_PRIVATE_RENDER_IO');
  await h.close();h=null;
  const d=await fs.open(stageRoot,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await d.sync();}finally{await d.close();}
  return true;
 }catch(e){
  if(e?.code==='EEXIST')unsafe('RC2_CANDIDATE_EXISTS');
  unsafe('RC2_PRIVATE_RENDER_IO');
 }finally{if(h)await h.close();}
}
async function renderPrivateRc2Candidate(args){
 if(!exactArgs(args)||!validRoot(args.stageRoot))unsafe('RC2_PRIVATE_STAGE_UNSAFE');
 const stageRoot=args.stageRoot;
 await privateStage(stageRoot);
 const manifest=await readPrivateManifest(stageRoot);
 let candidate;
 try{candidate=createProductionComposeCandidate(manifest);}
 catch{unsafe('RC2_PRIVATE_MANIFEST_UNSAFE');}
 // Force no-clobber destination before rechecking private stage. Never handle
 // a stale / already produced candidate as an implicit "reuse this" approval.
 await privateStage(stageRoot);
 await writeExclusive(stageRoot,candidate.json);
 return Object.freeze({code:'RC2_PRIVATE_CANDIDATE_RENDERED',outputFile:OUTPUT_NAME,
  productionChangeAuthorized:false,deployed:false,ownerMacVerified:false,runtimeAttested:false});
}
module.exports={renderPrivateRc2Candidate};
if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length!==1){process.stderr.write('RC2_PRIVATE_STAGE_UNSAFE\n');process.exit(2);}
 renderPrivateRc2Candidate({stageRoot:args[0]}).then(result=>{
  process.stdout.write(result.code+' / NOT_DEPLOYED\n');
 }).catch(e=>{process.stderr.write((e&&e.message||'RC2_PRIVATE_RENDER_IO')+'\n');process.exitCode=2;});
}
