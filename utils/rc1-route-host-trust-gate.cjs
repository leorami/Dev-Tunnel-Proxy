'use strict';
/**
 * P0 source-only, nonauthorizing PRELIVE trust classifier for Dev Proxy.
 * Trust claims must be independently corroborated using live, read-only
 * Docker/process evidence and the exact candidate SHA. This classifier
 * neither captures that evidence nor issues GO, deploys or mutates services.
 *
 * A disposable broker SIDE-CAR with the Docker engine socket is functionally
 * different from the intended host-side fixed-action mediator. The former
 * must NOT silently graduate into a production-approved release design.
 */
const APPROVED_PROXY_IMAGE='sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1';
const SHA_RX=/^[0-9a-f]{40}$/;
const ID_RX=/^[0-9a-f]{64}$/;
const REQUIRED_MOUNTS=Object.freeze({
 '/app':false,'/app/.env':false,
 '/app/apps':true,'/app/overrides':true,'/app/config':true,
 '/app/build/sites-enabled':true,'/app/.artifacts':true
});
const ROOT_KEYS=['sourceSha','approvedProxyImage','liveMutationAuthorized','containers',
 'broker','originRuntime','ownerRoutesPreserved','hostTransportEvidence','deployed'];
const CONTAINER_KEYS=['id','privileged','mounts'];
const PROXY_KEYS=['id','image','privileged','mounts'];
const API_KEYS=['id','privileged','mounts','published'];
const CONTAINER_SET=['proxy','api','ngrok'];
const BROKER_KEYS=['kind','privateAuthenticatedTransport','containerIdentityAttested','contentBoundActivation',
 'ownerAuthorityVerified','activeRouteObserved','hasDockerSocketMount','configEditEnabled',
 'configEditsCryptographicallyAttested'];
const CANONICAL_KEYS=['SOURCE_CURRENT','SINGLE_RUNTIME','NO_SHADOW_APPS','REAL_APP_VERIFIED','OWNER_WORK_PRESERVED'];
const MOUNT_KEYS=['target','rw','sourceKind'];
const PORT_KEYS=['container','hostIp'];
function plainRecord(o,keys){
 if(o===null||typeof o!=='object'||Array.isArray(o))return false;
 const p=Object.getPrototypeOf(o);
 if(p!==Object.prototype&&p!==null)return false;
 const found=Reflect.ownKeys(o);
 if(found.length!==keys.length)return false;
 return found.every(k=>typeof k==='string'&&keys.includes(k)&&
   Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function arrayOf(a,min,max,checker){
 if(!Array.isArray(a)||a.length<min||a.length>max)return false;
 const props=Reflect.ownKeys(a);
 if(props.length!==a.length+1)return false;
 return a.every(checker);
}
function validContainer(c,keys){
 return plainRecord(c,keys)&&typeof c.id==='string'&&typeof c.privileged==='boolean'&&
 arrayOf(c.mounts,0,24,v=>plainRecord(v,MOUNT_KEYS)&&typeof v.target==='string'&&v.target.startsWith('/')&&typeof v.rw==='boolean'&&
 ['approved-data','docker-socket','other'].includes(v.sourceKind))&&
 (keys!==API_KEYS||arrayOf(c.published,2,2,v=>plainRecord(v,PORT_KEYS)&&Number.isInteger(v.container)&&typeof v.hostIp==='string'));
}
function result(code){return Object.freeze({code,productionChangeAuthorized:false,readyForOwnerUat:false,
  deployed:false,actualHostAttested:false,liveChangePerformed:false});}
function evaluateRouteHostTrustGate(e){
 try{
  if(!plainRecord(e,ROOT_KEYS)||!SHA_RX.test(e.sourceSha)||
    e.approvedProxyImage!==APPROVED_PROXY_IMAGE||
    typeof e.deployed!=='boolean'||typeof e.liveMutationAuthorized!=='boolean'||
    !plainRecord(e.containers,CONTAINER_SET)||
    !validContainer(e.containers.proxy,PROXY_KEYS)||
    !validContainer(e.containers.api,API_KEYS)||
    !validContainer(e.containers.ngrok,CONTAINER_KEYS)||
    typeof e.containers.proxy.image!=='string'||
    !plainRecord(e.broker,BROKER_KEYS)||
    !plainRecord(e.originRuntime,CANONICAL_KEYS)||CANONICAL_KEYS.some(k=>typeof e.originRuntime[k]!=='boolean')||
    !Number.isInteger(e.ownerRoutesPreserved)||
    typeof e.hostTransportEvidence!=='string'||
    !['host-process','sidecar'].includes(e.broker.kind)||
    BROKER_KEYS.slice(1).some(k=>typeof e.broker[k]!=='boolean'))return result('INVALID_RELEASE_EVIDENCE');
  if(e.deployed)return result('RUNTIME_ALREADY_MUTATED');
  if(e.liveMutationAuthorized)return result('ILLEGAL_IMPLIED_AUTHORIZATION');
  if(e.containers.proxy.image!==APPROVED_PROXY_IMAGE)return result('PROXY_IMAGE_NOT_APPROVED');
  if(CONTAINER_SET.some(name=>!ID_RX.test(e.containers[name].id)))return result('INVALID_CONTAINER_IDENTITY');
  if(e.containers.proxy.privileged||e.containers.api.privileged||e.containers.ngrok.privileged)
    return result('PRIVILEGED_SERVICE_BLOCKED');
  const api=e.containers.api;
  if(api.mounts.some(m=>m.sourceKind==='docker-socket'||m.target==='/var/run/docker.sock'||m.target==='/run/docker.sock'))
    return result('API_HOST_DOCKER_SOCKET_FORBIDDEN');
  if(['proxy','ngrok'].some(name=>e.containers[name].mounts.some(m=>m.sourceKind==='docker-socket'||
    m.target==='/var/run/docker.sock'||m.target==='/run/docker.sock')))
    return result('SERVICE_HOST_DOCKER_SOCKET_FORBIDDEN');
  const count=new Set();
  for(const mount of api.mounts){
   if(count.has(mount.target))return result('API_DUPLICATE_MOUNT');
   count.add(mount.target);
   if(!Object.hasOwn(REQUIRED_MOUNTS,mount.target)||mount.sourceKind!=='approved-data')
     return result('API_UNEXPECTED_MOUNT');
  }
  if(!api.mounts.some(m=>m.target==='/app'&&m.rw===false))return result('API_SOURCE_MUTABLE');
  if(!api.mounts.some(m=>m.target==='/app/.env'&&m.rw===false))return result('OWNER_SECRET_MOUNT_WRITABLE');
  for(const [target,rw]of Object.entries(REQUIRED_MOUNTS)){
   if(target==='/app'||target==='/app/.env')continue;
   if(!api.mounts.some(m=>m.target===target&&m.rw===rw))return result('API_ROUTE_DATA_UNWRITABLE');
  }
  if(e.containers.proxy.id===e.containers.api.id||e.containers.proxy.id===e.containers.ngrok.id||
     e.containers.api.id===e.containers.ngrok.id)return result('INVALID_CONTAINER_IDENTITY');
  const ports=new Set();
  for(const p of api.published){
   if(ports.has(p.container)||![3001,3002].includes(p.container)||
     !['127.0.0.1','::1','[::1]'].includes(p.hostIp))return result('API_MANAGEMENT_PORT_EXPOSED');
   ports.add(p.container);
  }
  if(e.broker.kind!=='host-process'||e.broker.hasDockerSocketMount)
    return result('BROKER_DOCKER_PRIVILEGE_BLOCKED');
  if(e.hostTransportEvidence!=='HOST_PROCESS_ACTUAL')return result('HOST_TRANSPORT_NOT_VERIFIED');
  if(!e.broker.privateAuthenticatedTransport||!e.broker.containerIdentityAttested||
     !e.broker.contentBoundActivation||!e.broker.ownerAuthorityVerified||!e.broker.activeRouteObserved)
    return result('HOST_MEDIATOR_UNVERIFIED');
  if(e.broker.configEditEnabled&&!e.broker.configEditsCryptographicallyAttested)
    return result('CONFIG_EDIT_TRUST_NOT_PROVEN');
  if(e.ownerRoutesPreserved!==17)return result('OWNER_ROUTE_PRESERVATION_UNKNOWN');
  if(CANONICAL_KEYS.some(k=>e.originRuntime[k]!==true))return result('CANONICAL_RUNTIME_UNVERIFIED');
  // Even perfect input is a redacted plan-only readiness receipt, not proof of
  // owner authorization, a live runtime, or a safe production promotion.
  return result('HOST_TRUST_PLAN_ONLY');
 }catch{return result('INVALID_RELEASE_EVIDENCE');}
}
module.exports={evaluateRouteHostTrustGate,APPROVED_PROXY_IMAGE,REQUIRED_MOUNTS};
