'use strict';
/**
 * Review-only deterministic path linter for a LIVE RC2 restoration manifest.
 * No filesystem, Docker, Mac, network, credentials, state mutations or output
 * of owner-private paths. In particular it cannot attest path ownership,
 * existing backed-up bytes, symlinks, image integrity, HMAC, or authorizations.
 *
 * Owner's live cutover broke when private /private/tmp stages / nginx overlay
 * bind sources disappeared. Fail closed on ALL live mount/backup inputs from
 * temporary roots, not just the paths of the main two Compose services.
 */
const path=require('node:path');
const TOP=Object.freeze(['scope','paths']);
const KEYS=Object.freeze([
 'stageRoot','backupRoot','composeWorkingDir','proxyNginxConf',
 'proxyDefaultConf','proxyEntrypoint','activationSecret','hostShare',
 'workerPin'
]);
const TEMP=Object.freeze([
 '/tmp','/private/tmp','/var/tmp','/private/var/tmp',
 '/var/folders','/private/var/folders','/dev/shm','/run/user'
]);
const GOOD=Object.freeze({
 code:'DURABLE_MOUNTS_SOURCE_REVIEW_ONLY',
 staticPathsAcceptable:true,
 nativeOwnershipAndExistenceVerified:false,
 productionChangeAuthorized:false,
 restorationPerformed:false
});
const BAD=Object.freeze({
 code:'DURABLE_MOUNTS_INVALID',
 staticPathsAcceptable:false,
 nativeOwnershipAndExistenceVerified:false,
 productionChangeAuthorized:false,
 restorationPerformed:false
});
const EPHEMERAL=Object.freeze({
 code:'EPHEMERAL_LIVE_BIND_SOURCE',
 staticPathsAcceptable:false,
 nativeOwnershipAndExistenceVerified:false,
 productionChangeAuthorized:false,
 restorationPerformed:false
});
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return false;
 const all=Reflect.ownKeys(o);
 return all.length===keys.length&&all.every(k=>typeof k==='string'&&
  keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function val(o,k){return Object.getOwnPropertyDescriptor(o,k).value;}
function canonical(p){
 return typeof p==='string'&&p.length>=2&&p.length<2048&&
 p.startsWith('/')&&p!=='/'&&p===path.posix.normalize(p)&&
 !p.endsWith('/')&&!/[\x00-\x1f\x7f]/.test(p);
}
function under(p,root){
 return p.startsWith(root+'/');
}
function ephemeral(p){
 const s=p.toLowerCase();
 return TEMP.some(t=>s===t||under(s,t));
}
function assessLiveDurableMountPaths(input){
 try{
  if(!exact(input,TOP)||val(input,'scope')!=='LIVE_RC2_RECOVERY')return BAD;
  const p=val(input,'paths');
  if(!exact(p,KEYS))return BAD;
  const all=KEYS.map(k=>val(p,k));
  if(!all.every(canonical))return BAD;
  if(all.some(ephemeral))return EPHEMERAL;
  if(new Set(all).size!==all.length)return BAD;
  const stage=val(p,'stageRoot'),backup=val(p,'backupRoot');
  if(under(backup,stage)||under(stage,backup))return BAD;
  if(['composeWorkingDir','activationSecret','hostShare','workerPin']
    .some(k=>!under(val(p,k),stage)))return BAD;
  return GOOD;
 }catch{return BAD;}
}
module.exports={assessLiveDurableMountPaths};
