'use strict';
/**
 * Confined, cooperative owner-data route transaction for the approved API.
 * This module cannot deploy/recreate services and never invokes Docker.
 * A genuine owner-authorized host reload client must be injected separately.
 * It does not replace real Mac Docker Desktop or active-route verification.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const NAME_RX=/^[A-Za-z0-9_-]{1,80}\.conf$/;
const STATUS_OK='RELOAD_AND_VERIFICATION_REPORTED';
const FILE_LIMIT=256*1024;
function out(httpStatus,code){return Object.freeze({httpStatus,ok:httpStatus===200,code,
  productionChangeAuthorized:false,liveAttested:false});}
function createProductionRouteMutationService({root,activation,generateBundle,lock,allowConfigEdit=false}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||path.normalize(root)!==root||root==='/'||
    typeof generateBundle!=='function'||!lock||typeof lock.acquire!=='function'||
    (activation!==null&&activation!==undefined&&typeof activation.activate!=='function'))
   throw Error('INVALID_ROUTE_MUTATION_SERVICE_CONFIG');
 const dirs={app:path.join(root,'apps'),override:path.join(root,'overrides'),
  config:path.join(root,'config'),bundle:path.join(root,'build','sites-enabled')};
 const bundlePath=path.join(dirs.bundle,'apps.generated.conf');
 // The approved generateAppsBundle.js writes these diagnostics as well as
 // apps.generated.conf. Transaction rollback must preserve their preimages.
 const auxiliaryPaths=Object.freeze([
  path.join(root,'.artifacts','bundle-diagnostics.json'),
  path.join(root,'.artifacts','override-conflicts.json')
 ]);
 let busy=false;
 function validateName(kind,name){
  if(!Object.hasOwn(dirs,kind)||kind==='bundle')return false;
  if(typeof name!=='string'||!(NAME_RX.test(name)||(kind==='config'&&name==='default.production.conf')))return false;
  if(kind==='config'&&name!=='default.production.conf')return false;
  return true;
 }
 async function requireSafeDir(dir){
  const st=await fs.lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('UNSAFE_DIRECTORY');
  // Verify the target actually resolves under the API's mounted /app data
  // root, not through an internal link to source code or the host root.
  const resolved=await fs.realpath(dir);
  if(resolved!==dir)throw Error('NONCANONICAL_DATA_DIRECTORY');
 }
 async function preimage(file){
  await requireSafeDir(path.dirname(file));
  try{const st=await fs.lstat(file);
      if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>FILE_LIMIT)throw Error('UNSAFE_ROUTE_TARGET');
      return {present:true,data:await fs.readFile(file),mode:st.mode&0o777};
  }catch(e){if(e.code==='ENOENT')return {present:false,data:null,mode:0o644};throw e;}
 }
 async function syncDir(dir){const f=await fs.open(dir,'r');try{await f.sync();}finally{await f.close();}}
 // This durable sentinel is created before any route data write and fsynced
 // before returning; an unexpected process stop cannot silently resume updates.
 const inFlightPath=path.join(root,'.artifacts','route-mutation-inflight');
 async function beginTransaction(){
  const dir=path.dirname(inFlightPath);await requireSafeDir(dir);
  let f;
  try{
   f=await fs.open(inFlightPath,'wx',0o600);
   await f.writeFile('route-mutation-in-flight\n');await f.sync();
   const st=await f.stat();await f.close();f=null;await syncDir(dir);
   return {dev:st.dev,ino:st.ino};
  }catch(e){if(f)await f.close();if(e.code==='EEXIST')throw Error('ROUTE_STATE_QUARANTINED');throw e;}
 }
 async function clearTransaction(marker){
  if(!marker)throw Error('NO_TRANSACTION_MARKER');
  const st=await fs.lstat(inFlightPath);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.dev!==marker.dev||st.ino!==marker.ino)
   throw Error('TRANSACTION_MARKER_CHANGED');
  await fs.unlink(inFlightPath);await syncDir(path.dirname(inFlightPath));
 }
 async function replace(file,data,mode=0o644){
  const dir=path.dirname(file);await requireSafeDir(dir);
  const current=await preimage(file);void current; // never replace symlinks/hardlinks
  const temp=path.join(dir,'.route-txn-'+crypto.randomBytes(12).toString('hex'));
  let fd;
  try{
   fd=await fs.open(temp,'wx',mode);
   await fd.writeFile(data);await fd.sync();await fd.close();fd=null;
   await fs.rename(temp,file);await syncDir(dir);
  }catch(e){if(fd)await fd.close();try{await fs.unlink(temp);}catch{}throw e;}
 }
 async function restore(file,snapshot){
  if(snapshot.present)await replace(file,snapshot.data,snapshot.mode);
  else {const now=await preimage(file);if(now.present){await fs.unlink(file);await syncDir(path.dirname(file));}}
 }
 async function mutate({kind,name,content,sourceApp}={}){
  if(!validateName(kind,name)||sourceApp!==undefined&&sourceApp!==null&&!validateName('app',sourceApp))
    return out(400,'BLOCKED_INVALID_ROUTE_NAME');
  if(content!==undefined&&(typeof content!=='string'||!content.length||Buffer.byteLength(content,'utf8')>FILE_LIMIT))
    return out(400,'BLOCKED_INVALID_CONTENT');
  if(kind==='config'&&!allowConfigEdit)return out(503,'BLOCKED_CONFIG_MOUNT_UNATTESTED');
  if(!activation||typeof activation.activate!=='function')return out(503,'BLOCKED_NO_HOST_ACTIVATION');
  if(busy)return out(423,'BLOCKED_MUTATION_BUSY');
  busy=true;let lease,answer=out(503,'BLOCKED_ROUTE_TRANSACTION');
  try{
   lease=await lock.acquire();
   if(!lease||typeof lease.release!=='function')return out(423,'BLOCKED_CROSSPROCESS_LOCK');
   const target=path.join(dirs[kind],name);
   let oldTarget,oldBundle,oldAuxiliary=[],prepared=false,hostCalled=false,marker=null;
   async function restoreAll(){
    // Best-effort independent restoration: never stop after just the first
    // file failure and leave the other known outputs silently stale.
    const errors=[];
    for(const [file,snapshot] of [[target,oldTarget],[bundlePath,oldBundle],...oldAuxiliary]){
      if(!snapshot)continue;
      try{await restore(file,snapshot);}catch(e){errors.push(e);}
    }
    if(errors.length)throw Error('INCOMPLETE_ROUTE_ROLLBACK');
   }
   try{
    oldTarget=await preimage(target);oldBundle=await preimage(bundlePath);
    for(const p of auxiliaryPaths)oldAuxiliary.push([p,await preimage(p)]);
    let body=content;
    if(sourceApp){const source=await preimage(path.join(dirs.app,sourceApp));
      if(!source.present)return out(404,'SOURCE_APP_NOT_FOUND');
      body=source.data;
    }
    if(!body||Buffer.byteLength(body)>FILE_LIMIT)return out(400,'BLOCKED_INVALID_CONTENT');
    marker=await beginTransaction();prepared=true;await replace(target,body,oldTarget.mode);
    await generateBundle();
    hostCalled=true;
    const candidate=await preimage(bundlePath);
    if(!candidate.present)throw Error('MISSING_GENERATED_BUNDLE');
    const bundleDigest=crypto.createHash('sha256').update(candidate.data).digest('hex');
    const activationResult=await activation.activate({expectedBundleSha256:bundleDigest});
    if(activationResult&&activationResult.status===STATUS_OK&&
       activationResult.productionChangeAuthorized===false&&activationResult.liveAttested===false)
      {try{await clearTransaction(marker);marker=null;}catch{return out(503,'ACTIVATED_BUT_JOURNAL_NOT_CLEAR');}
       return out(200,'ACTIVATION_VERIFIED_BY_HOST_CALLBACK');}
    // A failed verification after reload is indeterminate for live workers.
    const beforeReload=activationResult&&activationResult.status==='NGINX_VALIDATION_FAILED';
    try{await restoreAll();}catch{return out(503,'ROLLBACK_FAILED_OPERATOR_REQUIRED');}
    if(beforeReload){try{await clearTransaction(marker);marker=null;}catch{return out(503,'JOURNAL_NOT_CLEAR_OPERATOR_REQUIRED');}
      return out(422,'NGINX_CANDIDATE_REJECTED_ROLLED_BACK');}
    return out(503,'ACTIVATION_INDETERMINATE');
   }catch(err){
    if(err&&err.message==='ROUTE_STATE_QUARANTINED')return out(503,'ROUTE_STATE_QUARANTINED');
    if(err&&['UNSAFE_ROUTE_TARGET','UNSAFE_DIRECTORY','NONCANONICAL_DATA_DIRECTORY'].includes(err.message))return out(400,'BLOCKED_UNSAFE_ROUTE_PATH');
    if(prepared){try{await restoreAll();}
      catch{return out(503,'ROLLBACK_FAILED_OPERATOR_REQUIRED');}
      if(!hostCalled){try{await clearTransaction(marker);marker=null;}
       catch{return out(503,'JOURNAL_NOT_CLEAR_OPERATOR_REQUIRED');}}}
    return hostCalled?out(503,'ACTIVATION_INDETERMINATE'):
      out(422,'ROUTE_BUNDLE_WRITE_FAILED_ROLLED_BACK');
   }
  }catch{return out(503,'BLOCKED_LOCK_OR_DATA_INTEGRITY');}
  finally{
   let releaseFailed=false;
   if(lease){try{await lease.release();}catch{releaseFailed=true;}}
   busy=false;
   if(releaseFailed)return out(503,'LOCK_RELEASE_FAILED_OPERATOR_REQUIRED');
  }
 }
 async function regenerate({reload=false}={}){
  if(typeof reload!=='boolean')return Object.freeze({...out(400,'INVALID_RELOAD_FLAG'),reloaded:false});
  if(reload&&(!activation||typeof activation.activate!=='function'))
    return Object.freeze({...out(503,'BLOCKED_NO_HOST_ACTIVATION'),reloaded:false});
  if(busy)return Object.freeze({...out(423,'BLOCKED_MUTATION_BUSY'),reloaded:false});
  busy=true;let lease,old=[],marker=null;
  const all=[bundlePath,...auxiliaryPaths];
  async function rollback(){
   const failures=[];
   for(const [p,snapshot] of old){try{await restore(p,snapshot);}catch(e){failures.push(e);}}
   if(failures.length)throw Error('INCOMPLETE_REGEN_ROLLBACK');
  }
  const answer=(http,code,reloaded=false)=>Object.freeze({...out(http,code),reloaded});
  try{
   lease=await lock.acquire();
   if(!lease||typeof lease.release!=='function')return answer(423,'BLOCKED_CROSSPROCESS_LOCK');
   for(const p of all)old.push([p,await preimage(p)]);
   marker=await beginTransaction();
   try{await generateBundle();}
   catch{
    try{await rollback();}catch{return answer(503,'ROLLBACK_FAILED_OPERATOR_REQUIRED');}
    try{await clearTransaction(marker);marker=null;}catch{return answer(503,'JOURNAL_NOT_CLEAR_OPERATOR_REQUIRED');}
    return answer(422,'BUNDLE_REGENERATION_FAILED_ROLLED_BACK');
   }
   if(!reload){try{await clearTransaction(marker);marker=null;}
    catch{return answer(503,'JOURNAL_NOT_CLEAR_OPERATOR_REQUIRED');}
    return answer(200,'BUNDLE_REGENERATED_NO_RELOAD');}
   let r;try{const candidate=await preimage(bundlePath);
    if(!candidate.present)throw Error('MISSING_GENERATED_BUNDLE');
    r=await activation.activate({expectedBundleSha256:crypto.createHash('sha256').update(candidate.data).digest('hex')});
   }catch{r=null;}
   if(r&&r.status===STATUS_OK&&r.productionChangeAuthorized===false&&r.liveAttested===false){
     try{await clearTransaction(marker);marker=null;}catch{return answer(503,'ACTIVATED_BUT_JOURNAL_NOT_CLEAR');}
     return answer(200,'ACTIVATION_VERIFIED_BY_HOST_CALLBACK',true);}
   try{await rollback();}catch{return answer(503,'ROLLBACK_FAILED_OPERATOR_REQUIRED');}
   if(r&&r.status==='NGINX_VALIDATION_FAILED'){
     try{await clearTransaction(marker);marker=null;}catch{return answer(503,'JOURNAL_NOT_CLEAR_OPERATOR_REQUIRED');}
     return answer(422,'NGINX_CANDIDATE_REJECTED_ROLLED_BACK');}
   return answer(503,'ACTIVATION_INDETERMINATE');
  }catch(e){return answer(503,e&&e.message==='ROUTE_STATE_QUARANTINED'?'ROUTE_STATE_QUARANTINED':'BLOCKED_LOCK_OR_DATA_INTEGRITY');}
  finally{
   let failed=false;
   if(lease){try{await lease.release();}catch{failed=true;}}
   busy=false;
   if(failed)return answer(503,'LOCK_RELEASE_FAILED_OPERATOR_REQUIRED');
  }
 }
 async function install(name,content){if(typeof name!=='string')return out(400,'BLOCKED_INVALID_ROUTE_NAME');
  const canonical=name.endsWith('.conf')?name:name+'.conf';return mutate({kind:'app',name:canonical,content});}
 async function promote(name){return mutate({kind:'override',name,sourceApp:name});}
 async function editConfig(name,content){return mutate({kind:'config',name,content});}
 async function editApp(name,content){return mutate({kind:'app',name,content});}
 async function editOverride(name,content){return mutate({kind:'override',name,content});}
 return Object.freeze({install,promote,editConfig,editApp,editOverride,regenerate});
}
module.exports={createProductionRouteMutationService};
