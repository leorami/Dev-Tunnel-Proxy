'use strict';
/**
 * Source-only, Mac HOST process fixed-action Docker driver. No startup, socket,
 * service, API import, owner paths, secret read, or owner authorization occurs.
 * This composes the existing SHA-pinned v5 Docker execFile adapter with a
 * nonsecret read-only inspect of the ENTIRE mount set and privilege bit.
 *
 * An owner-authorized host worker must still supply its private full ID,
 * image digest, exact mount-source allowlist, and a separate narrowly scoped
 * authorization callback. A test-owned callback is NOT owner permission.
 * The module never returns source paths, inspect bytes or private data.
 */
const {execFile}=require('node:child_process');
const path=require('node:path');
const {createHostDockerAdapter}=require('./host-execfile-adapter.cjs');
const CID=/^[a-f0-9]{64}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const SAFE_PROPS=new Set(['Type','Source','Destination','RW','Mode','Propagation','Name','Driver']);
const PRIV_FMT='{{json .HostConfig.Privileged}}';
const MOUNT_FMT='{{json .Mounts}}';
const REQUIRED_NGINX=Object.freeze(['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf',
 '/etc/nginx/conf.d/sites-enabled']);
const RW_ALLOW=new Set(['/usr/share/nginx/html/.artifacts']);
const ACTIONS=new Set(['nginx-test','nginx-reload']);
const BINARIES=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
function validPath(p){
 return typeof p==='string'&&p.startsWith('/')&&p!=='/'&&p.length<=1024&&
  path.posix.normalize(p)===p&&!p.endsWith('/')&&!p.includes('\0')&&!/[\r\n]/.test(p)&&
  !p.split('/').includes('..');
}
function socketPath(p){return typeof p==='string'&&(/(^|\/)docker\.sock($|\/)/).test(p);}
function safeExpectedMounts(expected){
 if(!Array.isArray(expected)||expected.length<3||expected.length>32)return null;
 const found=new Map();
 for(const entry of expected){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     Object.getPrototypeOf(entry)!==Object.prototype||
     Reflect.ownKeys(entry).length!==3||
     !['destination','source','readOnly'].every(k=>Object.hasOwn(entry,k)))return null;
  const {destination,source,readOnly}=entry;
  if(!validPath(destination)||!validPath(source)||socketPath(destination)||socketPath(source)||
    typeof readOnly!=='boolean'||found.has(destination)||
    (!readOnly&&!RW_ALLOW.has(destination))||
    (REQUIRED_NGINX.includes(destination)&&!readOnly))return null;
  found.set(destination,Object.freeze({source,readOnly}));
 }
 if(REQUIRED_NGINX.some(p=>!found.has(p)||!found.get(p).readOnly))return null;
 return found;
}
function sameMounts(output,expected){
 if(!Array.isArray(output)||output.length!==expected.size)return false;
 const observed=new Set();
 for(const mount of output){
  if(!mount||typeof mount!=='object'||Array.isArray(mount)||
    Object.getPrototypeOf(mount)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(mount);
  if(keys.some(k=>typeof k!=='string'||!SAFE_PROPS.has(k)||
   !Object.hasOwn(Object.getOwnPropertyDescriptor(mount,k),'value')))return false;
  if(mount.Type!=='bind'||typeof mount.Destination!=='string'||
     typeof mount.Source!=='string'||typeof mount.RW!=='boolean'||
     observed.has(mount.Destination)||socketPath(mount.Destination)||socketPath(mount.Source))return false;
  const wanted=expected.get(mount.Destination);
  if(!wanted||mount.Source!==wanted.source||mount.RW===wanted.readOnly)return false;
  if(Object.hasOwn(mount,'Name')&&mount.Name!==''&&mount.Name!==null)return false;
  if(Object.hasOwn(mount,'Driver')&&mount.Driver!==''&&mount.Driver!==null)return false;
  observed.add(mount.Destination);
 }
 return observed.size===expected.size;
}
function createMountLockedHostDockerDriver({dockerBinary,approvedContainerId,approvedImage,
 expectedMounts,execFileImpl=execFile,authorizeFixedHostAction,home=process.env.HOME,
 timeoutMs=7000}={}){
 const expected=safeExpectedMounts(expectedMounts);
 if(!BINARIES.has(dockerBinary)||!CID.test(approvedContainerId||'')||
    !IMAGE.test(approvedImage||'')||!expected||typeof execFileImpl!=='function'||
    (authorizeFixedHostAction!==undefined&&typeof authorizeFixedHostAction!=='function')||
    typeof home!=='string'||!home.startsWith('/')||!Number.isInteger(timeoutMs)||
    timeoutMs<100||timeoutMs>7000)throw Error('INVALID_HOST_MOUNT_ATTESTATION_CONFIG');
 const base=createHostDockerAdapter({dockerBinary,approvedContainerId,approvedImage,
  execFileImpl,home});
 const opts=Object.freeze({shell:false,timeout:timeoutMs,maxBuffer:4096,windowsHide:true,
  env:Object.freeze({HOME:home,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'})});
 async function inspect(format,signal){
  if(signal?.aborted)return null;
  return await new Promise(resolve=>{
   let done=false,timer=null;
   const onAbort=()=>finish(null);
   function finish(value){
    if(done)return;done=true;
    if(timer!==null)clearTimeout(timer);
    if(signal)signal.removeEventListener('abort',onAbort);
    resolve(value);
   }
   timer=setTimeout(()=>finish(null),timeoutMs);
   if(signal)signal.addEventListener('abort',onAbort,{once:true});
   try{
    execFileImpl(dockerBinary,['inspect','--format',format,approvedContainerId],
      {...opts,signal},(err,stdout)=>{
       if(err||signal?.aborted||typeof stdout!=='string'||
         Buffer.byteLength(stdout)>4096)return finish(null);
       finish(stdout);
      });
   }catch{finish(null);}
  });
 }
 async function attest(signal){
  if(signal?.aborted)return false;
  try{
   if(await base.attest(signal)!==true||signal?.aborted)return false;
   const privileged=await inspect(PRIV_FMT,signal);
   if(privileged===null||privileged.trim()!=='false'||signal?.aborted)return false;
   const text=await inspect(MOUNT_FMT,signal);
   if(text===null||signal?.aborted)return false;
   let mounts;try{mounts=JSON.parse(text);}catch{return false;}
   if(!sameMounts(mounts,expected)||signal?.aborted)return false;
   return await base.attest(signal)===true&&!signal?.aborted;
  }catch{return false;}
 }
 async function execute(action,signal){
  if(!ACTIONS.has(action)||signal?.aborted||typeof authorizeFixedHostAction!=='function')return 1;
  try{
   if(await authorizeFixedHostAction(action,signal)!==true||signal?.aborted||
      !await attest(signal)||signal?.aborted)return 1;
   if(await base.execute(action,signal)!==0||signal?.aborted)return 1;
   return await attest(signal)?0:1;
  }catch{return 1;}
 }
 return Object.freeze({attest,execute,mayInvokeHostDocker:true,ownerAuthorizationEstablished:false});
}
module.exports={createMountLockedHostDockerDriver};
