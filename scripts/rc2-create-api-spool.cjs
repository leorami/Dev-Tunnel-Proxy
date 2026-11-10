#!/usr/bin/env node
'use strict';
/**
 * API CONTAINER (nonroot) only: create private signed-spool child BELOW an
 * owner-approved bind-mounted IPC parent. Docker Desktop virtiofs can expose
 * a bind mount root as uid0 even when the host directory is owner-private.
 * The API must never use that bind root as its 0700 signed queue. Its own
 * 0700 child directory and queue leaves are created by the true API UID.
 *
 * Parent must be mode 01770, sticky and group writable, with no other bits;
 * parent is an isolated host-share path, NEVER project /app or owner data.
 * No credential file reads, request processing, Docker, service launch, or
 * cleanup is performed. Restart validates and preserves existing messages.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {constants}=require('node:fs');
const LEAVES=['requests','responses','replay','prepared','acks'];
function deny(code='RC2_API_SPOOL_UNSAFE'){throw Error(code);}
function safePath(p){return typeof p==='string'&&p.startsWith('/')&&p.length>6&&
 path.posix.normalize(p)===p&&!p.endsWith('/')&&!/\0|[\r\n]/.test(p)&&path.basename(p)==='spool';}
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode&&a.uid===b.uid&&a.gid===b.gid;}
async function ownedDir(p,uid){
 let st;
 try{st=await fs.lstat(p,{bigint:true});}catch{deny();}
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==BigInt(uid)||
    (st.mode&0o777n)!==0o700n||await fs.realpath(p)!==p)deny();
 return st;
}
async function createApiOwnedSpool({directory,identity=()=>({uid:process.getuid(),gid:process.getgid()})}={}){
 if(!safePath(directory)||typeof identity!=='function')deny('RC2_API_SPOOL_INVALID');
 const {uid,gid}=identity();
 if(!Number.isSafeInteger(uid)||uid<100||!Number.isSafeInteger(gid)||gid<1)deny('RC2_API_SPOOL_IDENTITY_UNSAFE');
 const parent=path.dirname(directory);
 let parentOriginal;
 try{parentOriginal=await fs.lstat(parent,{bigint:true});}catch{deny();}
 if(!parentOriginal.isDirectory()||parentOriginal.isSymbolicLink()||
  (parentOriginal.mode&0o7777n)!==0o1770n||parentOriginal.gid!==BigInt(gid)||
  await fs.realpath(parent)!==parent)deny('RC2_API_SPOOL_PARENT_UNSAFE');
 // Only the API user may own the queue children. We deliberately do not rely
 // on Docker Desktop's remapping of the parent mount root uid (which may be 0).
 try{await fs.mkdir(directory,{mode:0o700});}
 catch(e){if(e?.code!=='EEXIST')deny();}
 await ownedDir(directory,uid);
 for(const leaf of LEAVES){
  const p=path.join(directory,leaf);
  try{await fs.mkdir(p,{mode:0o700});}catch(e){if(e?.code!=='EEXIST')deny();}
  await ownedDir(p,uid);
 }
 const after=await fs.lstat(parent,{bigint:true});
 if(!same(parentOriginal,after))deny('RC2_API_SPOOL_PARENT_CHANGED');
 const d=await fs.open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{await d.sync();}finally{await d.close();}
 return Object.freeze({code:'RC2_API_PRIVATE_SPOOL_READY',
  productionChangeAuthorized:false,deployed:false,runtimeAttested:false});
}
module.exports={createApiOwnedSpool};
if(require.main===module){
 const target='/app/.artifacts/rc2-ipc/spool';
 if(process.argv.length!==2||process.env.NODE_ENV!=='production'||
   process.env.DEVPROXY_ACTIVATION_SPOOL_DIR!==target){
  process.stderr.write('RC2_API_SPOOL_INVALID\n');process.exitCode=2;
 }else createApiOwnedSpool({directory:target}).then(x=>{
  process.stdout.write(x.code+' / NOT_DEPLOYED\n');
 }).catch(e=>{process.stderr.write((e?.message?.startsWith('RC2_API_SPOOL_')?e.message:'RC2_API_SPOOL_UNSAFE')+'\n');process.exitCode=2;});
}
