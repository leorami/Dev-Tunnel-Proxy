'use strict';
// Source-only, no-I/O readout of narrowly projected Docker inspect metadata.
// NEVER use Config.Env or print Mount.Source, passwords, runtime IDs or host paths.
// Pure policy may diagnose risk; it cannot authorize host actions or attest live truth.
const {classifyManagementBindings}=require('./rc1-runtime-ports.cjs');
const KEYS=new Set(['proxyImage','apiUser','apiPrivileged','apiMounts','apiPorts']);
const APPROVED_IMAGE='sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1';
const APPROVED_MOUNTS=new Set(['/app','/app/.env','/app/.artifacts','/app/config','/app/build/sites-enabled','/app/status','/app/.certs']);
function own(o,k){
  if(o===null||typeof o!=='object')return {found:false};
  const d=Object.getOwnPropertyDescriptor(o,k);
  return d&&Object.prototype.hasOwnProperty.call(d,'value') ? {found:true,value:d.value}:{found:false};
}
function isRecord(o){
  if(o===null||typeof o!=='object'||Array.isArray(o))return false;
  const p=Object.getPrototypeOf(o);return p===Object.prototype||p===null;
}
function response(state,findings){
  return Object.freeze({state,findings:Object.freeze(findings),
    productionChangeAuthorized:false,performedActions:false,
    sourceIntegrityVerified:false,deployed:false});
}
function assessRuntimeIsolation(value){
  try{
    if(!isRecord(value)||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!KEYS.has(k)||!own(value,k).found)){
      return response('UNKNOWN',['INVALID_EVIDENCE']);
    }
    const image=own(value,'proxyImage').value, user=own(value,'apiUser').value,
      privileged=own(value,'apiPrivileged').value,mounts=own(value,'apiMounts').value,
      ports=own(value,'apiPorts').value;
    if(typeof image!=='string'||typeof user!=='string'||typeof privileged!=='boolean'||
       !Array.isArray(mounts)||!isRecord(ports)||mounts.length>128){
      return response('UNKNOWN',['INVALID_EVIDENCE']);
    }
    const found=[];
    if(image!==APPROVED_IMAGE)found.push('WRONG_PROXY_IMAGE');
    const isRoot=/^(?:root|0)(?::|$)/.test(user)||user==='';
    if(isRoot)found.push('ROOT_USER');
    if(privileged)found.push('PRIVILEGED_CONTAINER');
    const required=new Map();
    let socketPresent=false,appWritable=false,malformed=false,shadow=false;
    for(let i=0;i<mounts.length;i++){
      const d=Object.getOwnPropertyDescriptor(mounts,String(i));
      if(!d||!Object.prototype.hasOwnProperty.call(d,'value')||!isRecord(d.value)){
        malformed=true;continue;
      }
      const dest=own(d.value,'Destination'),rw=own(d.value,'RW'),type=own(d.value,'Type');
      if(!dest.found||typeof dest.value!=='string'||!rw.found||typeof rw.value!=='boolean'||
         !type.found||typeof type.value!=='string'){
        malformed=true;continue;
      }
      if(dest.value==='/var/run/docker.sock')socketPresent=true;
      if(dest.value.startsWith('/app/')&&!APPROVED_MOUNTS.has(dest.value))shadow=true;
      if(['/app','/app/.env','/app/.artifacts'].includes(dest.value)){
        if(required.has(dest.value))malformed=true;
        required.set(dest.value,{rw:rw.value,type:type.value});
      }
    }
    if(malformed||['/app','/app/.env','/app/.artifacts'].some(d=>!required.has(d)||required.get(d).type!=='bind')){
      found.push('MOUNT_EVIDENCE_INCOMPLETE');
    }
    if(required.has('/app')&&required.get('/app').rw===true){found.push('APP_SOURCE_WRITABLE');appWritable=true;}
    if(required.has('/app/.env')&&required.get('/app/.env').rw===true)found.push('OWNER_ENV_WRITABLE');
    if(required.has('/app/.artifacts')&&required.get('/app/.artifacts').rw===false)found.push('SESSION_STORE_READ_ONLY');
    if(shadow)found.push('UNREVIEWED_APP_SHADOW_MOUNT');
    if(socketPresent)found.push('HOST_DOCKER_SOCKET_MOUNTED');
    if(socketPresent&&appWritable&&(isRoot||privileged))found.push('COMPOUND_HOST_CONTROL');
    const portStatus=classifyManagementBindings(ports);
    if(portStatus==='all_interfaces')found.push('MANAGEMENT_NOT_LOOPBACK');
    else if(portStatus!=='loopback')found.push('INCOMPLETE_PORT_EVIDENCE');
    const extras=Reflect.ownKeys(ports).filter(k=>!['3001/tcp','3002/tcp'].includes(k));
    if(extras.length)found.push('UNREVIEWED_PUBLISHED_PORT');
    const critical=found.some(s=>['WRONG_PROXY_IMAGE','MANAGEMENT_NOT_LOOPBACK','COMPOUND_HOST_CONTROL','PRIVILEGED_CONTAINER'].includes(s));
    const incomplete=found.some(s=>['INVALID_EVIDENCE','MOUNT_EVIDENCE_INCOMPLETE','INCOMPLETE_PORT_EVIDENCE','UNREVIEWED_PUBLISHED_PORT'].includes(s));
    const state=critical?'CRITICAL':incomplete?'UNKNOWN':found.length?'REVIEW_REQUIRED':'PLAN_ONLY';
    return response(state,found);
  }catch{return response('UNKNOWN',['INVALID_EVIDENCE']);}
}
module.exports={assessRuntimeIsolation,EXPECTED_IMAGE:APPROVED_IMAGE};
