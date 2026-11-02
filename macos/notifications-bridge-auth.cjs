'use strict';
/**
 * Host-side macOS bridge boundary. This module is pure: no Messages.app,
 * launchctl, sockets or filesystem operations, so it can be tested safely.
 */
const { createHash, timingSafeEqual } = require('node:crypto');

const TRUSTED_LOCAL_UI_ORIGINS = Object.freeze([
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'https://localhost',
  'https://127.0.0.1',
  'https://localhost:8443',
  'https://127.0.0.1:8443',
]);

function resolveAllowedOrigins(extra='') {
  const origins=new Set(TRUSTED_LOCAL_UI_ORIGINS);
  for (const raw of String(extra||'').split(',').map(x=>x.trim()).filter(Boolean)) {
    let u;
    try { u=new URL(raw); } catch { throw new Error('Invalid bridge UI origin configuration'); }
    if(u.origin!==raw || u.protocol!=='https:' || u.username || u.password || !u.hostname) {
      throw new Error('Bridge UI origin must be an exact HTTPS origin');
    }
    if(raw==='*'||u.hostname==='*') throw new Error('Wildcard bridge origin forbidden');
    origins.add(raw);
  }
  return origins;
}
const ROUTES = new Map([
  ['/health',new Set(['GET'])],
  ['/service/status',new Set(['GET'])],
  ['/service/install',new Set(['POST'])],
  ['/service/uninstall',new Set(['POST'])],
  ['/test',new Set(['POST'])],
]);
function equalSecret(candidate,expected) {
  if (typeof candidate!=='string'||typeof expected!=='string'||expected.length<32||candidate.length>512) return false;
  const a=createHash('sha256').update(candidate).digest();
  const b=createHash('sha256').update(expected).digest();
  return timingSafeEqual(a,b);
}
function authorizeBridgeRequest(request,{token,port=17888,allowedOrigins=resolveAllowedOrigins()}={}) {
  const headers=request.headers||{};
  const host=headers.host;
  if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`) {
    return {allowed:false,status:403,corsOrigin:null,reason:'BRIDGE_HOST_DENIED'};
  }
  const origin=headers.origin;
  const trustedOrigin=typeof origin==='string' && allowedOrigins.has(origin);
  if(origin!==undefined&&!trustedOrigin) {
    return {allowed:false,status:403,corsOrigin:null,reason:'BRIDGE_ORIGIN_DENIED'};
  }
  const corsOrigin=trustedOrigin?origin:null;
  const url=request.url?.split('?')[0];
  const methods=ROUTES.get(url);
  if(!methods) return {allowed:false,status:404,corsOrigin,reason:'BRIDGE_ROUTE_UNKNOWN'};
  if(request.method==='OPTIONS') {
    const requested=headers['access-control-request-method'];
    const requestedHeaders=(headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
    if(!trustedOrigin||!methods.has(requested)||requestedHeaders.some(x=>!['authorization','content-type'].includes(x))) {
      return {allowed:false,status:403,corsOrigin:null,reason:'BRIDGE_PREFLIGHT_DENIED'};
    }
    return {allowed:true,status:204,corsOrigin,isPreflight:true};
  }
  if(url==='/health') {
    if(!methods.has(request.method)) return {allowed:false,status:405,corsOrigin,reason:'BRIDGE_METHOD_DENIED'};
    return {allowed:true,status:200,corsOrigin};
  }
  // Privileged routes fail closed as unauthorized before method details.
  // A wrong verb must not skip the bearer check.
  if(typeof token!=='string'||token.length<32) return {allowed:false,status:503,corsOrigin,reason:'BRIDGE_NOT_PAIRED'};
  const auth=headers.authorization;
  const presented=typeof auth==='string'&&auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!equalSecret(presented,token))return {allowed:false,status:401,corsOrigin,reason:'BRIDGE_AUTH_REQUIRED'};
  if(!methods.has(request.method)) return {allowed:false,status:405,corsOrigin,reason:'BRIDGE_METHOD_DENIED'};
  return {allowed:true,status:200,corsOrigin};
}
module.exports={resolveAllowedOrigins,authorizeBridgeRequest};
