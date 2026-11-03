'use strict';
/**
 * API-side client for the single-action private host Unix socket.
 * Not wired into owner API; does not provide owner authorization.
 */
const net=require('node:net');
const crypto=require('node:crypto');
const path=require('node:path');
const ACTION='VALIDATE_AND_RELOAD_FIXED_DEV_PROXY';
const STATUSES=new Set([
 'HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY',
 'CONTAINER_IDENTITY_CHANGED_AFTER_RELOAD',
 'HOST_OPERATION_TIMEOUT_INDETERMINATE',
 'BLOCKED_INVALID_REQUEST','BLOCKED_CONCURRENT_RELOAD','BLOCKED_REPLAY',
 'BLOCKED_NO_TRUSTED_HOST_AUTHORITY','BLOCKED_CONTAINER_IDENTITY',
 'NGINX_VALIDATION_FAILED','NGINX_RELOAD_FAILED','ROUTE_NOT_VERIFIED',
 'SCOPED_HOST_OPERATION_FAILED'
]);
function response(status){return Object.freeze({status,productionChangeAuthorized:false,liveAttested:false});}
function createHostReloadClient({socketPath}={}) {
  if(typeof socketPath!=='string'||!path.isAbsolute(socketPath)||path.normalize(socketPath)!==socketPath||
     !socketPath.endsWith('/nginx-reload.sock'))throw Error('INVALID_SOCKET_PATH');
  async function activate() {
    return await new Promise(resolve=>{
      let done=false,received=Buffer.alloc(0);
      const s=net.createConnection({path:socketPath});
      function finish(code){if(done)return;done=true;s.destroy();resolve(response(code));}
      s.setTimeout(18000,()=>finish('BLOCKED_HOST_MEDIATOR_UNAVAILABLE'));
      s.once('error',()=>finish('BLOCKED_HOST_MEDIATOR_UNAVAILABLE'));
      s.on('data',data=>{
        received=Buffer.concat([received,data]);
        if(received.length>1024){finish('BLOCKED_INVALID_HOST_REPLY');return;}
        const end=received.indexOf(10);
        if(end<0)return;
        if(end!==received.length-1){finish('BLOCKED_INVALID_HOST_REPLY');return;}
        try {
          const reply=JSON.parse(received.subarray(0,end).toString('utf8'));
          const ok=reply && typeof reply==='object' && !Array.isArray(reply) &&
            Object.keys(reply).length===3 && typeof reply.status==='string' && STATUSES.has(reply.status) &&
            reply.productionChangeAuthorized===false && reply.liveAttested===false;
          finish(ok?reply.status:'BLOCKED_INVALID_HOST_REPLY');
        }catch{finish('BLOCKED_INVALID_HOST_REPLY');}
      });
      s.on('end',()=>{if(!done)finish('BLOCKED_INVALID_HOST_REPLY');});
      s.on('connect',()=>s.end(JSON.stringify({type:ACTION,requestId:crypto.randomBytes(16).toString('hex')})+'\n'));
    });
  }
  return Object.freeze({activate});
}
module.exports={createHostReloadClient};
