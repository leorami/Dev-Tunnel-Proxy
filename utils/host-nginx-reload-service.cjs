'use strict';
/**
 * Host Unix-socket transport for a SINGLE, fixed nginx reload capability.
 * This is a DISPOSABLE-TEST prototype, not an installed or authorized service.
 * Host process must provide real authorization, exact container/image
 * attestation, bounded shell:false execFile runner, and active-route check.
 * Never mount Docker's engine socket in the web-facing API.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const ACTION = 'VALIDATE_AND_RELOAD_FIXED_DEV_PROXY';
function result(status) {
  return Object.freeze({status,productionChangeAuthorized:false,liveAttested:false});
}
function isRequest(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.getPrototypeOf(r)!==Object.prototype) return false;
  const names = Reflect.ownKeys(r);
  if (names.length !== 2 || !names.includes('type') || !names.includes('requestId')) return false;
  return names.every(k => typeof k === 'string' && Object.hasOwn(Object.getOwnPropertyDescriptor(r,k),'value')) &&
    r.type === ACTION && typeof r.requestId === 'string' && /^[a-f0-9]{32,64}$/.test(r.requestId);
}
async function privateDir(dir) {
  const st=await fs.lstat(dir);
  if(!st.isDirectory() || st.isSymbolicLink() || (st.mode&0o077)!==0 || st.uid!==process.getuid())
    throw Error('PRIVATE_DIR_REQUIRED');
}
function createHostReloadService({directory,approvedContainerId,operationTimeoutMs=10000,authorize,attest,execute,verify}={}) {
  let server=null, socketIdentity=null, busy=false;
  if(typeof directory!=='string' || !path.isAbsolute(directory) || path.normalize(directory)!==directory || directory.endsWith('/') ||
     !/^[0-9a-f]{64}$/.test(approvedContainerId||'') ||
     !Number.isInteger(operationTimeoutMs) || operationTimeoutMs<25 || operationTimeoutMs>15000 ||
     [authorize,attest,execute,verify].some(fn=>typeof fn!=='function'))
    throw Error('INVALID_HOST_SERVICE_CONFIG');
  const RUN = Object.freeze([
    Object.freeze(['exec',approvedContainerId,'nginx','-t']),
    Object.freeze(['exec',approvedContainerId,'nginx','-s','reload'])
  ]);
  const socketPath=path.join(directory,'nginx-reload.sock');
  const nonceDir=path.join(directory,'replay');
  if(Buffer.byteLength(socketPath)>96) throw Error('SOCKET_PATH_TOO_LONG');
  async function reserve(id) {
    const p=path.join(nonceDir,id);
    try {
      const handle=await fs.open(p,'wx',0o600);
      try {await handle.sync();}finally{await handle.close();}
      return true;
    } catch (e) {
      if(e.code==='EEXIST') return false;
      throw e;
    }
  }
  async function handle(req) {
    if(!isRequest(req)) return result('BLOCKED_INVALID_REQUEST');
    if(busy) return result('BLOCKED_CONCURRENT_RELOAD');
    busy=true;
    const abort=new AbortController();
    // One bounded deadline over ALL external callbacks, not per-call retries.
    const timer=setTimeout(()=>abort.abort(),operationTimeoutMs);
    async function bounded(fn) {
      if(abort.signal.aborted) throw Error('HOST_CALLBACK_TIMEOUT');
      return await new Promise((resolve,reject)=>{
        function onAbort(){reject(Error('HOST_CALLBACK_TIMEOUT'));}
        abort.signal.addEventListener('abort',onAbort,{once:true});
        Promise.resolve().then(()=>fn(abort.signal)).then(value=>{
          abort.signal.removeEventListener('abort',onAbort);
          resolve(value);
        },err=>{
          abort.signal.removeEventListener('abort',onAbort);
          reject(err);
        });
      });
    }
    try {
      if(!await reserve(req.requestId)) return result('BLOCKED_REPLAY');
      if(await bounded(signal=>authorize(req.requestId,ACTION,signal))!==true) return result('BLOCKED_NO_TRUSTED_HOST_AUTHORITY');
      if(await bounded(signal=>attest('before',signal))!==true) return result('BLOCKED_CONTAINER_IDENTITY');
      if(await bounded(signal=>execute('docker',[...RUN[0]],signal))!==0) return result('NGINX_VALIDATION_FAILED');
      if(await bounded(signal=>attest('pre-reload',signal))!==true) return result('BLOCKED_CONTAINER_IDENTITY');
      if(await bounded(signal=>execute('docker',[...RUN[1]],signal))!==0) return result('NGINX_RELOAD_FAILED');
      if(await bounded(signal=>attest('post-reload',signal))!==true) return result('CONTAINER_IDENTITY_CHANGED_AFTER_RELOAD');
      if(await bounded(signal=>verify(signal))!==true) return result('ROUTE_NOT_VERIFIED');
      return result('HOST_CALLBACKS_REPORTED_RELOAD_AND_VERIFY');
    } catch {
      if(abort.signal.aborted) return result('HOST_OPERATION_TIMEOUT_INDETERMINATE');
      return result('SCOPED_HOST_OPERATION_FAILED');
    } finally {
      clearTimeout(timer);
      busy=false;
    }
  }
  function connection(socket) {
    let processed=false, bytes=0, chunks=[];
    function reply(status) {
      if(processed) return;
      processed=true;
      socket.end(JSON.stringify(result(status))+'\n');
    }
    socket.setTimeout(2500,()=>reply('BLOCKED_INVALID_REQUEST'));
    socket.on('data',data=>{
      if(processed) return;
      bytes+=data.length;
      if(bytes>2048){reply('BLOCKED_INVALID_REQUEST');return;}
      chunks.push(data);
      const buf=Buffer.concat(chunks);
      const end=buf.indexOf(10);
      if(end<0)return;
      if(end!==buf.length-1){reply('BLOCKED_INVALID_REQUEST');return;}
      processed=true;
      let parsed;
      try{parsed=JSON.parse(buf.subarray(0,end).toString('utf8'));}catch{socket.end(JSON.stringify(result('BLOCKED_INVALID_REQUEST'))+'\n');return;}
      void handle(parsed).then(value=>socket.end(JSON.stringify(value)+'\n'),
        ()=>socket.end(JSON.stringify(result('SCOPED_HOST_OPERATION_FAILED'))+'\n'));
    });
    socket.on('error',()=>{});
  }
  async function start() {
    if(server) throw Error('ALREADY_LISTENING');
    await privateDir(directory);
    try {await fs.lstat(socketPath);throw Error('SOCKET_PATH_ALREADY_EXISTS');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    try {await fs.mkdir(nonceDir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
    await privateDir(nonceDir);
    const srv=net.createServer({allowHalfOpen:true},connection);
    try {
      await new Promise((resolve,reject)=>{
        srv.once('error',reject);
        srv.listen(socketPath,()=>{srv.removeListener('error',reject);resolve();});
      });
      await fs.chmod(socketPath,0o600);
      socketIdentity=await fs.lstat(socketPath);
      if(!socketIdentity.isSocket())throw Error('NOT_A_SOCKET');
      server=srv;
    }catch(e){srv.close();throw e;}
  }
  async function stop() {
    if(!server)return;
    const running=server;
    server=null;
    await new Promise(resolve=>running.close(resolve));
    try {
      const current=await fs.lstat(socketPath);
      if(current.isSocket() && current.ino===socketIdentity?.ino && current.dev===socketIdentity?.dev)
        await fs.unlink(socketPath);
    }catch(e){if(e.code!=='ENOENT')throw e;}
    socketIdentity=null;
  }
  return Object.freeze({start,stop,socketPath});
}
module.exports={ACTION,createHostReloadService};
