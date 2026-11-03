'use strict';
/*
 * Pure API-only RO remount receipt evaluator. Source-only and non-authorizing:
 * never reads Docker, files, HTTP, credentials, paths or session content.
 * Require independent owner/go/runtime corroboration; PLAN_ONLY is not a GO.
 */
const PRODUCT_SHA = 'd89c962fb31a962a518f331bae458e63708e7e86';
const PROXY_IMAGE = 'sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1';
const TOP = new Set(['productSha','proxyImage','before','after','mounts','ports','gates']);
const IDS = new Set(['apiId','proxyId','ngrokId']);
const GATE_KEYS = Object.freeze([
  'sourceTreeParity','noAdminPasswordOverride','ownerCredentialPreserved',
  'existingSessionPreserved','privateHealthMinimal','anonymousRoutesDenied',
  'artifactsDenied','legacyPasswordEndpoint404','untrustedOriginDenied',
  'sharedNginxApiConfigParity','apps17Preserved','ngrokUnchanged',
  'bridgeUnchanged','noHostDockerSocket','apiNotPrivileged',
  'sessionStoreModePrivate','trustedOriginsPreserved'
]);
const GATES = new Set(GATE_KEYS);
const EXPECTED_MOUNTS = Object.freeze({
  '/app':false,
  '/app/.env':false,
  '/app/apps':true,
  '/app/overrides':true,
  '/app/config':true,
  '/app/build/sites-enabled':true,
  '/app/.artifacts':true
});
const ID_RX = /^[0-9a-f]{64}$/;
function descriptor(o,k) {
  return o !== null && typeof o === 'object' ? Object.getOwnPropertyDescriptor(o,k) : undefined;
}
function own(o,k) {
  const d=descriptor(o,k);
  return d && Object.prototype.hasOwnProperty.call(d,'value') ? d.value : undefined;
}
function isRecord(o,keys) {
  if(!o || typeof o!=='object' || Array.isArray(o)) return false;
  const p=Object.getPrototypeOf(o);
  return (p===Object.prototype||p===null) && Reflect.ownKeys(o).every(k=>
    typeof k==='string' && keys.has(k) && descriptor(o,k) &&
    Object.prototype.hasOwnProperty.call(descriptor(o,k),'value'));
}
function result(code) {
  return Object.freeze({code,productionChangeAuthorized:false,
    performedActions:false,deployed:false,liveAttested:false});
}
function evaluateApiOnlyPostcheck(e) {
  try {
    if(!isRecord(e,TOP) || !isRecord(own(e,'before'),IDS) || !isRecord(own(e,'after'),IDS) ||
       !isRecord(own(e,'gates'),GATES)) return result('INVALID_EVIDENCE');
    const before=own(e,'before'),after=own(e,'after'),gates=own(e,'gates');
    if([...IDS].some(k=>typeof own(before,k)!=='string' || typeof own(after,k)!=='string' ||
       !ID_RX.test(own(before,k)) || !ID_RX.test(own(after,k))) ||
       [...GATES].some(k=>typeof own(gates,k)!=='boolean')) return result('INVALID_EVIDENCE');
    if(own(e,'productSha')!==PRODUCT_SHA) return result('WRONG_APPROVED_PRODUCT');
    if(own(e,'proxyImage')!==PROXY_IMAGE) return result('WRONG_APPROVED_PROXY_IMAGE');
    if(own(before,'proxyId')!==own(after,'proxyId') ||
       own(before,'ngrokId')!==own(after,'ngrokId')) return result('OUT_OF_SCOPE_CONTAINER_CHANGE');
    if(own(before,'apiId')===own(after,'apiId')) return result('API_NOT_RECREATED');
    const mounts=own(e,'mounts');
    if(!Array.isArray(mounts) || mounts.length<5 || mounts.length>24 ||
       Reflect.ownKeys(mounts).some(k=>k!=='length'&&!/^\d+$/.test(k))) return result('INVALID_EVIDENCE');
    const seen=new Map();
    for(let i=0;i<mounts.length;i++) {
      const m=descriptor(mounts,String(i));
      if(!m || !Object.prototype.hasOwnProperty.call(m,'value') ||
         !isRecord(m.value,new Set(['target','rw'])) ||
         typeof own(m.value,'target')!=='string' || typeof own(m.value,'rw')!=='boolean')
        return result('INVALID_EVIDENCE');
      const target=own(m.value,'target');
      if(seen.has(target)) return result('INVALID_EVIDENCE');
      seen.set(target,own(m.value,'rw'));
      if(target==='/var/run/docker.sock') return result('HOST_DOCKER_SOCKET_PRESENT');
      if(target==='/app/.env' && own(m.value,'rw')===true) return result('OWNER_ENV_WRITABLE');
      if(target==='/app/.artifacts' && own(m.value,'rw')===false) return result('SESSION_STORE_READ_ONLY');
      if(target.startsWith('/app/') && own(m.value,'rw')===true &&
         !Object.hasOwn(EXPECTED_MOUNTS,target))
        return result('WRITABLE_APP_SUBMOUNT');
    }
    if(Object.entries(EXPECTED_MOUNTS).some(([target,rw])=>
      seen.get(target)!==rw)) return result('API_MOUNT_SECURITY_FAIL');
    const ports=own(e,'ports');
    if(!Array.isArray(ports) || ports.length!==2 ||
       Reflect.ownKeys(ports).some(k=>k!=='length'&&!/^\d+$/.test(k)))
      return result('API_PORT_SECURITY_FAIL');
    const actual=new Set();
    for(let i=0;i<ports.length;i++) {
      const d=descriptor(ports,String(i));
      if(!d || !Object.prototype.hasOwnProperty.call(d,'value') ||
         !isRecord(d.value,new Set(['target','published','hostIp']))) return result('INVALID_EVIDENCE');
      const p=d.value,port=own(p,'target');
      if(![3001,3002].includes(port) || actual.has(port) ||
         own(p,'published')!==port || !['127.0.0.1','::1','[::1]'].includes(own(p,'hostIp')))
         return result('API_PORT_SECURITY_FAIL');
      actual.add(port);
    }
    if(GATE_KEYS.some(k=>own(gates,k)!==true)) return result('POSTCHECK_INCOMPLETE');
    // A complete REDACTED receipt remains evidence for human review, never proof
    // that a live owner-controlled runtime was actually inspected or authorized.
    return result('API_ONLY_RO_POSTCHECK_PLAN_ONLY');
  } catch { return result('INVALID_EVIDENCE'); }
}
module.exports={evaluateApiOnlyPostcheck,PRODUCT_SHA,PROXY_IMAGE,GATE_KEYS};
