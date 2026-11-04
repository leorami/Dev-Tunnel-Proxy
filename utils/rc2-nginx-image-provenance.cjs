'use strict';
/**
 * Mac HOST read-only, source/image-pinned nginx/Brotli/mime provenance gate.
 * No Docker socket inside containers, no mutation, no 'GO' status. Requires
 * pre-reviewed expected nginx -T digest, exact included files and sha256 of
 * immutable image-supplied mime + Brotli dynamic modules. Never returns
 * loaded configuration text, module bytes or any private source paths.
 *
 * This is supplementary to the signed v13 route candidate and mount/UID
 * preflight. A passing read-only check cannot prove absence of writers.
 */
const {execFile}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const CID=/^[0-9a-f]{64}$/;
const IMAGE=/^sha256:[0-9a-f]{64}$/;
const HEX=/^[0-9a-f]{64}$/;
const BINARIES=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const IMAGE_PATHS=Object.freeze([
 '/etc/nginx/mime.types',
 '/usr/lib/nginx/modules/ngx_http_brotli_filter_module.so',
 '/usr/lib/nginx/modules/ngx_http_brotli_static_module.so'
]);
const CONFIG_REQUIRED=Object.freeze([
 '/etc/nginx/nginx.conf','/etc/nginx/mime.types',
 '/etc/nginx/conf.d/default.conf','/etc/nginx/conf.d/sites-enabled/apps.generated.conf'
]);
const MODULE_DIRECTIVES=Object.freeze([
 'modules/ngx_http_brotli_filter_module.so',
 'modules/ngx_http_brotli_static_module.so'
]);
const MAX_NGINX_BYTES=4*1024*1024;
const evidence=(ok,files=0)=>Object.freeze({code:ok?'NGINX_PROVENANCE_EVIDENCE_ONLY':'NGINX_PROVENANCE_BLOCKED',
  filesVerified:ok?files:0,imageFilesVerified:ok?3:0,productionChangeAuthorized:false,
  runtimeAttested:false,deployed:false,originFiveVerified:false,ownerUatApproved:false});
function validConfig(p){return typeof p==='string'&&p.startsWith('/etc/nginx/')&&
  path.posix.normalize(p)===p&&!p.endsWith('/')&&!/[\r\n\0]/.test(p)&&
  (p.endsWith('.conf')||p==='/etc/nginx/mime.types');}
function validFiles(files){
 if(!Array.isArray(files)||files.length<CONFIG_REQUIRED.length||files.length>64||
    new Set(files).size!==files.length||files.some(p=>!validConfig(p)))return false;
 return CONFIG_REQUIRED.every(p=>files.includes(p));
}
function validModuleDigests(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype||
   Reflect.ownKeys(input).length!==IMAGE_PATHS.length)return false;
 return IMAGE_PATHS.every(p=>Object.hasOwn(input,p)&&HEX.test(input[p]));
}
function configSources(dump){
 const paths=[...dump.matchAll(/^# configuration file (\/[^\r\n:]+):\s*$/gm)].map(x=>x[1]);
 if(paths.length<CONFIG_REQUIRED.length||paths.length>64||new Set(paths).size!==paths.length||
    paths.some(p=>!validConfig(p)))return null;
 return paths;
}
function moduleReferences(dump){
 const loaded=[...dump.matchAll(/^\s*load_module\s+([^;\r\n]+);\s*$/gm)].map(x=>x[1]);
 if(loaded.length!==MODULE_DIRECTIVES.length)return false;
 return MODULE_DIRECTIVES.every(p=>loaded.filter(x=>x===p).length===1);
}
function validSums(stdout,digests){
 if(typeof stdout!=='string'||stdout.length>1024)return false;
 const lines=stdout.trim().split('\n');
 if(lines.length!==IMAGE_PATHS.length)return false;
 return IMAGE_PATHS.every((file,i)=>{
  const line=lines[i],m=line.match(/^([a-f0-9]{64})  (\/[^\r\n]+)$/);
  return m&&m[2]===file&&crypto.timingSafeEqual(Buffer.from(m[1],'hex'),Buffer.from(digests[file],'hex'));
 });
}
function createReadOnlyNginxProvenance({dockerBinary,containerId,image,expectedDumpSha256,
 expectedConfigFiles,expectedImageFileSha256,home=process.env.HOME,
 execFileImpl=execFile,timeoutMs=7000}={}){
 if(!BINARIES.has(dockerBinary)||!CID.test(containerId||'')||!IMAGE.test(image||'')||
  !HEX.test(expectedDumpSha256||'')||!validFiles(expectedConfigFiles)||
  !validModuleDigests(expectedImageFileSha256)||typeof execFileImpl!=='function'||
  typeof home!=='string'||home[0]!=='/'||path.posix.normalize(home)!==home||
  !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>7000)
  throw Error('INVALID_NGINX_PROVENANCE_PINS');
 const opts={shell:false,timeout:timeoutMs,maxBuffer:MAX_NGINX_BYTES,windowsHide:true,
  env:Object.freeze({HOME:home,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'})};
 const execute=(args)=>new Promise((resolve,reject)=>{
  let completed=false;
  const timer=setTimeout(()=>finish(Error('DOCKER_READ_TIMEOUT')),timeoutMs);
  function finish(err,result){if(completed)return;completed=true;clearTimeout(timer);err?reject(err):resolve(result);}
  try{
   execFileImpl(dockerBinary,args,opts,(e,out)=>{
    if(e||typeof out!=='string'||Buffer.byteLength(out)>MAX_NGINX_BYTES)
     return finish(Error('DOCKER_READ_FAILED'));
    finish(null,out);
   });
  }catch{finish(Error('DOCKER_READ_FAILED'));}
 });
 async function inspectIdentity(){
  const result=[];
  for(const f of ['{{json .Id}}','{{json .Image}}','{{json .State.Running}}']){
   const value=JSON.parse((await execute(['inspect','--format',f,containerId])).trim());
   result.push(value);
  }
  return result[0]===containerId&&result[1]===image&&result[2]===true;
 }
 async function inspect(){
  try{
   if(!await inspectIdentity())return evidence(false);
   const dump=await execute(['exec',containerId,'nginx','-T']);
   if(!dump||Buffer.byteLength(dump)>MAX_NGINX_BYTES||
      crypto.createHash('sha256').update(dump).digest('hex')!==expectedDumpSha256)
    return evidence(false);
   const sources=configSources(dump);
   if(!sources||sources.length!==expectedConfigFiles.length||
      sources.some(x=>!expectedConfigFiles.includes(x))||!moduleReferences(dump))
    return evidence(false);
   const sums=await execute(['exec',containerId,'sha256sum',...IMAGE_PATHS]);
   if(!validSums(sums,expectedImageFileSha256))return evidence(false);
   // Identity is re-read AFTER the loaded configuration and immutable modules.
   // This is not an atomic snapshot or a substitute for RO source confinement.
   if(!await inspectIdentity())return evidence(false);
   return evidence(true,sources.length);
  }catch{return evidence(false);}
 }
 return Object.freeze({inspect});
}
module.exports={createReadOnlyNginxProvenance};
