'use strict';
/** Read-only loopback GET status classifier. Never performs privileged actions. */
const http=require('node:http');
const HOST='127.0.0.1',PORT=17888,UNTRUSTED_ORIGIN='https://untrusted-bridge-check.invalid';
const PROBES=Object.freeze([
 Object.freeze({key:'health',path:'/health',hostHeader:`${HOST}:${PORT}`}),
 Object.freeze({key:'privileged',path:'/service/status',hostHeader:`${HOST}:${PORT}`}),
 Object.freeze({key:'untrustedOrigin',path:'/service/status',hostHeader:`${HOST}:${PORT}`,origin:UNTRUSTED_ORIGIN}),
 Object.freeze({key:'forgedHost',path:'/health',hostHeader:'untrusted-bridge-check.invalid'})
]);
function outcome(code){return Object.freeze({code,readOnly:true,privilegedActionAttempted:false,
 credentialsUsed:false,liveProcessSourceVerified:false,productionChangeAuthorized:false});}
function oneGet(input){
 return new Promise((resolve,reject)=>{
  const headers={Host:input.hostHeader};if(input.origin)headers.Origin=input.origin;
  const req=http.request({hostname:HOST,port:PORT,method:'GET',path:input.path,
   headers,timeout:1200,agent:false},res=>{const statusCode=res.statusCode;
    // Never retain or print potentially sensitive /service/status body.
    res.destroy();resolve({statusCode});});
  req.on('timeout',()=>req.destroy(Error('PROBE_TIMEOUT')));
  req.on('error',reject);req.end();
 });
}
async function inspectNotificationBridgePolicyReadOnly({request=oneGet}={}){
 if(typeof request!=='function')return outcome('BRIDGE_POLICY_UNVERIFIED');
 const observations=[];
 for(const p of PROBES){
  try{
   const result=await request(Object.freeze({...p}));
   if(!result||!Number.isInteger(result.statusCode)||result.statusCode<100||result.statusCode>599)
    return outcome('BRIDGE_POLICY_UNVERIFIED');
   observations.push(result.statusCode);
  }catch(e){
   observations.push(e?.code==='ECONNREFUSED'?'OFFLINE':'UNKNOWN');
  }
 }
 if(observations.every(v=>v==='OFFLINE'))return outcome('BRIDGE_NOT_RUNNING');
 const [health,privileged,untrustedOrigin,forgedHost]=observations;
 if(privileged===200||untrustedOrigin===200||forgedHost===200)
  return outcome('BRIDGE_POTENTIAL_UNAUTHENTICATED_CONTROL');
 if(health===200&&privileged===401&&untrustedOrigin===403&&forgedHost===403)
  return outcome('BRIDGE_POLICY_OBSERVED_SOURCE_UNVERIFIED');
 return outcome('BRIDGE_POLICY_UNVERIFIED');
}
module.exports={inspectNotificationBridgePolicyReadOnly};
