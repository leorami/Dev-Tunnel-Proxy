'use strict';
/**
 * Minimal anonymous Calliope health envelope. The live nginx routing policy
 * deliberately permits unauthenticated GET /devproxy/api/ai/health; it must
 * NEVER reveal presence of an external-model key, configured model name,
 * current operator activity, owner URLs/routes, internal host data or sessions.
 *
 * All other management API calls continue to require the established
 * session/Origin gate. This pure source module makes no network, environment
 * or filesystem reads, does not grant model access and does not claim that a
 * real RC2 deployment or owner work preservation was independently attested.
 */
const FIELDS=Object.freeze(['enabled','mode','usedAI','healingPerformed','liveAttested']);
const HEALTH=Object.freeze({
 enabled:true,mode:'local_documentation',usedAI:false,
 healingPerformed:false,liveAttested:false
});
const CACHE_HEADERS=Object.freeze({'Cache-Control':'no-store','Pragma':'no-cache'});
const ACCEPT=Object.freeze({
 code:'PUBLIC_CALLIOPE_HEALTH_MINIMIZED',privacyVerified:true,
 releaseAuthorized:false,deployed:false,ownerUatApproved:false
});
const DENY=Object.freeze({
 code:'PUBLIC_CALLIOPE_HEALTH_LEAKAGE',privacyVerified:false,
 releaseAuthorized:false,deployed:false,ownerUatApproved:false
});
function createMinimalPublicCalliopeHealth(){
 return HEALTH;
}
function publicCalliopeHealthCacheHeaders(){
 return CACHE_HEADERS;
}
function assessPublicCalliopeHealthReply(reply){
 try{
  if(!reply||typeof reply!=='object'||Array.isArray(reply)||
   Object.getPrototypeOf(reply)!==Object.prototype)return DENY;
  const keys=Reflect.ownKeys(reply);
  if(keys.length!==FIELDS.length||keys.some(k=>typeof k!=='string'||!FIELDS.includes(k)))
   return DENY;
  for(const name of FIELDS){
   const descriptor=Object.getOwnPropertyDescriptor(reply,name);
   if(!descriptor||!Object.hasOwn(descriptor,'value')||descriptor.value!==HEALTH[name])
    return DENY;
  }
  return ACCEPT;
 }catch{return DENY;}
}
module.exports={createMinimalPublicCalliopeHealth,publicCalliopeHealthCacheHeaders,
 assessPublicCalliopeHealthReply};
