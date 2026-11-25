'use strict';
/**
 * Author a standalone, two-service RC2 production Compose candidate from
 * operator-private, independently inspected, SHA-pinned inputs.
 *
 * SOURCE ONLY: never reads secret files, writes a file, invokes Docker, starts
 * a process, changes a service, grants a release GO, or inspects the owner Mac.
 * Do NOT compose-merge this candidate with the old insecure production YAML:
 * Compose merge may retain the old /var/run/docker.sock bind and root user.
 */
const path=require('node:path');
const IMAGE=/^[a-z0-9][a-z0-9._/-]{1,160}@sha256:[0-9a-f]{64}$/;
const SOCKET=/(^|\/)docker\.sock($|\/)/;
// Host bind sources must survive a Mac reboot. Docker's internal tmpfs
// remains allowed: this guard applies ONLY to host paths in the manifest.
const TEMP_HOST_ROOTS=Object.freeze([
 '/tmp','/private/tmp','/var/tmp','/private/var/tmp',
 '/var/folders','/private/var/folders','/dev/shm','/run/user'
]);
function isEphemeralHostSource(value){
 const p=value.toLowerCase();
 return TEMP_HOST_ROOTS.some(root=>p===root||p.startsWith(root+'/'));
}
const PATH_KEYS=Object.freeze([
 'sourceRoot','ownerEnvFile','secretHostFile','spoolHostDir',
 'appsDir','overridesDir','sitesDir','artifactsDir',
 'nginxConf','defaultConf','nginxEntrypoint','certsDir','statusDir','dashboardDir'
]);
const TOP_KEYS=Object.freeze(['proxyImage','apiImage','apiUid','apiGid','paths']);
function plain(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const present=Reflect.ownKeys(o);
 if(present.length!==keys.length)return false;
 return keys.every(k=>typeof k==='string'&&present.includes(k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function validPath(p){
 return typeof p==='string'&&p.length>1&&p.length<1025&&p[0]==='/'&&
  p!=='/'&&!p.endsWith('/')&&path.posix.normalize(p)===p&&
  !/[\x00-\x1f\x7f]/.test(p)&&!SOCKET.test(p)&&!isEphemeralHostSource(p);
}
function inside(p,dir){return p===dir||p.startsWith(dir+'/');}
function validInputs(input){
 if(!plain(input,TOP_KEYS)||!plain(input.paths,PATH_KEYS))return false;
 if(!IMAGE.test(input.proxyImage)||!IMAGE.test(input.apiImage)||
  !Number.isSafeInteger(input.apiUid)||input.apiUid<100||input.apiUid>65534||
  !Number.isSafeInteger(input.apiGid)||input.apiGid<1||input.apiGid>65534)return false;
 const p=input.paths;
 if(PATH_KEYS.some(k=>!validPath(p[k])))return false;
 const shared=[p.sourceRoot,p.appsDir,p.overridesDir,p.sitesDir,p.artifactsDir,
  p.nginxConf,p.defaultConf,p.nginxEntrypoint,p.certsDir,p.statusDir,p.dashboardDir];
 // Secret and signed host IPC must NEVER be readable via /app:ro, any API RW
 // volume, or the proxy's mounted artifact/config/status/dashboard sources.
 for(const candidate of [p.secretHostFile,p.spoolHostDir]){
  if(shared.some(exposed=>inside(candidate,exposed)||inside(exposed,candidate)))return false;
 }
 if(inside(p.secretHostFile,p.spoolHostDir)||inside(p.spoolHostDir,p.secretHostFile))return false;
 if(p.spoolHostDir===p.ownerEnvFile||p.secretHostFile===p.ownerEnvFile)return false;
 // Prevent a private operator secret from being copied into a Docker service
 // through an accidental main source/root bind. Private env is API-only RO.
 if(shared.some(exposed=>inside(p.ownerEnvFile,exposed)||inside(exposed,p.ownerEnvFile)))return false;
 if(inside(p.ownerEnvFile,p.spoolHostDir)||inside(p.ownerEnvFile,p.secretHostFile))return false;
 return true;
}
function bind(source,target,read_only=true){
 return Object.freeze({type:'bind',source,target,read_only,bind:Object.freeze({create_host_path:false})});
}
function createProductionComposeCandidate(input){
 if(!validInputs(input))throw Error('INVALID_RC2_CANDIDATE');
 const p=input.paths;
 // `env_file` supplies current owner-provisioned credentials, trusted Origins,
 // and existing optional integration keys. No credentials appear in source.
 // Engine must independently prove the file is owner-private and preserved.
 const proxy={
  image:input.proxyImage,
  container_name:'dev-proxy',
  privileged:false,
  ports:['127.0.0.1:8080:80','127.0.0.1:443:443'],
  volumes:[
   bind(p.nginxConf,'/etc/nginx/nginx.conf'),
   bind(p.defaultConf,'/etc/nginx/conf.d/default.conf'),
   bind(p.sitesDir,'/etc/nginx/conf.d/sites-enabled'),
   bind(p.nginxEntrypoint,'/entrypoint.sh'),
   bind(p.artifactsDir,'/usr/share/nginx/html/.artifacts',false),
   bind(p.certsDir,'/etc/nginx/certs'),
   bind(p.statusDir,'/usr/share/nginx/html/status'),
   bind(p.dashboardDir,'/usr/share/nginx/html/dashboard')
  ],
  networks:['devproxy'],
  // nginx resolves the API upstream at startup; attach its container first.
  // Old reverse API -> proxy dependency caused first-start DNS failures.
  depends_on:['proxy-config-api'],
  restart:'unless-stopped',
  command:['sh','/entrypoint.sh'],
  healthcheck:{test:['CMD','wget','-qO-','http://127.0.0.1/health.json'],
   interval:'30s',timeout:'5s',retries:5}
 };
 const api={
  image:input.apiImage,
  container_name:'dev-proxy-config-api',
  user:`${input.apiUid}:${input.apiGid}`,
  privileged:false,
  read_only:true,
  cap_drop:['ALL'],
  security_opt:['no-new-privileges:true'],
  tmpfs:['/tmp:rw,nosuid,nodev,size=64m'],
  working_dir:'/app',
  // Preserve the preexisting production notification service. AUTO_SCAN is
  // explicitly OFF until a source/data-safe replacement is verified.
  command:['sh','-ec','node scripts/rc2-create-api-spool.cjs; node utils/notificationsAPI.js & exec node utils/proxyConfigAPI.js'],
  env_file:[p.ownerEnvFile],
  environment:{
   NODE_ENV:'production',
   NOTIFICATIONS_API_PORT:'3002',
   PORT:'3001',
   LOCAL_PROXY_BASE:'http://dev-proxy',
   AUTO_SCAN_ENABLED:'0',
   DEVPROXY_DENY_INLINE_DOCKER:'1',
   DEVPROXY_ALLOW_INLINE_DOCKER:'0',
   DEVPROXY_ACTIVATION_SPOOL_DIR:'/app/.artifacts/rc2-ipc/spool',
   DEVPROXY_ACTIVATION_SECRET_FILE:'/app/.artifacts/rc2-activation.secret'
  },
  ports:['127.0.0.1:3001:3001','127.0.0.1:3002:3002'],
  volumes:[
   bind(p.sourceRoot,'/app'),
   bind(p.ownerEnvFile,'/app/.env'),
   bind(p.appsDir,'/app/apps',false),
   bind(p.overridesDir,'/app/overrides',false),
   bind(p.sitesDir,'/app/build/sites-enabled',false),
   bind(p.artifactsDir,'/app/.artifacts',false),
   bind(p.spoolHostDir,'/app/.artifacts/rc2-ipc',false),
   bind(p.secretHostFile,'/app/.artifacts/rc2-activation.secret')
  ],
  networks:['devproxy'],
  restart:'unless-stopped'
 };
 const compose={name:'dev-tunnel-proxy',services:{proxy,'proxy-config-api':api},
  networks:{devproxy:{external:true,name:'devproxy'}}};
 return Object.freeze({code:'RC2_SOURCE_ONLY_COMPOSE_CANDIDATE',
  compose,json:JSON.stringify(compose,null,2)+'\n',
  productionChangeAuthorized:false,deployed:false,ownerMacVerified:false,runtimeAttested:false});
}
// Compare trusted, locally resolved Compose JSON documents. Never log either
// document: resolved configuration may contain private environment values.
// This is a supplemental static comparison, not Docker or provenance proof.
const {isDeepStrictEqual}=require('node:util');
const OFFICIAL_NODE_IMAGE=/^docker\.io\/library\/node@sha256:[0-9a-f]{64}$/;
const MAX_COMPOSE_JSON=2*1024*1024;
function imageTransitionResult(code,imageOnly=false){
 return Object.freeze({code,imageOnly,runtimeAttested:false,
  imageProvenanceVerified:false,productionChangeAuthorized:false,deployed:false});
}
function record(o){
 return !!o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
}
function hardenedApiBaseline(api){
 if(!record(api)||api.container_name!=='dev-proxy-config-api'||
  typeof api.user!=='string'||!/^\d+:\d+$/.test(api.user)||
  !api.user.split(':').every(n=>Number(n)>0&&Number(n)<=65534)||
  api.read_only!==true||(api.privileged!==undefined&&api.privileged!==false)||
  api.build!==undefined||api.network_mode!==undefined||
  api.pid==='host'||api.ipc==='host'||
  (api.cap_add!==undefined&&(!Array.isArray(api.cap_add)||api.cap_add.length!==0))||
  (api.devices!==undefined&&(!Array.isArray(api.devices)||api.devices.length!==0))||
  !Array.isArray(api.cap_drop)||!api.cap_drop.includes('ALL')||
  !Array.isArray(api.security_opt)||
  !api.security_opt.some(s=>s==='no-new-privileges:true'||s==='no-new-privileges=true')||
  !Array.isArray(api.volumes)||!Array.isArray(api.ports))return false;
 if(!api.volumes.every(v=>record(v)&&v.type==='bind'&&validPath(v.source)&&
   typeof v.target==='string'&&v.target.startsWith('/')&&!SOCKET.test(v.target)))return false;
 if(!api.volumes.some(v=>v.target==='/app'&&v.read_only===true))return false;
 if(api.ports.length!==2)return false;
 const ports=api.ports.map(p=>{
  if(typeof p==='string')return p;
  if(!record(p)||p.host_ip!=='127.0.0.1'||
     ![3001,3002].includes(Number(p.target))||
     String(p.published)!==String(p.target)||
     (p.protocol!==undefined&&p.protocol!=='tcp'))return '';
  return '127.0.0.1:'+p.published+':'+p.target;
 });
 return ports.includes('127.0.0.1:3001:3001')&&ports.includes('127.0.0.1:3002:3002');
}
function assessApiImageOnlyTransition(input){
 const invalid=()=>imageTransitionResult('RC2_API_IMAGE_ONLY_INVALID');
 try{
  if(!plain(input,['beforeJson','afterJson','candidateImage'])||
   typeof input.beforeJson!=='string'||typeof input.afterJson!=='string'||
   Buffer.byteLength(input.beforeJson)>MAX_COMPOSE_JSON||
   Buffer.byteLength(input.afterJson)>MAX_COMPOSE_JSON||
   typeof input.candidateImage!=='string'||!OFFICIAL_NODE_IMAGE.test(input.candidateImage))
   return invalid();
  const before=JSON.parse(input.beforeJson),after=JSON.parse(input.afterJson);
  if(!record(before)||!record(after)||!record(before.services)||!record(after.services)||
    !record(before.services.proxy)||!record(after.services.proxy))return invalid();
  const a=before.services['proxy-config-api'],b=after.services['proxy-config-api'];
  if(!hardenedApiBaseline(a)||!hardenedApiBaseline(b)||
     typeof a.image!=='string'||!a.image||a.image===input.candidateImage||
     b.image!==input.candidateImage)return invalid();
  // Both documents are private parsed copies. Compare the complete effective
  // configuration, allowing exactly one value to differ. No diff is emitted.
  a.image=input.candidateImage;
  if(!isDeepStrictEqual(before,after))
   return imageTransitionResult('RC2_API_IMAGE_ONLY_CONFIG_DRIFT');
  return imageTransitionResult('RC2_API_IMAGE_ONLY_SOURCE_MATCH',true);
 }catch{return invalid();}
}
module.exports={createProductionComposeCandidate,assessApiImageOnlyTransition};

