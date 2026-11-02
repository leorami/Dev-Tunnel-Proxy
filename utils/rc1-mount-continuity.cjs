'use strict';
/** Offline candidate Docker mount-plan verifier. Accepts only normalized operator
 * metadata. No Docker/file/network calls and NEVER asserts a deployment is safe.
 * It validates expected sources syntactically; it cannot detect symlinks,
 * permission issues, named volumes, userns mappings or container startup.
 */
const path=require('node:path').posix;
const PRODUCT_SHA='d89c962fb31a962a518f331bae458e63708e7e86';
const REQUIRED=Object.freeze([
 {service:'proxy',target:'/etc/nginx/conf.d/sites-enabled',suffix:'build/sites-enabled',root:'owner',readOnly:true},
 {service:'proxy',target:'/usr/share/nginx/html/.artifacts',suffix:'.artifacts',root:'owner',readOnly:false},
 {service:'proxy',target:'/etc/nginx/certs',suffix:'.certs',root:'owner',readOnly:true},
 {service:'proxy',target:'/etc/nginx/conf.d/default.conf',suffix:'config/default.production.conf',root:'candidate',readOnly:true},
 {service:'proxy',target:'/etc/nginx/nginx.conf',suffix:'config/nginx.production.conf',root:'candidate',readOnly:true},
 {service:'proxy-config-api',target:'/app',suffix:'',root:'candidate',readOnly:true},
 {service:'proxy-config-api',target:'/app/.env',suffix:'.env',root:'owner',readOnly:false},
 {service:'proxy-config-api',target:'/app/apps',suffix:'apps',root:'owner',readOnly:false},
 {service:'proxy-config-api',target:'/app/overrides',suffix:'overrides',root:'owner',readOnly:false},
 {service:'proxy-config-api',target:'/app/.artifacts',suffix:'.artifacts',root:'owner',readOnly:false},
 {service:'proxy-config-api',target:'/app/build/sites-enabled',suffix:'build/sites-enabled',root:'owner',readOnly:false},
 {service:'proxy-config-api',target:'/app/config',suffix:'config',root:'owner',readOnly:false},
]);
const own=(x,k)=>{const d=x&&typeof x==='object'&&!Array.isArray(x)?Object.getOwnPropertyDescriptor(x,k):null;return d&&Object.hasOwn(d,'value')?d.value:undefined;};
function canonicalAbsolute(p){return typeof p==='string'&&p.length>1&&p[0]==='/'&&!p.includes('\0')&&!p.includes('\\')&&p.trim()===p&&path.normalize(p)===p&&!p.endsWith('/');}
function overlap(a,b){return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
function assessMountContinuity(plan){
 const blockers=[];
 const owner=own(plan,'ownerRoot'),candidate=own(plan,'candidateRoot');
 const goodRoots=canonicalAbsolute(owner)&&canonicalAbsolute(candidate)&&!overlap(owner,candidate);
 if(!goodRoots)blockers.push('ROOTS_INVALID');
 if(own(plan,'candidateSha')!==PRODUCT_SHA)blockers.push('WRONG_PRODUCT_SHA');
 const services=own(plan,'services');
 for(const name of ['proxy','proxy-config-api']){
  const mounts=own(services,name);
  if(!Array.isArray(mounts)){blockers.push('MISSING_SERVICE:'+name);continue;}
  const entries=mounts.map(item=>({source:own(item,'source'),target:own(item,'target'),type:own(item,'type'),readOnly:own(item,'read_only')}));
  const protectedForService=REQUIRED.filter(req=>req.service===name);
  for(const req of protectedForService){
   const same=entries.filter(v=>v.target===req.target);
   if(same.length!==1){blockers.push('MISSING_REQUIRED_BIND:'+name+':'+req.target);continue;}
   const mount=same[0];const root=req.root==='owner'?owner:candidate;
   const expected=goodRoots?(req.suffix?root+'/'+req.suffix:root):null;
   if(mount.type!=='bind'||mount.source!==expected||!canonicalAbsolute(mount.source)||mount.readOnly!==req.readOnly)
     blockers.push('MISMATCH_REQUIRED_BIND:'+name+':'+req.target);
  }
  for(const extra of entries){
   if(!canonicalAbsolute(extra.target)||!canonicalAbsolute(extra.source)||extra.readOnly!==true&&extra.readOnly!==false)
     blockers.push('INVALID_BIND_METADATA:'+name);
   if(protectedForService.some(r=>r.target===extra.target))continue;
   if(protectedForService.some(r=>canonicalAbsolute(extra.target)&&overlap(r.target,extra.target)))
     blockers.push('UNREVIEWED_SHADOW_MOUNT:'+name);
  }
 }
 return Object.freeze({status:blockers.length?'BLOCKED':'MOUNT_PLAN_VALIDATED_ONLY',deployed:false,blockers:Object.freeze([...new Set(blockers)])});
}
module.exports={PRODUCT_SHA,REQUIRED,assessMountContinuity};
