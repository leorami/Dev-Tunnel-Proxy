'use strict';
/**
 * Settlement-secure substitute for legacy ai/self-check Docker/heal loops.
 * Combines local apps inventory with optional readonly HTTP HEAD observations.
 * Never heals, mutates routes, spawns scanApps, opens docker.sock, or chats.
 */
const {listSecureAppsInventory}=require('./rc2-secure-apps-inventory.cjs');
const {scanExistingAppHttpRoutes}=require('./rc2-readonly-app-http-scan.cjs');
async function runSecureSelfCheck({appsDir,diagnosticsFile,probe,includeHttp=false}={}){
 const inv=listSecureAppsInventory({appsDir});
 if(!inv.ok){
  return Object.freeze({
   ok:false,httpStatus:inv.httpStatus||500,code:inv.code||'SELF_CHECK_INVENTORY_UNAVAILABLE',
   inventory:inv,httpScan:null,healingPerformed:false,browserAudited:false,
   routeModified:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
   sourceCurrent:'UNKNOWN',realAppVerified:'UNKNOWN'
  });
 }
 let httpScan=null;
 if(includeHttp===true){
  if(!probe||typeof probe.audit!=='function'||typeof diagnosticsFile!=='string'){
   return Object.freeze({
    ok:false,httpStatus:503,code:'SELF_CHECK_HTTP_PROBE_UNAVAILABLE',
    inventory:inv,httpScan:null,healingPerformed:false,browserAudited:false,
    routeModified:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
    sourceCurrent:'UNKNOWN',realAppVerified:'UNKNOWN'
   });
  }
  httpScan=await scanExistingAppHttpRoutes({diagnosticsFile,probe});
  // A requested HTTP observation must not claim success if the source artifact
  // is missing, unsafe, malformed, or cannot be inspected. Preserve the local
  // inventory evidence without manufacturing a green observation.
  if(!httpScan||httpScan.code!=='READONLY_HTTP_SCAN_EVIDENCE_ONLY'){
   return Object.freeze({
    ok:false,httpStatus:503,code:'SELF_CHECK_HTTP_PROBE_UNAVAILABLE',
    inventory:inv,httpScan,
    mode:'LOCAL_READONLY_OBSERVATION',healingPerformed:false,browserAudited:false,
    routeModified:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
    sourceCurrent:'UNKNOWN',realAppVerified:'UNKNOWN'
   });
  }
 }
 return Object.freeze({
  ok:true,httpStatus:200,code:includeHttp?'SELF_CHECK_INVENTORY_AND_HTTP_OBSERVATION':'SELF_CHECK_INVENTORY_ONLY',
  inventory:inv,httpScan,
  mode:'LOCAL_READONLY_OBSERVATION',healingPerformed:false,browserAudited:false,
  routeModified:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
  sourceCurrent:'UNKNOWN',realAppVerified:includeHttp&&httpScan&&httpScan.code&&httpScan.code.includes('OK')?'PARTIAL':'UNKNOWN'
 });
}
// The legacy self-check accepted a heal flag, but secure mode supports only
// observations. Parse a bounded body before returning any apparent success.
async function readSecureSelfCheckRequestBody(stream){
 const INVALID=Object.freeze({ok:false,httpStatus:400,code:'INVALID_SELF_CHECK_BODY'});
 try{
  let size=0,parts=[];
  for await(const chunk of stream){
   if(!Buffer.isBuffer(chunk)&&typeof chunk!=='string')return INVALID;
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,'utf8');
   size+=bytes.length;
   if(size>2048)return INVALID;
   parts.push(bytes);
  }
  const raw=Buffer.concat(parts).toString('utf8');
  const obj=raw.length?JSON.parse(raw):{};
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
     Object.getPrototypeOf(obj)!==Object.prototype||
     Reflect.ownKeys(obj).some(k=>typeof k!=='string'||
       !['heal','advanced','route','hint'].includes(k))||
     (Object.hasOwn(obj,'heal')&&typeof obj.heal!=='boolean')||
     (Object.hasOwn(obj,'advanced')&&typeof obj.advanced!=='boolean')||
     (Object.hasOwn(obj,'route')&&(typeof obj.route!=='string'||obj.route.length>256))||
     (Object.hasOwn(obj,'hint')&&(typeof obj.hint!=='string'||obj.hint.length>256)))return INVALID;
  if(obj.heal===true||obj.advanced===true)
   return Object.freeze({ok:false,httpStatus:503,code:'SELF_CHECK_HEAL_UNAVAILABLE'});
  // A route/hint-targeted self-check is a distinct feature, not completed by
  // listing all app configuration files. Never present it as successful.
  if((obj.route||'').length>0||(obj.hint||'').length>0)
   return Object.freeze({ok:false,httpStatus:503,code:'SELF_CHECK_TARGET_UNSUPPORTED'});
  return Object.freeze({ok:true,healRequested:false});
 }catch{return INVALID;}
}
module.exports={runSecureSelfCheck,readSecureSelfCheckRequestBody};
