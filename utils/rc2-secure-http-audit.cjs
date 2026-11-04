'use strict';
/**
 * RC2 protected read-only local proxy audit.
 * - Does NOT execute Docker/browser/npm, mutate routes, use external AI, or open
 *   arbitrary URLs supplied by callers.
 * - Only HEAD probes through the fixed private Docker DNS service dev-proxy:80.
 * - External owner-trusted URL is parsed only as a path selector. It is NEVER
 *   contacted or followed, and never receives tokens/cookies/body data.
 * - This is HTTP-only reachability, NOT browser/network-console or healing parity.
 */
const http=require('node:http');
const TARGET_HOST='dev-proxy';
const TARGET_PORT=80;
const MAX_BODY=2048;
const BLOCKED_TOP=new Set(['admin','devproxy','api','config','status','dashboard','.artifacts','nginx_status','server-status','_internal']);
function output(httpStatus,ok,code,summary=null){return Object.freeze({
 httpStatus,ok,code,report:null,summary,
 routeModified:false,productionChangeAuthorized:false,liveAttested:false,
 ownerUatApproved:false
});}
function validOrigins(value){
 if(!(value instanceof Set))return false;
 for(const item of value){
  if(typeof item!=='string'||item.length>300) return false;
  let u;try{u=new URL(item);}catch{return false;}
  if(u.origin!==item||!['https:','http:'].includes(u.protocol)||u.username||u.password||
     u.pathname!=='/'||u.search||u.hash)return false;
 }
 return true;
}
function parseConstrainedAuditTarget({url,trustedOrigins=new Set()}={}){
 if(typeof url!=='string'||!url.length||url.length>512||!validOrigins(trustedOrigins)||
    /[\x00-\x20\x7f\\]/.test(url))return Object.freeze({ok:false,code:'INVALID_AUDIT_TARGET'});
 let route;
 if(url.startsWith('/')&&!url.startsWith('//'))route=url;
 else if(url==='http://dev-proxy')route='/';
 else if(url.startsWith('http://dev-proxy/'))route=url.slice('http://dev-proxy'.length);
 else {
  let matched=false;
  for(const origin of trustedOrigins){
   if(url===origin){route='/';matched=true;break;}
   if(url.startsWith(origin+'/')){route=url.slice(origin.length);matched=true;break;}
  }
  if(!matched)return Object.freeze({ok:false,code:'INVALID_AUDIT_TARGET'});
 }
 if(typeof route!=='string'||route.length>256||!/^\/[a-zA-Z0-9._~/-]*$/.test(route)||
    route.includes('//')||route.includes('/./')||route.includes('/../')||route.endsWith('/.')||route.endsWith('/..')||
    route.split('/').some(p=>p.startsWith('.'))||
    BLOCKED_TOP.has((route.split('/')[1]||'').toLowerCase()))
   return Object.freeze({ok:false,code:'INVALID_AUDIT_TARGET'});
 return Object.freeze({ok:true,route});
}
async function readBoundedAuditBody(stream){
 let chunks=[],size=0;
 try{
  for await(const part of stream){
   if(!Buffer.isBuffer(part)&&typeof part!=='string')return null;
   const data=Buffer.isBuffer(part)?part:Buffer.from(part,'utf8');
   size+=data.length;
   if(size>MAX_BODY)return null;
   chunks.push(data);
  }
  const obj=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.getPrototypeOf(obj)!==Object.prototype||
    !Object.hasOwn(obj,'url')||typeof obj.url!=='string'||
    Reflect.ownKeys(obj).some(key=>typeof key!=='string'||!['url','wait','timeout'].includes(key))||
    (Object.hasOwn(obj,'wait')&&(!Number.isInteger(obj.wait)||obj.wait<0||obj.wait>60000))||
    (Object.hasOwn(obj,'timeout')&&(!Number.isInteger(obj.timeout)||obj.timeout<100||obj.timeout>120000)))return null;
  return obj;
 }catch{return null;}
}
function createConstrainedLocalHttpAudit({requestImpl=http.request,trustedOrigins=new Set(),timeoutMs=3500}={}){
 if(typeof requestImpl!=='function'||!validOrigins(trustedOrigins)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>5000)
  throw Error('RC2_AUDIT_UNSAFE_OPTIONS');
 async function audit(input){
  const target=parseConstrainedAuditTarget({url:input?.url,trustedOrigins});
  if(!target.ok)return output(400,false,'INVALID_AUDIT_TARGET');
  // Caller-provided Origin, host, Authorization, headers, cookies, redirects and
  // query strings are never passed to the network layer. Fixed literal endpoint.
  const opts=Object.freeze({hostname:TARGET_HOST,port:TARGET_PORT,method:'HEAD',path:target.route,
    agent:false,headers:Object.freeze({'Accept':'*/*'})});
  return await new Promise(resolve=>{
   let request=null,timeout=null,done=false;
   function finish(result){if(done)return;done=true;clearTimeout(timeout);resolve(result);}
   const failed=code=>output(503,false,code,Object.freeze({mode:'LOCAL_HTTP_HEAD_ONLY',browserAudited:false,
     healingPerformed:false,redirectFollowed:false}));
   try{
    request=requestImpl(opts,response=>{
     const status=response?.statusCode;
     if(!Number.isSafeInteger(status)||status<100||status>599){
      try{response?.destroy();}catch{}
      return finish(failed('LOCAL_HTTP_PROBE_INVALID'));
     }
     const success=status>=200&&status<300;
     const summary=Object.freeze({mode:'LOCAL_HTTP_HEAD_ONLY',route:target.route,status,
       reachable:success,redirectFollowed:false,browserAudited:false,healingPerformed:false});
     try{response.destroy();}catch{}
     finish(output(200,success,success?'LOCAL_HTTP_OK':'LOCAL_HTTP_NOT_GREEN',summary));
    });
    if(!request||typeof request.end!=='function'||typeof request.on!=='function')
      return finish(failed('LOCAL_HTTP_PROBE_UNAVAILABLE'));
    request.on('error',()=>finish(failed('LOCAL_HTTP_PROBE_UNAVAILABLE')));
    timeout=setTimeout(()=>{try{request.destroy();}catch{}finish(failed('LOCAL_HTTP_PROBE_TIMEOUT'));},timeoutMs);
    request.end();
   }catch{finish(failed('LOCAL_HTTP_PROBE_UNAVAILABLE'));}
  });
 }
 return Object.freeze({audit});
}
module.exports={parseConstrainedAuditTarget,createConstrainedLocalHttpAudit,readBoundedAuditBody};
