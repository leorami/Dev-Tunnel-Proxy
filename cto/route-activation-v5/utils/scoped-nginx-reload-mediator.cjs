'use strict';
/**
 * Isolated host-side nginx reload mediator CONTRACT PROTOTYPE.
 * No server, socket, child_process import, auth secret, or live execution.
 * The trusted host wrapper must independently supply authorization, command
 * execution, route verification, durable replay state, and command timeouts.
 * Merely supplying callbacks/metadata does NOT grant production permission.
 */
const ACTION='VALIDATE_AND_RELOAD_FIXED_DEV_PROXY';
const COMMANDS=Object.freeze([
  Object.freeze(['exec','dev-proxy','nginx','-t']),
  Object.freeze(['exec','dev-proxy','nginx','-s','reload'])
]);
function receipt(status){return Object.freeze({status,productionChangeAuthorized:false,liveAttested:false});}
function valid(r){
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  try {
    if (Object.getPrototypeOf(r)!==Object.prototype) return false;
    const k=Reflect.ownKeys(r);
    if (k.length!==2 || !k.includes('type') || !k.includes('requestId')) return false;
    for(const x of k){if(typeof x!=='string' || !Object.hasOwn(Object.getOwnPropertyDescriptor(r,x),'value'))return false;}
    return r.type===ACTION && typeof r.requestId==='string' && /^[a-f0-9]{8,64}$/.test(r.requestId);
  }catch{return false;}
}
function createScopedNginxReloadMediator({authorize,run,verify}={}) {
  const seen=new Set();
  let busy=false;
  async function execute(request){
    if(!valid(request)) return receipt('BLOCKED_INVALID_REQUEST');
    if(typeof authorize!=='function' || typeof run!=='function' || typeof verify!=='function')
      return receipt('BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
    if(seen.has(request.requestId)) return receipt('BLOCKED_REPLAY');
    if(busy) return receipt('BLOCKED_CONCURRENT_RELOAD');
    busy=true;
    seen.add(request.requestId); // fail closed even if permission or execution fails
    try {
      if(await authorize(request.requestId,ACTION)!==true) return receipt('BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
      if(await run('docker',[...COMMANDS[0]])!==0) return receipt('NGINX_VALIDATION_FAILED');
      if(await run('docker',[...COMMANDS[1]])!==0) return receipt('NGINX_RELOAD_FAILED');
      if(await verify()!==true) return receipt('ROUTE_NOT_VERIFIED');
      // This is callback proof only; a host wrapper must independently attest.
      return receipt('HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY');
    } catch {return receipt('SCOPED_HOST_OPERATION_FAILED');}
    finally {busy=false;}
  }
  return Object.freeze({run:execute});
}
module.exports={createScopedNginxReloadMediator};
