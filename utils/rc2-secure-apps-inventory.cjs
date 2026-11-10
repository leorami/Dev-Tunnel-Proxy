'use strict';
/**
 * Settlement-secure replacement for legacy POST apps/scan Docker/spawn inventory.
 * Read-only listing of local apps/*.conf route snippets. No Docker, shell, npm,
 * network, route mutation, or heal. NOT a substitute for browser/container scan.
 */
const fs=require('node:fs');
const path=require('node:path');
function listSecureAppsInventory({appsDir}={}){
 if(typeof appsDir!=='string'||!path.isAbsolute(appsDir)||path.normalize(appsDir)!==appsDir||
    appsDir==='/'||appsDir.endsWith('/')){
  return Object.freeze({ok:false,httpStatus:500,code:'APPS_INVENTORY_UNSAFE_ROOT',
   routes:[],routeModified:false,productionChangeAuthorized:false,deployed:false});
 }
 let names;
 try{
  const st=fs.lstatSync(appsDir);
  if(!st.isDirectory()||st.isSymbolicLink())throw Error('bad');
  names=fs.readdirSync(appsDir).filter(n=>/^[a-zA-Z0-9._-]+\.conf$/.test(n)&&!n.includes('.backup')&&
   !n.startsWith('._')).sort();
 }catch{
  return Object.freeze({ok:false,httpStatus:500,code:'APPS_INVENTORY_UNAVAILABLE',
   routes:[],routeModified:false,productionChangeAuthorized:false,deployed:false});
 }
 const routes=Object.freeze(names.map(name=>Object.freeze({
  file:name,route:'/'+name.replace(/\.conf$/i,'').replace(/[^a-zA-Z0-9_-]+/g,'-')
 })));
 return Object.freeze({
  ok:true,httpStatus:200,code:'APPS_INVENTORY_LOCAL_READONLY',
  mode:'LOCAL_APPS_CONF_ONLY',browserScanned:false,dockerUsed:false,healingPerformed:false,
  routes,count:routes.length,
  routeModified:false,productionChangeAuthorized:false,deployed:false,ownerUatApproved:false
 });
}
module.exports={listSecureAppsInventory};
