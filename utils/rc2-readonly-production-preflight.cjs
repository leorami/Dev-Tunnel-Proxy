'use strict';
/**
 * Fixed-query, read-only Docker Desktop production preflight helper.
 * Inspects existing proxy and API by exact owner-approved full ID. No Docker
 * exec, Compose, nginx, file mutation, secret read, host worker, or deploy.
 * A result with no mismatches is REVIEW_ONLY and never constitutes a GO.
 */
const path=require('node:path');
const {execFile}=require('node:child_process');
const CID=/^[a-f0-9]{64}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const BINARIES=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const FORMATS=Object.freeze({
 id:'{{json .Id}}',image:'{{json .Image}}',running:'{{json .State.Running}}',
 privileged:'{{json .HostConfig.Privileged}}',user:'{{json .Config.User}}',
 mounts:'{{json .Mounts}}',ports:'{{json .HostConfig.PortBindings}}'
});
const NGINX_REQUIRED=Object.freeze([
 '/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf','/etc/nginx/conf.d/sites-enabled'
]);
const API_REQUIRED=Object.freeze([
 '/app','/app/.env','/app/apps','/app/overrides','/app/build/sites-enabled','/app/.artifacts'
]);
const API_SPOOL='/app/.artifacts/rc2-spool';
const API_SECRET='/app/.artifacts/rc2-activation.secret';
const API_WRITABLE=new Set(['/app/apps','/app/overrides',
 '/app/build/sites-enabled','/app/.artifacts',API_SPOOL]);
// These four directories MUST be RW or the real API silently loses route,
// override, regenerated-bundle or session durability. Never permit an
// operator-supplied pin to redefine a required data bind as read-only.
const API_REQUIRED_RW=Object.freeze(['/app/apps','/app/overrides',
 '/app/build/sites-enabled','/app/.artifacts']);
const PROXY_WRITABLE=new Set(['/usr/share/nginx/html/.artifacts']);
const SOCKET=/(^|\/)docker\.sock($|\/)/;
function safePath(p){return typeof p==='string'&&p.length<=1024&&p[0]==='/'&&p!=='/'&&
 path.posix.normalize(p)===p&&!p.endsWith('/')&&!p.includes('\0')&&!/[\r\n]/.test(p);}
function cleanPins(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype)return null;
 const normalized={};
 for(const role of ['proxy','api']){
  const item=input[role];
  if(!item||Object.getPrototypeOf(item)!==Object.prototype||!CID.test(item.containerId||'')||
    !IMAGE.test(item.image||'')||!Array.isArray(item.mounts)||item.mounts.length<3||
    item.mounts.length>32)return null;
  const seen=new Set();
  for(const m of item.mounts){
   if(!m||Object.getPrototypeOf(m)!==Object.prototype||
     Reflect.ownKeys(m).length!==3||!['destination','source','readOnly'].every(k=>Object.hasOwn(m,k))||
     !safePath(m.destination)||!safePath(m.source)||
     SOCKET.test(m.destination)||SOCKET.test(m.source)||seen.has(m.destination)||
     typeof m.readOnly!=='boolean')return null;
   if(!m.readOnly&&!(role==='api'?API_WRITABLE:PROXY_WRITABLE).has(m.destination))return null;
   seen.add(m.destination);
  }
  const required=role==='api'?API_REQUIRED:NGINX_REQUIRED;
  if(required.some(dest=>!seen.has(dest)))return null;
  if(item.mounts.some(m=>((role==='proxy'&&NGINX_REQUIRED.includes(m.destination))||
      (role==='api'&&(m.destination==='/app'||m.destination==='/app/.env')))&&!m.readOnly))
   return null;
  if(role==='api'&&API_REQUIRED_RW.some(dest=>
    !item.mounts.some(m=>m.destination===dest&&m.readOnly===false)))return null;
  normalized[role]=Object.freeze({id:item.containerId,image:item.image,mounts:item.mounts.map(m=>
   Object.freeze({destination:m.destination,source:m.source,readOnly:m.readOnly}))});
 }
 if(normalized.proxy.id===normalized.api.id)return null;
 // A v13 file-spool candidate needs BOTH a distinct owner-private writable
 // spool and an immutable signed-secret file. The historical RC1 layout does
 // not have either; it remains inspectable as BEFORE-state evidence only.
 const apiMounts=normalized.api.mounts;
 const spool=apiMounts.find(m=>m.destination===API_SPOOL);
 const secret=apiMounts.find(m=>m.destination===API_SECRET);
 if(Boolean(spool)!==Boolean(secret))return null;
 if(spool){
  if(spool.readOnly!==false||secret.readOnly!==true)return null;
  const exposed=[...normalized.proxy.mounts,
   ...apiMounts.filter(m=>m!==spool&&m!==secret)];
  const inside=(child,parent)=>child===parent||child.startsWith(parent+'/');
  // Neither host-worker IPC nor signing secret may be reachable through the
  // proxy's shared artifacts or any other source/data bind. Caller-supplied
  // private pins cannot override this confinement invariant.
  for(const m of [spool,secret]){
   if(exposed.some(x=>inside(m.source,x.source)||inside(x.source,m.source)))return null;
  }
  if(inside(spool.source,secret.source)||inside(secret.source,spool.source))return null;
 }
 return Object.freeze(normalized);
}
function identicalMounts(input,expected){
 if(!Array.isArray(input)||input.length!==expected.length)return false;
 const allowed=new Map(expected.map(m=>[m.destination,m]));const seen=new Set();
 for(const m of input){
  if(!m||Object.getPrototypeOf(m)!==Object.prototype||m.Type!=='bind'||
     !safePath(m.Source)||!safePath(m.Destination)||SOCKET.test(m.Source)||SOCKET.test(m.Destination)||
     typeof m.RW!=='boolean'||seen.has(m.Destination))return false;
  const wanted=allowed.get(m.Destination);
  if(!wanted||m.Source!==wanted.source||m.RW===wanted.readOnly)return false;
  seen.add(m.Destination);
 }
 return seen.size===expected.length;
}
function loopbackPorts(value){
 if(value===null)return true;
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;
 for(const entries of Object.values(value)){
  if(entries===null)continue;
  if(!Array.isArray(entries))return false;
  for(const b of entries){
   if(!b||!['127.0.0.1','::1'].includes(b.HostIp)||
      !/^\d{1,5}$/.test(String(b.HostPort))||Number(b.HostPort)<1||Number(b.HostPort)>65535)
    return false;
  }
 }
 return true;
}
function outcome(blockers){
 const b=Object.freeze([...new Set(blockers)]);
 return Object.freeze({code:b.length?'READ_ONLY_PREFLIGHT_BLOCKED':'EVIDENCE_FOR_INDEPENDENT_REVIEW_ONLY',
  blockers:b,productionChangeAuthorized:false,runtimeAttested:false,deployed:false,
  actualOwnerMacAttested:false,ownerUatApproved:false,sourceCurrent:'UNKNOWN',
  singleRuntime:'UNKNOWN',noShadowApps:'UNKNOWN',realAppVerified:'UNKNOWN',
  ownerWorkPreserved:'UNKNOWN'});
}
function createReadOnlyProductionPreflight({dockerBinary,execFileImpl=execFile,pins,
 home=process.env.HOME,timeoutMs=1600}={}){
 const checked=cleanPins(pins);
 if(!BINARIES.has(dockerBinary)||!checked||typeof execFileImpl!=='function'||
    !safePath(home)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>7000)
  throw Error('INVALID_RC2_PREFLIGHT');
 const opts=Object.freeze({shell:false,timeout:timeoutMs,maxBuffer:8192,windowsHide:true,
  env:Object.freeze({HOME:home,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'})});
 async function inspectField(containerId,format){
  return await new Promise(resolve=>{
   let done=false,timer;
   const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
   timer=setTimeout(()=>finish({error:'TIMED_OUT'}),timeoutMs);
   try{
    execFileImpl(dockerBinary,['inspect','--format',format,containerId],opts,(err,stdout)=>{
     if(err||typeof stdout!=='string'||Buffer.byteLength(stdout)>8192)return finish({error:'UNREADABLE'});
     try{return finish({value:JSON.parse(stdout)});}catch{return finish({error:'INVALID_JSON'});}
    });
   }catch{return finish({error:'INSPECT_FAILED'});}
  });
 }
 // Docker inspect returns separate fields at separate instants. The first
 // apparently safe read cannot be the basis for an RC2 release: run a full
 // second independent pass and require BOTH to conform to the same private
 // pins. This still is NOT an atomic snapshot and cannot authorize deploy.
 async function inspectRound(){
  const blockers=[];
  await Promise.all(['proxy','api'].map(async role=>{
   const pin=checked[role],result={};
   await Promise.all(Object.entries(FORMATS).map(async([name,format])=>{
    result[name]=await inspectField(pin.id,format);
   }));
   const prefix=role.toUpperCase();
   for(const [name,value] of Object.entries(result)){
    if(!value||Object.hasOwn(value,'error'))blockers.push(`${prefix}_${name.toUpperCase()}_UNAVAILABLE`);
   }
   const get=(key)=>result[key]&&Object.hasOwn(result[key],'value')?result[key].value:undefined;
   if(get('id')!==undefined&&get('id')!==pin.id)blockers.push(`${prefix}_ID_DRIFT`);
   if(get('image')!==undefined&&get('image')!==pin.image)blockers.push(`${prefix}_IMAGE_DRIFT`);
   if(get('running')!==undefined&&get('running')!==true)blockers.push(`${prefix}_NOT_RUNNING`);
   if(get('privileged')!==undefined&&get('privileged')!==false)blockers.push(`${prefix}_PRIVILEGED`);
   if(get('mounts')!==undefined&&!identicalMounts(get('mounts'),pin.mounts))
    blockers.push(`${prefix}_MOUNTS_MISMATCH`);
   if(get('ports')!==undefined&&!loopbackPorts(get('ports')))
    blockers.push(`${prefix}_PORTS_NOT_LOOPBACK`);
   if(role==='api'&&get('user')!==undefined&&
      (!/^[1-9][0-9]*(?::[0-9]+)?$/.test(String(get('user'))) ||
      String(get('user')).split(':')[0]==='0'))blockers.push('API_ROOT_USER');
  }));
  return blockers;
 }
 async function inspect(){
  const first=await inspectRound();
  if(first.length)return outcome(first.sort());
  const second=await inspectRound();
  return outcome(second.sort());
 }
 return Object.freeze({inspect});
}
module.exports={createReadOnlyProductionPreflight};
