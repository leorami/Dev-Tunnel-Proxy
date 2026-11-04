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
 }
 return Object.freeze({
  ok:true,httpStatus:200,code:includeHttp?'SELF_CHECK_INVENTORY_AND_HTTP_OBSERVATION':'SELF_CHECK_INVENTORY_ONLY',
  inventory:inv,httpScan,
  mode:'LOCAL_READONLY_OBSERVATION',healingPerformed:false,browserAudited:false,
  routeModified:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false,
  sourceCurrent:'UNKNOWN',realAppVerified:includeHttp&&httpScan&&httpScan.code&&httpScan.code.includes('OK')?'PARTIAL':'UNKNOWN'
 });
}
module.exports={runSecureSelfCheck};
