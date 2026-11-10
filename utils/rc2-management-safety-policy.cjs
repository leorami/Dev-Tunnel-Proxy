'use strict';
/**
 * Fail-closed routing boundary while HMAC settlement mode is configured.
 * Source-audited legacy API paths directly call Docker, rewrite nginx/config,
 * spawn arbitrary container-backed auditing, or write route files BEFORE
 * transactional activation. Blocking them makes the regression VISIBLE
 * rather than returning false HTTP 200s in a Dockerless immutable API.
 *
 * This does not protect callers outside proxyConfigAPI, implement a safe chat
 * replacement, or authorize release. Engineer must restore functional parity
 * through a separately reviewed transaction path before owner acceptance.
 */
const UNSAFE_POST=Object.freeze(new Set([
 'ai/ask','ai/restart-containers','ai/audit-and-heal','ai/self-check',
 'ai/advanced-heal','ai/fix-react-bundle','ai/fix-storybook-vite',
 'ai/fix-mxtk-api','ai/snapshot-analyze','ai/code-review-container',
 'ai/code-review','ai/review-code','ai/inspect-container','ai/audit',
 // Production has no owner consent for sending local documentation to remote embeddings,
 // nor for injecting synthetic status/thought events into the management UI.
 'ai/reindex','ai/thoughts/inject',
 // apps/install and apps/create-route are restored: handlers use
 // production-route-mutation + host activation, not write-before-reload.
 // apps/scan remains blocked until a settlement-safe inventory path exists.
 'apps/scan'
]));
const UNSAFE_GET=Object.freeze(new Set(['ai/inspect-container','ai/code-review-container']));
const result=(blocked,code)=>Object.freeze({blocked,code,productionChangeAuthorized:false,
 deployed:false,ownerUatApproved:false});
function own(o,k){const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;}
function classifySecureManagementOperation(o){
 try{
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype||
     Reflect.ownKeys(o).some(k=>typeof k!=='string'||
       !['method','pathname','base','spoolDirectory','nodeEnv','allowFlag','denyFlag'].includes(k)||
       !Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value')))
   return result(true,'INVALID_MANAGEMENT_POLICY_INPUT');
  const method=own(o,'method'),pathname=own(o,'pathname'),base=own(o,'base'),spool=own(o,'spoolDirectory');
  const env=own(o,'nodeEnv'),allow=own(o,'allowFlag'),deny=own(o,'denyFlag');
  if(typeof method!=='string'||!['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS'].includes(method)||
     typeof pathname!=='string'||!pathname.startsWith('/')||pathname.length>2048||
     typeof base!=='string'||!/^(?:\/[a-zA-Z0-9_-]+)+$/.test(base)||
     pathname.includes('\\')||pathname.includes('%')||pathname.includes('\0')||
     pathname.includes('//')||pathname.includes('/./')||pathname.includes('/../')||
     (spool!==undefined&&typeof spool!=='string')||
     ![undefined,'production','development','test'].includes(env)||
     ![undefined,'0','1'].includes(allow)||
     ![undefined,'0','1'].includes(deny))return result(true,'INVALID_MANAGEMENT_POLICY_INPUT');
  if(spool!==undefined&&spool.length===0)return result(true,'INVALID_SPOOL_CONFIGURATION');
  if(spool===undefined&&env!=='production'&&deny!=='1')
   return result(false,'SECURE_SPOOL_DISABLED');
  if(pathname===base||!pathname.startsWith(base+'/'))return result(false,'NOT_LEGACY_MUTATION');
  const suffix=pathname.slice(base.length+1);
  const blocked=(method==='POST'&&UNSAFE_POST.has(suffix))||
    (method==='GET'&&UNSAFE_GET.has(suffix));
  return result(blocked,blocked?'LEGACY_UNSETTLED_MANAGEMENT_BLOCKED':'SECURE_ROUTE_PERMITTED');
 }catch{return result(true,'INVALID_MANAGEMENT_POLICY_INPUT');}
}
module.exports={classifySecureManagementOperation};
