'use strict';
/**
 * Turn an already-reviewed two-service RC2 production Compose candidate into a
 * SOURCE-ONLY, NO-PORT, PRIVATE-STAGE-ONLY, internal-network disposable restore
 * test candidate. It cannot be deployed by this module, cannot prove that the
 * private stage is physically isolated, and does not authorize any Docker.
 *
 * Build the parent with createProductionComposeCandidate() using paths pointing
 * ONLY at copies inside an existing operator-private disposable stage. Do not
 * supply owner-live Compose pins or use this as a runtime restore attestation.
 */
const path=require('node:path').posix;
const IMAGE=/^[a-z0-9][a-z0-9._/-]{1,160}@sha256:[a-f0-9]{64}$/;
const NONCE=/^test[a-z0-9]{4,12}$/;
const KEY='INVALID_RC2_ISOLATED_RESTORE_CANDIDATE';
const API_RW=new Set(['/app/apps','/app/overrides','/app/build/sites-enabled',
 '/app/.artifacts','/app/.artifacts/rc2-ipc']);
const PROXY_RW=new Set(['/usr/share/nginx/html/.artifacts']);
const API_REQUIRED=['/app','/app/.env','/app/apps','/app/overrides',
 '/app/build/sites-enabled','/app/.artifacts','/app/.artifacts/rc2-ipc',
 '/app/.artifacts/rc2-activation.secret'];
const PROXY_TARGETS=['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf',
 '/etc/nginx/conf.d/sites-enabled','/entrypoint.sh','/usr/share/nginx/html/.artifacts',
 '/etc/nginx/certs','/usr/share/nginx/html/status','/usr/share/nginx/html/dashboard'];
const API_TARGETS=['/app','/app/.env','/app/apps','/app/overrides',
 '/app/build/sites-enabled','/app/.artifacts','/app/.artifacts/rc2-ipc',
 '/app/.artifacts/rc2-activation.secret'];
const PROXY_FIELDS=['image','container_name','privileged','ports','volumes','networks','command','healthcheck'];
const API_FIELDS=['image','container_name','user','privileged','read_only','cap_drop','security_opt','tmpfs','working_dir','command','env_file','environment','ports','volumes','networks','depends_on'];
const PROXY_REQUIRED=['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf',
 '/etc/nginx/conf.d/sites-enabled','/entrypoint.sh'];
function bad(){throw Error(KEY);}
function plain(x){return !!x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;}
function own(o,k){return plain(o)&&Object.hasOwn(o,k)&&
 Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value');}
function safeAbsolute(s){return typeof s==='string'&&s.length>1&&s.length<=1024&&
 s.startsWith('/')&&s!=='/'&&!s.endsWith('/')&&path.normalize(s)===s&&
 !/[\x00-\x1f\x7f\\]/.test(s);}
function inside(p,stage){return safeAbsolute(p)&&p.startsWith(stage+'/')&&
 !/(^|\/)docker\.sock($|\/)/.test(p);}
function exactKeys(o,keys){return plain(o)&&Reflect.ownKeys(o).length===keys.length&&
 keys.every(k=>own(o,k));}
function verifyVolumes(service,stage,required,allowedRw,allowedTargets){
 if(!Array.isArray(service.volumes)||service.volumes.length<required.length||
   service.volumes.length>32)bad();
 const seen=new Set();
 for(const vol of service.volumes){
  if(!plain(vol)||vol.type!=='bind'||typeof vol.target!=='string'||
    !allowedTargets.includes(vol.target)||!inside(vol.source,stage)||
    typeof vol.read_only!=='boolean'||!plain(vol.bind)||vol.bind.create_host_path!==false||
    seen.has(vol.target)||/(^|\/)docker\.sock($|\/)/.test(vol.target))bad();
  if(!vol.read_only&&!allowedRw.has(vol.target))bad();
  seen.add(vol.target);
 }
 if(required.some(x=>!seen.has(x))||seen.size!==allowedTargets.length||
 allowedTargets.some(x=>!seen.has(x)))bad();
 const byTarget=new Map(service.volumes.map(v=>[v.target,v]));
 if(service===undefined)bad();
 return byTarget;
}
function createIsolatedNonrootRestoreCandidate(options={}){
 if(!exactKeys(options,['productionCandidate','privateStageRoot','nonce']))bad();
 const {productionCandidate:c,privateStageRoot:stage,nonce}=options;
 if(!safeAbsolute(stage)||!NONCE.test(nonce)||!plain(c)||
  c.code!=='RC2_SOURCE_ONLY_COMPOSE_CANDIDATE'||
  c.productionChangeAuthorized!==false||c.deployed!==false||
  !plain(c.compose))bad();
 const base=c.compose;
 if(!exactKeys(base.services,['proxy','proxy-config-api'])||
  !exactKeys(base.networks,['devproxy'])||
  !plain(base.networks.devproxy)||base.networks.devproxy.external!==true||
  base.networks.devproxy.name!=='devproxy')bad();
 const proxy=base.services.proxy,api=base.services['proxy-config-api'];
 if(!exactKeys(proxy,PROXY_FIELDS)||!exactKeys(api,API_FIELDS)||
  JSON.stringify(proxy.command)!=='["sh","/entrypoint.sh"]'||
  JSON.stringify(api.command)!=='["sh","-ec","node scripts/rc2-create-api-spool.cjs; node utils/notificationsAPI.js & exec node utils/proxyConfigAPI.js"]'||
  JSON.stringify(api.depends_on)!=='["proxy"]'||
  JSON.stringify(api.tmpfs)!=='["/tmp:rw,nosuid,nodev,size=64m"]'||
  api.working_dir!=='/app'||
  !IMAGE.test(proxy.image)||!IMAGE.test(api.image)||
  proxy.container_name!=='dev-proxy'||api.container_name!=='dev-proxy-config-api'||
  proxy.privileged!==false||api.privileged!==false||api.read_only!==true||
  !/^[1-9][0-9]*:[1-9][0-9]*$/.test(api.user)||
  !Array.isArray(api.cap_drop)||api.cap_drop.length!==1||api.cap_drop[0]!=='ALL'||
  !Array.isArray(api.security_opt)||!api.security_opt.includes('no-new-privileges:true')||
  !plain(api.environment)||api.environment.DEVPROXY_DENY_INLINE_DOCKER!=='1'||
  api.environment.DEVPROXY_ALLOW_INLINE_DOCKER!=='0'||
  api.environment.DEVPROXY_ACTIVATION_SPOOL_DIR!=='/app/.artifacts/rc2-ipc/spool'||
  !Array.isArray(proxy.networks)||JSON.stringify(proxy.networks)!=='["devproxy"]'||
  !Array.isArray(api.networks)||JSON.stringify(api.networks)!=='["devproxy"]'||
  !Array.isArray(proxy.ports)||!Array.isArray(api.ports)||
  !Array.isArray(api.env_file)||api.env_file.length!==1||!inside(api.env_file[0],stage))bad();
 const pv=verifyVolumes(proxy,stage,PROXY_REQUIRED,PROXY_RW,PROXY_TARGETS);
 const av=verifyVolumes(api,stage,API_REQUIRED,API_RW,API_TARGETS);
 for(const t of ['/app','/app/.env','/app/.artifacts/rc2-activation.secret']){
  if(av.get(t).read_only!==true)bad();
 }
 for(const t of ['/app/apps','/app/overrides','/app/build/sites-enabled','/app/.artifacts',
  '/app/.artifacts/rc2-ipc'])if(av.get(t).read_only!==false)bad();
 for(const t of PROXY_REQUIRED)if(pv.get(t).read_only!==true)bad();
 if(av.get('/app/.env').source!==api.env_file[0])bad();
 // No input object is mutated. This is a transformed document, not a Docker
 // command or a statement that stage copies, image digests or services exist.
 const compose=JSON.parse(JSON.stringify(base));
 const isolated='devproxy-restore-'+nonce;
 compose.name=isolated;
 compose.services.proxy.container_name=isolated+'-proxy';
 compose.services['proxy-config-api'].container_name=isolated+'-api';
 for(const service of Object.values(compose.services)){
  service.ports=[];
  service.networks=[isolated];
 }
 compose.networks={[isolated]:{driver:'bridge',internal:true}};
 return Object.freeze({
  code:'RC2_ISOLATED_NONROOT_RESTORE_SOURCE_ONLY',compose,
  json:JSON.stringify(compose,null,2)+'\n',
  productionChangeAuthorized:false,releaseAuthorized:false,
  deployed:false,restoreVerified:false,ownerMacVerified:false,
  secureNonrootCandidateRestoreAttested:false,privateStageInodeVerified:false,
  originFiveAfterAttested:false
 });
}
module.exports={createIsolatedNonrootRestoreCandidate};
