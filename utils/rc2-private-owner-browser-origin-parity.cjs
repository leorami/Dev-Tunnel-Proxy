'use strict';
/**
 * Source-only comparison of owner-verified browser origins against the CURRENT
 * server allowlist. No env reads, HTTP, Docker, credentials, secrets, public
 * hostname output or state changes. All hostnames are private operator inputs.
 * A self-reported manifest never proves actual Mac/browser state or authorizes
 * an env mutation / restart. Never derive trusted origins from request Host.
 */
const TOP=Object.freeze(['protocol','approvedBrowserOrigins','configuredOrigins',
 'remoteHttpsBrowserExpected']);
const LOCAL=Object.freeze(['http://127.0.0.1:8080','http://localhost:8080']);
const OK=Object.freeze({code:'BROWSER_ORIGIN_PARITY_REVIEW_ONLY',
 coverageVerified:true,productionChangeAuthorized:false,
 liveBrowserVerified:false,deployed:false,ownerUatApproved:false});
const BLOCKED=Object.freeze({code:'BROWSER_ORIGIN_PARITY_INCOMPLETE',
 coverageVerified:false,productionChangeAuthorized:false,
 liveBrowserVerified:false,deployed:false,ownerUatApproved:false});
const MISSING=Object.freeze({code:'OWNER_HTTPS_BROWSER_ORIGIN_MISSING',
 coverageVerified:false,productionChangeAuthorized:false,
 liveBrowserVerified:false,deployed:false,ownerUatApproved:false});
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||
    Object.getPrototypeOf(o)!==Object.prototype)return false;
 const names=Reflect.ownKeys(o);
 return names.length===keys.length && names.every(k=>typeof k==='string'&&
  keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
const val=(o,k)=>Object.getOwnPropertyDescriptor(o,k).value;
function origins(items){
 if(!Array.isArray(items)||items.length<3||items.length>12||
    Reflect.ownKeys(items).length!==items.length+1)return null;
 const out=new Set();
 for(let i=0;i<items.length;i++){
  const d=Object.getOwnPropertyDescriptor(items,String(i));
  if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length>2048)return null;
  const original=d.value;
  let u;
  try{u=new URL(original);}catch{return null;}
  // Raw bytes MUST be canonical exact origin. No path/query/hash, credentials,
  // Unicode ambiguity, %-escapes, trailing slash, wildcard or client headers.
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||
    u.pathname!=='/'||u.search||u.hash||original!==u.origin||
    /[\s*%\\\x00-\x1f\x7f]/.test(original)||out.has(original))return null;
  out.add(original);
 }
 return out;
}
function assessPrivateOwnerBrowserOriginParity(input){
 try{
  if(!exact(input,TOP)||val(input,'protocol')!=='DEVPROXY_RC2_PRIVATE_BROWSER_ORIGINS_V1'||
      val(input,'remoteHttpsBrowserExpected')!==true)return BLOCKED;
  const approved=origins(val(input,'approvedBrowserOrigins'));
  const configured=origins(val(input,'configuredOrigins'));
  if(!approved||!configured||LOCAL.some(x=>!approved.has(x)))return BLOCKED;
  const remote=[...approved].filter(x=>!LOCAL.includes(x));
  if(!remote.length||remote.some(x=>!x.startsWith('https://')))return BLOCKED;
  const missing=remote.some(x=>!configured.has(x));
  if(missing)return MISSING;
  if(approved.size!==configured.size||[...approved].some(x=>!configured.has(x)))
   return BLOCKED;
  return OK;
 }catch{return BLOCKED;}
}
module.exports={assessPrivateOwnerBrowserOriginParity};
