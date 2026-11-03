'use strict';
/**
 * Pure guard for a redacted, parsed effective Compose model.
 * No Docker, filesystem, network, shell, credential access, or production writes.
 * It is NOT an authority to deploy, even if all local structural checks pass.
 * Caller must independently attest provenance, nginx behavior and live state.
 */
const path=require('node:path');
const TOP=new Set(['services','name','networks','volumes']);
const SERVICE_NAMES=new Set(['proxy','proxy-config-api']);
const LOOPBACK=new Set(['127.0.0.1','::1','[::1]']);
function own(o,k){
  if(o===null||typeof o!=='object')return {ok:false};
  const d=Object.getOwnPropertyDescriptor(o,k);
  return d&&Object.hasOwn(d,'value')?{ok:true,value:d.value}:{ok:false};
}
function record(o){
  if(o===null||typeof o!=='object'||Array.isArray(o))return false;
  const p=Object.getPrototypeOf(o);
  if(p!==Object.prototype&&p!==null)return false;
  return Reflect.ownKeys(o).every(k=>typeof k==='string'&&own(o,k).ok);
}
function arr(o){return Array.isArray(o)&&Reflect.ownKeys(o).every(k=>k==='length'||(typeof k==='string'&&/^\d+$/.test(k)&&own(o,k).ok));}
function reply(code){return Object.freeze({code,blockers:Object.freeze(code==='EFFECTIVE_COMPOSE_PLAN_ONLY'?[]:[code]),productionChangeAuthorized:false,performedActions:false,deployed:false});}
const int=v=>(typeof v==='number'&&Number.isSafeInteger(v))?v:(typeof v==='string'&&/^\d+$/.test(v)?Number(v):NaN);
function uniqueMounts(service){
  const m=own(service,'volumes');if(!m.ok||!arr(m.value))return null;
  const mounts=new Map();
  for(const raw of m.value){
    if(!record(raw))return null;
    const t=own(raw,'target'),s=own(raw,'source'),type=own(raw,'type'),ro=own(raw,'read_only');
    if(!t.ok||typeof t.value!=='string'||!s.ok||typeof s.value!=='string'||!path.posix.isAbsolute(s.value)||
       !type.ok||type.value!=='bind'||!ro.ok||typeof ro.value!=='boolean'||mounts.has(t.value))return null;
    mounts.set(t.value,{source:s.value,readOnly:ro.value});
  }
  return mounts;
}
function inspectPorts(api){
  const p=own(api,'ports');if(!p.ok||!arr(p.value))return 'API_PORT_SURFACE_MISMATCH';
  if(p.value.length!==2)return 'API_PORT_SURFACE_MISMATCH';
  const found=new Set();
  for(const one of p.value){
    if(!record(one))return 'INVALID_EVIDENCE';
    const target=own(one,'target'),pub=own(one,'published'),host=own(one,'host_ip');
    const t=int(target.value),p=int(pub.value);
    if(!Number.isSafeInteger(t)||!Number.isSafeInteger(p)||!new Set([3001,3002]).has(t)||p!==t||found.has(t))return 'API_PORT_SURFACE_MISMATCH';
    if(!host.ok||typeof host.value!=='string'||!LOOPBACK.has(host.value))return 'API_PUBLISHED_OUTSIDE_LOOPBACK';
    found.add(t);
  }
  return null;
}
function inspectPublicPorts(proxy){
  const p=own(proxy,'ports');
  if(!p.ok||!arr(p.value)||p.value.length!==2)return 'PROXY_PORT_SURFACE_MISMATCH';
  const actual=new Set();
  for(const raw of p.value){
    if(!record(raw))return 'INVALID_EVIDENCE';
    const target=own(raw,'target'),pub=own(raw,'published');
    if(!target.ok||!pub.ok)return 'PROXY_PORT_SURFACE_MISMATCH';
    const value=int(target.value),published=int(pub.value);
    const expected=value===80?8080:value===443?443:NaN;
    if(!Number.isSafeInteger(expected)||published!==expected||actual.has(value))return 'PROXY_PORT_SURFACE_MISMATCH';
    actual.add(value);
  }
  return null;
}
function inspectEffectiveCompose(raw){
  try{
    if(!record(raw)||Reflect.ownKeys(raw).some(k=>!TOP.has(k)))return reply('INVALID_EVIDENCE');
    const services=own(raw,'services');
    if(!services.ok||!record(services.value))return reply('INVALID_EVIDENCE');
    const names=Reflect.ownKeys(services.value);
    if(names.length!==2||names.some(n=>!SERVICE_NAMES.has(n)))return reply('SERVICE_SCOPE_MISMATCH');
    const proxy=own(services.value,'proxy'),api=own(services.value,'proxy-config-api');
    if(!proxy.ok||!api.ok||!record(proxy.value)||!record(api.value))return reply('INVALID_EVIDENCE');
    if(own(proxy.value,'container_name').value!=='dev-proxy'||own(api.value,'container_name').value!=='dev-proxy-config-api')return reply('SERVICE_SCOPE_MISMATCH');
    const env=own(api.value,'environment');if(!env.ok||!record(env.value))return reply('INVALID_EVIDENCE');
    // Reject direct env_file injection regardless of name/contents.
    const envFiles=own(api.value,'env_file');
    if(envFiles.ok&&((arr(envFiles.value)&&envFiles.value.length!==0)||(!arr(envFiles.value)&&envFiles.value!==null)))return reply('API_AUTH_OVERRIDE');
    // Existing ADMIN_PASSWORD must be sourced from the preserved owner store.
    // Any resolved explicit key, even empty, shadows the existing credential.
    if(own(env.value,'ADMIN_PASSWORD').ok)return reply('API_AUTH_OVERRIDE');
    const origins=own(env.value,'DEVPROXY_TRUSTED_ORIGINS');
    if(!origins.ok||typeof origins.value!=='string'||!origins.value.trim())return reply('MISSING_TRUSTED_ORIGINS');
    const publicPorts=inspectPublicPorts(proxy.value);if(publicPorts)return reply(publicPorts);
    const ports=inspectPorts(api.value);if(ports)return reply(ports);
    const n=uniqueMounts(proxy.value),a=uniqueMounts(api.value);
    if(!n||!a)return reply('INVALID_EVIDENCE');
    const required=[['/app',true],['/app/.env',true],['/app/.artifacts',false],['/app/config',false],['/app/build/sites-enabled',false]];
    if(required.some(([target,ro])=>!a.has(target)||a.get(target).readOnly!==ro))return reply('MOUNT_CONTINUITY_MISMATCH');
    if(!n.has('/etc/nginx/conf.d/default.conf')||n.get('/etc/nginx/conf.d/default.conf').readOnly!==true||!n.has('/etc/nginx/conf.d/sites-enabled')||n.get('/etc/nginx/conf.d/sites-enabled').readOnly!==true)return reply('MOUNT_CONTINUITY_MISMATCH');
    const ownerEnv=a.get('/app/.env').source,ownerArtifacts=a.get('/app/.artifacts').source;
    if(!ownerEnv.endsWith('/.env')||!ownerArtifacts.endsWith('/.artifacts')||path.posix.dirname(ownerEnv)!==path.posix.dirname(ownerArtifacts))return reply('MOUNT_CONTINUITY_MISMATCH');
    // A second submount can mask the preserved session even when the parent bind is correct.
    for(const target of a.keys()){
      if(['/app/.artifacts/','/app/.env/','/app/config/','/app/build/sites-enabled/'].some(prefix=>target.startsWith(prefix)))return reply('UNREVIEWED_SHADOW_MOUNT');
    }
    if(n.get('/etc/nginx/conf.d/default.conf').source!==a.get('/app/config').source+'/default.production.conf')return reply('NGINX_API_CONFIG_SPLIT');
    if(n.get('/etc/nginx/conf.d/sites-enabled').source!==a.get('/app/build/sites-enabled').source)return reply('NGINX_API_ROUTES_SPLIT');
    // Structural correctness is never proof that these values are owner-approved.
    return reply('EFFECTIVE_COMPOSE_PLAN_ONLY');
  }catch{return reply('INVALID_EVIDENCE');}
}
module.exports={inspectEffectiveCompose};
