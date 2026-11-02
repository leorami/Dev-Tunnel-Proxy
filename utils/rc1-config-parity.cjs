'use strict';
/** Pure release preflight. Requires same host configuration backing both nginx
 * and writable API view, plus explicitly matching approved candidate bytes.
 * No files, Docker, network, credentials or live operations are accessed.
 */
const p=require('node:path').posix;
const own=(o,k)=>{if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const d=Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
const absolute=v=>typeof v==='string'&&v.startsWith('/')&&v.length>1&&!v.endsWith('/')&&!v.includes('\\')&&!v.includes('\0')&&v.trim()===v&&p.normalize(v)===v;
function auditConfigParity(input){
 const blockers=[],services=own(input,'services'),proxy=own(services,'proxy'),api=own(services,'proxy-config-api'),candidate=own(input,'candidateRoot');
 if(!absolute(candidate))blockers.push('INVALID_CANDIDATE_ROOT');
 function bind(list,target,code,ro){
  if(!Array.isArray(list)){blockers.push('MISSING_SERVICE_MOUNTS');return null;}
  const entries=[];for(let i=0;i<list.length;i++){const d=Object.getOwnPropertyDescriptor(list,String(i));if(!d||!Object.hasOwn(d,'value')){blockers.push('UNVERIFIED_MOUNT');continue;}if(own(d.value,'target')===target)entries.push(d.value);}
  if(entries.length!==1){blockers.push(code);return null;}
  const m=entries[0],src=own(m,'source');
  if(!absolute(src)||own(m,'type')!=='bind'||own(m,'read_only')!==ro){blockers.push('INVALID_BIND:'+code);return null;}
  return src;
 }
 const nginx=bind(proxy,'/etc/nginx/conf.d/default.conf','NGINX_ACTIVE_CONFIG_MISSING',true);
 const apiRoot=bind(api,'/app','API_CODE_SOURCE_MISSING',true);
 if(apiRoot!==null&&apiRoot!==candidate)blockers.push('API_CODE_SOURCE_MISMATCH');
 const apiConfig=bind(api,'/app/config','API_ACTIVE_CONFIG_MISSING',false);
 const nginxRoutes=bind(proxy,'/etc/nginx/conf.d/sites-enabled','NGINX_ROUTES_MISSING',true);
 const apiRoutes=bind(api,'/app/build/sites-enabled','API_ROUTES_MISSING',false);
 if(nginx&&apiConfig&&nginx!==apiConfig+'/default.production.conf')blockers.push('ACTIVE_NGINX_CONFIG_SPLIT');
 if(nginxRoutes&&apiRoutes&&nginxRoutes!==apiRoutes)blockers.push('GENERATED_BUNDLE_SPLIT');
 for(const [list,target,code] of [[api,'/app/config/default.production.conf','API_ACTIVE_CONFIG_SHADOWED'],[api,'/app/build/sites-enabled/apps.generated.conf','API_BUNDLE_SHADOWED'],[proxy,'/etc/nginx/conf.d/sites-enabled/apps.generated.conf','NGINX_BUNDLE_SHADOWED']]){
  if(Array.isArray(list)&&list.some(m=>own(m,'target')===target))blockers.push(code);
 }
 return {status:blockers.length?'BLOCKED':'PARITY_PLAN_ONLY',blockers:[...new Set(blockers)],deployed:false};
}
function auditConfigBytesEvidence(input){
 const blockers=[],keys=['approvedSha256','nginxSha256','apiSha256'],v=keys.map(k=>own(input,k));
 for(let i=0;i<keys.length;i++)if(typeof v[i]!=='string'||!/^[a-f0-9]{64}$/.test(v[i]))blockers.push('INVALID_DIGEST:'+keys[i]);
 if(!blockers.length&&(v[0]!==v[1]||v[0]!==v[2]))blockers.push('CONFIG_BYTES_DIVERGE');
 return {status:blockers.length?'BLOCKED':'MATCHING_BYTES_ATTESTED_ONLY',blockers,deployed:false};
}
module.exports={auditConfigParity,auditConfigBytesEvidence};
