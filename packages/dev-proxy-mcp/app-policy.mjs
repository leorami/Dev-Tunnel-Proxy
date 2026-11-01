/**
 * Portable app-owned authorization policy.
 * Ported from Tiger Slam PR #581 into the shared Dev Tunnel Proxy package.
 * No web listener, grant issuer, token reader, app runner, or persistence.
 *
 * This policy MUST receive a trusted server-verified principal and an
 * app-domain grant loaded from server-owned state, never from MCP arguments.
 */
import { createHash } from 'node:crypto';
import { validateAppCommandArguments } from './gateway.mjs';

// MCP requests can contain accessors, symbols, inherited fields, cycles and
// mutable object aliases even when a typed app schema looks valid. Snapshot
// JSON data WITHOUT invoking accessors before checking a policy or hashing.
const INVALID=Symbol('invalid-json');
const MAX_DEPTH=8;
function copyJson(value,depth=0,seen=new WeakSet()){
  if(depth>MAX_DEPTH)return INVALID;
  if(value===null || typeof value==='string' || typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:INVALID;
  if(typeof value!=='object')return INVALID;
  try{
    if(seen.has(value))return INVALID;
    const proto=Object.getPrototypeOf(value);
    if(Array.isArray(value)){
      if(proto!==Array.prototype || value.length>128)return INVALID;
    }else if(proto!==Object.prototype && proto!==null)return INVALID;
    seen.add(value);
    const descriptors=Object.getOwnPropertyDescriptors(value);
    const keys=Reflect.ownKeys(descriptors);
    if(keys.length>128)return INVALID;
    if(Array.isArray(value)){
      if(keys.some(k=>typeof k!=='string'||(k!=='length'&&!/^(0|[1-9][0-9]*)$/.test(k))))return INVALID;
      const result=[];
      for(let i=0;i<value.length;i++){
        const d=descriptors[String(i)];
        if(!d||!Object.hasOwn(d,'value'))return INVALID;
        const v=copyJson(d.value,depth+1,seen);
        if(v===INVALID)return INVALID;
        result.push(v);
      }
      seen.delete(value);
      return result;
    }
    const result=Object.create(null);
    for(const key of keys){
      if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))return INVALID;
      const d=descriptors[key];
      if(!Object.hasOwn(d,'value'))return INVALID;
      const v=copyJson(d.value,depth+1,seen);
      if(v===INVALID)return INVALID;
      result[key]=v;
    }
    seen.delete(value);
    return result;
  }catch{return INVALID;}
}
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const kinds = new Set(['read', 'proposal', 'reversible_write', 'privileged']);
const environments = new Set(['development', 'staging', 'production']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deny = reason => Object.freeze({allowed:false,reason});
const strictObject = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
 (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function safeRequest(original) {
  const req=copyJson(original);
  if(req===INVALID||!strictObject(req))return null;
  if(!Object.keys(req).every(k=>['name','arguments','requestId','expectedVersion','idempotencyKey'].includes(k)))return null;
  if(typeof req.name!=='string'||!req.name||req.name.length>128||
    !strictObject(req.arguments)||typeof req.requestId!=='string'||!uuid.test(req.requestId))return null;
  if(req.expectedVersion!==undefined&&(!Number.isSafeInteger(req.expectedVersion)||req.expectedVersion<0))return null;
  if(req.idempotencyKey!==undefined&&(typeof req.idempotencyKey!=='string'||!uuid.test(req.idempotencyKey)))return null;
  return req;
}
function fingerprintSafe(req){
  return createHash('sha256').update(canonical({
    name:req.name,arguments:req.arguments,requestId:req.requestId,
    ...(req.expectedVersion===undefined?{}:{expectedVersion:req.expectedVersion}),
    ...(req.idempotencyKey===undefined?{}:{idempotencyKey:req.idempotencyKey}),
  })).digest('hex');
}
export function fingerprintAppCommand(req){
  const safe=safeRequest(req);
  if(!safe)throw new TypeError('INVALID_COMMAND_REQUEST');
  return fingerprintSafe(safe);
}

/**
 * Command definitions are a trusted local registry:
 * {name,appId,kind,scope,roles,environments,argumentSchema}
 *
 * Context identity, environment, token audience and grant MUST be verified by
 * app's actual OAuth/session and policy store before calling this function.
 */
export function authorizeAppCommand(raw,registry,context,nowMs=Date.now()){
  const req=safeRequest(raw);
  if(!req||!Array.isArray(registry)||!strictObject(context))return deny('invalid_request');
  try{
    const matches=registry.filter(d=>d&&d.name===req.name);
    if(matches.length!==1)return deny('unknown_command');
    const cmd=matches[0];
    if(!kinds.has(cmd.kind)||!environments.has(context.environment))return deny('invalid_registration');
    if(!context.actor||context.actor.tokenAudience!==context.resource||
       typeof context.resource!=='string'||!context.resource)return deny('wrong_resource');
    if(cmd.appId!==context.appId)return deny('wrong_app');
    if(!Array.isArray(cmd.environments)||!cmd.environments.includes(context.environment))return deny('wrong_environment');
    if(!Array.isArray(cmd.roles)||!cmd.roles.includes(context.actor.role))return deny('forbidden_role');
    if(!Array.isArray(context.actor.scopes)||!context.actor.scopes.includes(cmd.scope))return deny('missing_scope');
    if(!validateAppCommandArguments(req.arguments,cmd.argumentSchema))return deny('invalid_arguments');
    if(cmd.kind!=='read'){
      if(req.expectedVersion===undefined)return deny('missing_version');
      if(!req.idempotencyKey)return deny('missing_idempotency');
      const grant=context.grant;
      if(!grant||grant.verifiedByServer!==true)return deny('missing_grant');
      if(grant.actorId!==context.actor.id||grant.appId!==context.appId||
         grant.environment!==context.environment||grant.commandName!==cmd.name||
         grant.intentHash!==fingerprintSafe(req))return deny('wrong_grant');
      if(!Number.isFinite(grant.expiresAtMs)||grant.expiresAtMs<=nowMs)return deny('expired_grant');
      if(cmd.kind==='privileged'&&grant.ownerApproval!==true)return deny('owner_approval_required');
    }
    // Never return a reference to the caller's mutable request.
    return Object.freeze({allowed:true,kind:cmd.kind,command:cmd,
      arguments:Object.freeze(req.arguments),request:Object.freeze(req)});
  }catch{return deny('invalid_registration');}
}
