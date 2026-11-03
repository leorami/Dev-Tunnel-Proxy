'use strict';
/**
 * Dev Proxy RC1: isolated route-mutation transaction prototype.
 * NO Docker, shell, host, filesystem, network, credentials, or owner authorization.
 * The caller MUST supply scoped adapters and independent runtime attestation.
 * Not wired into live API; not a permission to mutate production.
 *
 * The controller serializes within one process only. A real integration also
 * requires a cross-process lock and no-follow atomic filesystem adapter.
 */
const REQUIRED_IO = ['read', 'write', 'remove', 'generateBundle'];
const REQUIRED_ACTOR = ['validate', 'reload', 'verifyRoute'];
function receipt(status) {
  return Object.freeze({status, productionChangeAuthorized:false, liveAttested:false});
}
function validInput(x) {
  return x && typeof x === 'object' && !Array.isArray(x) &&
    typeof x.name === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x.name) &&
    typeof x.content === 'string' && x.content.length > 0 &&
    Buffer.byteLength(x.content,'utf8') <= 131072;
}
function hasMethods(obj,names) {
  try {return obj && names.every(n => typeof obj[n] === 'function');}
  catch {return false;}
}
function createRouteMutationTransaction({io,activation,mutex}={}) {
  let busy=false;
  async function applyUnderExclusiveLock(request) {
    let oldApp,oldBundle,loaded=false;
    try {
      oldApp=await io.read('app');
      oldBundle=await io.read('bundle');
      if ((oldApp!==null && typeof oldApp!=='string') ||
          (oldBundle!==null && typeof oldBundle!=='string'))
        return receipt('BLOCKED_INVALID_PREIMAGE');
      loaded=true;
      await io.write('app',request.content);
      await io.generateBundle();
      if (await activation.validate() !== true) throw Error('candidate_rejected');
      if (await activation.reload() !== true) throw Error('reload_failed');
      if (await activation.verifyRoute() !== true) throw Error('route_not_verified');
      return receipt('ACTIVATION_VERIFIED_BY_CALLER');
    } catch {
      if (!loaded) return receipt('BLOCKED_PREIMAGE_READ_FAILED');
      try {
        if (oldApp===null) await io.remove('app');
        else await io.write('app',oldApp);
        if (oldBundle===null) await io.remove('bundle');
        else await io.write('bundle',oldBundle);
        return receipt('ROLLBACK_FILES_RESTORED_REQUIRES_OPERATOR_VERIFICATION');
      } catch {
        return receipt('ROLLBACK_FAILED_REQUIRES_OPERATOR_INTERVENTION');
      }
    }
  }
  async function apply(request) {
    if (!validInput(request)) return receipt('BLOCKED_INVALID_INPUT');
    if (!hasMethods(io,REQUIRED_IO) || !hasMethods(activation,REQUIRED_ACTOR))
      return receipt('BLOCKED_NO_SCOPED_ACTIVATION');
    if (!hasMethods(mutex,['acquire'])) return receipt('BLOCKED_NO_EXCLUSIVE_LOCK');
    if (busy) return receipt('BLOCKED_TRANSACTION_BUSY');
    busy=true;
    let lease,output;
    try {
      lease=await mutex.acquire();
      if (!lease || typeof lease.release!=='function') output=receipt('BLOCKED_LOCK_BUSY');
      else output=await applyUnderExclusiveLock(request);
    } catch {output=receipt('BLOCKED_LOCK_ERROR');}
    finally {
      if (lease && typeof lease.release==='function') {
        try {await lease.release();}catch {output=receipt('BLOCKED_LOCK_RELEASE_FAILED');}
      }
      busy=false;
    }
    return output;
  }
  return Object.freeze({apply});
}
module.exports={createRouteMutationTransaction};
