'use strict';
/**
 * One-purpose, read-only Docker Desktop cross-UID IPC identity probe.
 * It proves that the ACTUAL API process UID/GID, rather than a synthetic
 * docker exec -u override, can access the precise privately pinned stage
 * spool/secret binds. It never reads signing-secret bytes, writes the spool,
 * installs a worker, changes Docker, or grants production authority.
 *
 * The full RC2 preflight and host-owned stat remain separate required gates.
 */
const {execFile}=require('node:child_process');
const path=require('node:path');
const CID=/^[0-9a-f]{64}$/;
const IMAGE=/^sha256:[0-9a-f]{64}$/;
const BINARIES=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const DEST_PARENT='/app/.artifacts/rc2-ipc';
const DEST_SPOOL=DEST_PARENT+'/spool';
const DEST_SECRET='/app/.artifacts/rc2-activation.secret';
const FORMATS={
 id:'{{json .Id}}',image:'{{json .Image}}',running:'{{json .State.Running}}',
 user:'{{json .Config.User}}',mounts:'{{json .Mounts}}'
};
const SCRIPT=[
 "'use strict'", "const fs=require('node:fs')",
 `const a=fs.lstatSync('${DEST_SPOOL}')`,
 `const b=fs.lstatSync('${DEST_SECRET}')`,
 'const uid=process.getuid(),gid=process.getgid()',
 'let spoolAccessible=false,secretReadable=false',
 `try{fs.accessSync('${DEST_SPOOL}',fs.constants.R_OK|fs.constants.W_OK|fs.constants.X_OK);spoolAccessible=true}catch{}`,
 `try{const fd=fs.openSync('${DEST_SECRET}',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);fs.closeSync(fd);secretReadable=true}catch{}`,
 'process.stdout.write(JSON.stringify({uid,gid,spoolOwnerUid:a.uid,spoolMode:a.mode&0o777,secretOwnerUid:b.uid,secretMode:b.mode&0o777,spoolAccessible,secretReadable})+"\\n")'
].join(';');
const keys=['uid','gid','spoolOwnerUid','spoolMode','secretOwnerUid','secretMode','spoolAccessible','secretReadable'];
function safePath(p){return typeof p==='string'&&p.length>1&&p[0]==='/'&&p!=='/'&&path.posix.normalize(p)===p&&
 !p.endsWith('/')&&p.length<=1024&&!/[\x00-\x1f\x7f]/.test(p)&&!/(^|\/)docker\.sock($|\/)/.test(p);}
const result=(ok,uid)=>Object.freeze({code:ok?'API_SPOOL_CROSS_UID_EVIDENCE_ONLY':'API_SPOOL_CROSS_UID_BLOCKED',
 apiUidObserved:ok?uid:null,productionChangeAuthorized:false,deployed:false,runtimeAttested:false,ownerUatApproved:false});
function createApiSpoolIdentityProbe({dockerBinary,containerId,image,spoolHostDir,secretHostFile,
 apiUid,apiGid,home=process.env.HOME,execFileImpl=execFile,timeoutMs=1800}={}){
 if(!BINARIES.has(dockerBinary)||!CID.test(containerId||'')||!IMAGE.test(image||'')||
   !safePath(spoolHostDir)||!safePath(secretHostFile)||
   spoolHostDir===secretHostFile||secretHostFile.startsWith(spoolHostDir+'/')||
   spoolHostDir.startsWith(secretHostFile+'/')||
   !Number.isSafeInteger(apiUid)||apiUid<100||apiUid>65534||
   !Number.isSafeInteger(apiGid)||apiGid<1||apiGid>65534||
   !safePath(home)||typeof execFileImpl!=='function'||
   !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>7000)
  throw Error('RC2_SPOOL_IDENTITY_INVALID');
 const opts=Object.freeze({shell:false,timeout:timeoutMs,maxBuffer:8192,windowsHide:true,
  env:Object.freeze({HOME:home,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'})});
 function execute(args){
  return new Promise((resolve,reject)=>{
   let done=false,timer;
   const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(value);};
   timer=setTimeout(()=>finish(Error('RC2_SPOOL_DOCKER_TIMEOUT')),timeoutMs);
   try{execFileImpl(dockerBinary,args,opts,(err,stdout)=>{
    if(err||typeof stdout!=='string'||Buffer.byteLength(stdout)>8192)return finish(Error('RC2_SPOOL_DOCKER_UNREADABLE'));
    finish(null,stdout);
   });}catch{finish(Error('RC2_SPOOL_DOCKER_UNREADABLE'));}
  });
 }
 async function round(){
  const entries=await Promise.all(Object.entries(FORMATS).map(async([k,v])=>
   [k,JSON.parse((await execute(['inspect','--format',v,containerId])).trim())]));
  const d=Object.fromEntries(entries);
  if(d.id!==containerId||d.image!==image||d.running!==true||d.user!==`${apiUid}:${apiGid}`||
    !Array.isArray(d.mounts))return false;
  const seen=new Set();let spool=0,secret=0;
  for(const m of d.mounts){
   if(!m||typeof m!=='object'||Array.isArray(m)||Object.getPrototypeOf(m)!==Object.prototype||
     m.Type!=='bind'||!safePath(m.Source)||!safePath(m.Destination)||
     typeof m.RW!=='boolean'||seen.has(m.Destination))return false;
   seen.add(m.Destination);
   if(m.Destination===DEST_PARENT){if(m.Source!==spoolHostDir||m.RW!==true)return false;spool++;}
   if(m.Destination===DEST_SECRET){if(m.Source!==secretHostFile||m.RW!==false)return false;secret++;}
   if((m.Source===secretHostFile&&m.Destination!==DEST_SECRET)||
      (m.Source===spoolHostDir&&m.Destination!==DEST_PARENT))return false;
  }
  return spool===1&&secret===1;
 }
 async function inspect(){
  try{
   if(!await round())return result(false);
   const stdout=await execute(['exec',containerId,'node','-e',SCRIPT]);
   const o=JSON.parse(stdout);
   if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype||
      Reflect.ownKeys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)||
       !Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'))||
      o.uid!==apiUid||o.gid!==apiGid||o.spoolOwnerUid!==apiUid||o.secretOwnerUid!==apiUid||
      o.spoolMode!==0o700||o.secretMode!==0o600||o.spoolAccessible!==true||
      o.secretReadable!==true)return result(false);
   if(!await round())return result(false);
   return result(true,apiUid);
  }catch{return result(false);}
 }
 return Object.freeze({inspect});
}
module.exports={createApiSpoolIdentityProbe};
