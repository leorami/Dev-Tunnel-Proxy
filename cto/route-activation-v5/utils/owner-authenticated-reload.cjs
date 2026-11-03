'use strict';
/**
 * Single-action private host reload transport, NOT a service installer.
 * Only an owner-controlled host process may start this broker. The 32-byte
 * secret must come from private runtime provision, never source/Git/logs.
 * A signed request is capability-limited to nginx validation and reload;
 * it does not constitute the owner's approval for a production deployment.
 */
const fs=require('node:fs/promises');
const net=require('node:net');
const path=require('node:path');
const crypto=require('node:crypto');
const ACTION='VALIDATE_AND_RELOAD_FIXED_DEV_PROXY';
const STATUSES=new Set(['RELOAD_AND_VERIFICATION_REPORTED','BLOCKED_AUTH','BLOCKED_REPLAY',
  'BLOCKED_BUSY','BLOCKED_INVALID_REQUEST','BLOCKED_UNAVAILABLE','BLOCKED_BAD_REPLY',
  'BLOCKED_CONTAINER_IDENTITY','NGINX_VALIDATION_FAILED','NGINX_RELOAD_FAILED',
  'ACTIVE_ROUTE_UNVERIFIED','HOST_OPERATION_INDETERMINATE','BLOCKED_QUARANTINED','BUNDLE_DIGEST_MISMATCH']);
const result=status=>Object.freeze({status,productionChangeAuthorized:false,liveAttested:false});
function secretOK(s){return Buffer.isBuffer(s)&&s.length>=32&&s.length<=128;}
function requestMAC(secret,r){return crypto.createHmac('sha256',secret).update(['v1',r.type,r.requestId,String(r.ts),r.expectedBundleSha256].join('\n')).digest('hex');}
function responseMAC(secret,id,digest,r){
 return crypto.createHmac('sha256',secret).update([
  'v2-fixed-nginx-reload-reply',id,digest,r.status,
  String(r.productionChangeAuthorized),String(r.liveAttested)
 ].join('\n')).digest('hex');
}
function record(o,keys){return !!o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&
 Reflect.ownKeys(o).length===keys.length&&Reflect.ownKeys(o).every(k=>typeof k==='string'&&keys.includes(k)&&
 Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));}
function validRequest(r){return record(r,['type','requestId','ts','expectedBundleSha256','mac'])&&r.type===ACTION&&
 typeof r.requestId==='string'&&/^[a-f0-9]{32,64}$/.test(r.requestId)&&Number.isSafeInteger(r.ts)&&
 typeof r.expectedBundleSha256==='string'&&/^[a-f0-9]{64}$/.test(r.expectedBundleSha256)&&
 typeof r.mac==='string'&&/^[a-f0-9]{64}$/.test(r.mac);}
async function privateDir(directory){const st=await fs.lstat(directory);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
 (typeof process.getuid==='function'&&st.uid!==process.getuid()))throw Error('PRIVATE_OWNER_DIRECTORY_REQUIRED');}
function validateSocketPath(directory){return typeof directory==='string'&&path.isAbsolute(directory)&&path.normalize(directory)===directory&&
 directory!=='/'&&!directory.endsWith('/')&&Buffer.byteLength(path.join(directory,'nginx-reload.sock'))<100;}
function createAuthenticatedReloadBroker({directory,secret,driver,verifyCandidateBundle,verifyActiveRoute,now=Date.now,timeoutMs=12000}={}){
 if(!validateSocketPath(directory)||!secretOK(secret)||!driver||typeof driver.attest!=='function'||typeof driver.execute!=='function'||
 typeof verifyCandidateBundle!=='function'||typeof verifyActiveRoute!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>20000)
   throw Error('INVALID_RELOAD_BROKER_CONFIG');
 const socketPath=path.join(directory,'nginx-reload.sock');const replayDir=path.join(directory,'replay');
 const inFlightPath=path.join(directory,'nginx-operation-inflight');
 let server,identity,busy=false;
 async function reserve(id){
  try{const f=await fs.open(path.join(replayDir,id),'wx',0o600);try{await f.sync();}finally{await f.close();}
      // Persist the directory entry before executing a reload.
      const d=await fs.open(replayDir,'r');try{await d.sync();}finally{await d.close();}return true;
  }catch(e){if(e.code==='EEXIST')return false;throw e;}
 }
 async function persistDir(){const d=await fs.open(directory,'r');try{await d.sync();}finally{await d.close();}}
 async function beginFlight(){
  let f;try{
   f=await fs.open(inFlightPath,'wx',0o600);
   await f.writeFile('nginx-reload-in-flight\n');await f.sync();
   const st=await f.stat(); await f.close();f=null;await persistDir();
   return {dev:st.dev,ino:st.ino};
  }catch(e){if(f)await f.close();if(e.code==='EEXIST')return null;throw e;}
 }
 async function clearFlight(id){
  const st=await fs.lstat(inFlightPath);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.dev!==id.dev||st.ino!==id.ino)
   throw Error('IN_FLIGHT_MARKER_CHANGED');
  await fs.unlink(inFlightPath);await persistDir();
 }
 async function handle(req){
  if(!validRequest(req))return result('BLOCKED_INVALID_REQUEST');
  if(Math.abs(now()-req.ts)>45000)return result('BLOCKED_AUTH');
  const got=Buffer.from(req.mac,'hex'),want=Buffer.from(requestMAC(secret,req),'hex');
  if(!crypto.timingSafeEqual(got,want))return result('BLOCKED_AUTH');
  if(busy)return result('BLOCKED_BUSY');busy=true;
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),timeoutMs);
  async function bounded(fn){
   if(abort.signal.aborted)throw Error('TIMEOUT');
   return await new Promise((resolve,reject)=>{
    function onAbort(){reject(Error('TIMEOUT'));}
    abort.signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve().then(()=>fn(abort.signal)).then(v=>{abort.signal.removeEventListener('abort',onAbort);resolve(v);},
      e=>{abort.signal.removeEventListener('abort',onAbort);reject(e);});
   });
  }
  try{
   if(!await reserve(req.requestId))return result('BLOCKED_REPLAY');
   // Durable marker must exist BEFORE the first external operation. A process
   // crash, timeout, or reload uncertainty leaves it in place across restarts.
   const marker=await beginFlight();if(!marker)return result('BLOCKED_QUARANTINED');
   let reloadAttempted=false;
   try{
    if(await bounded(s=>verifyCandidateBundle(s,req.expectedBundleSha256))!==true){await clearFlight(marker);return result('BUNDLE_DIGEST_MISMATCH');}
    if(await bounded(s=>driver.attest(s))!==true){await clearFlight(marker);return result('BLOCKED_CONTAINER_IDENTITY');}
    if(await bounded(s=>driver.execute('nginx-test',s))!==0){await clearFlight(marker);return result('NGINX_VALIDATION_FAILED');}
    if(await bounded(s=>driver.attest(s))!==true){await clearFlight(marker);return result('BLOCKED_CONTAINER_IDENTITY');}
    reloadAttempted=true;
    if(await bounded(s=>driver.execute('nginx-reload',s))!==0)return result('NGINX_RELOAD_FAILED');
    if(await bounded(s=>driver.attest(s))!==true)return result('BLOCKED_CONTAINER_IDENTITY');
    if(await bounded(s=>verifyCandidateBundle(s,req.expectedBundleSha256))!==true)return result('HOST_OPERATION_INDETERMINATE');
    if(await bounded(s=>verifyActiveRoute(s,req.expectedBundleSha256))!==true)return result('ACTIVE_ROUTE_UNVERIFIED');
    await clearFlight(marker);
    return result('RELOAD_AND_VERIFICATION_REPORTED');
   }catch{return result('HOST_OPERATION_INDETERMINATE');}
  }catch{return result('HOST_OPERATION_INDETERMINATE');}

  finally{clearTimeout(timer);busy=false;}
 }
 function connection(s){let bytes=Buffer.alloc(0),finished=false,requestId=null,digest=null;
  const reply=r=>{if(finished)return;finished=true;
   const signed=requestId&&digest?{...r,requestId,expectedBundleSha256:digest,replyMac:responseMAC(secret,requestId,digest,r)}:r;
   s.end(JSON.stringify(signed)+'\n');};
  s.setTimeout(2000,()=>reply(result('BLOCKED_INVALID_REQUEST')));
  s.on('data',b=>{if(finished)return;bytes=Buffer.concat([bytes,b]);if(bytes.length>1024){reply(result('BLOCKED_INVALID_REQUEST'));return;}
   const i=bytes.indexOf(10);if(i<0)return;
   if(i!==bytes.length-1){reply(result('BLOCKED_INVALID_REQUEST'));return;}
   let req;try{req=JSON.parse(bytes.subarray(0,i).toString('utf8'));}catch{reply(result('BLOCKED_INVALID_REQUEST'));return;}
   if(typeof req?.requestId==='string'&&/^[a-f0-9]{32,64}$/.test(req.requestId))requestId=req.requestId;
   if(typeof req?.expectedBundleSha256==='string'&&/^[a-f0-9]{64}$/.test(req.expectedBundleSha256))digest=req.expectedBundleSha256;
   void handle(req).then(reply,()=>reply(result('HOST_OPERATION_INDETERMINATE')));
  });s.on('error',()=>{});
 }
 async function start(){
  if(server)throw Error('ALREADY_STARTED');await privateDir(directory);
  try{await fs.lstat(socketPath);throw Error('SOCKET_PATH_OCCUPIED');}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await fs.mkdir(replayDir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  await privateDir(replayDir);const s=net.createServer({allowHalfOpen:true},connection);
  try{await new Promise((ok,no)=>{s.once('error',no);s.listen(socketPath,()=>{s.removeListener('error',no);ok();});});
      await fs.chmod(socketPath,0o600);identity=await fs.lstat(socketPath);if(!identity.isSocket())throw Error('BAD_SOCKET');server=s;
  }catch(e){s.close();throw e;}
 }
 async function stop(){if(!server)return;const s=server;server=null;await new Promise(done=>s.close(done));
  try{const st=await fs.lstat(socketPath);if(st.isSocket()&&st.dev===identity.dev&&st.ino===identity.ino)await fs.unlink(socketPath);
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 return Object.freeze({start,stop,socketPath});
}
function createAuthenticatedReloadClient({socketPath,secret,now=Date.now,nonce=()=>crypto.randomBytes(16).toString('hex'),timeoutMs=14000}={}){
 if(typeof socketPath!=='string'||!path.isAbsolute(socketPath)||!socketPath.endsWith('/nginx-reload.sock')||
 !secretOK(secret)||typeof now!=='function'||typeof nonce!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<500||timeoutMs>20000)
  throw Error('INVALID_RELOAD_CLIENT_CONFIG');
 async function activate({expectedBundleSha256}={}){
  if(typeof expectedBundleSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedBundleSha256))return result('BLOCKED_INVALID_REQUEST');
  const req={type:ACTION,requestId:nonce(),ts:now(),expectedBundleSha256};
  if(!/^[a-f0-9]{32,64}$/.test(req.requestId)||!Number.isSafeInteger(req.ts))return result('BLOCKED_INVALID_REQUEST');
  req.mac=requestMAC(secret,req);
  return await new Promise(resolve=>{
   let done=false,bytes=Buffer.alloc(0);const s=net.createConnection({path:socketPath});
   function finish(code){if(done)return;done=true;s.destroy();resolve(result(code));}
   s.setTimeout(timeoutMs,()=>finish('BLOCKED_UNAVAILABLE'));
   s.on('error',()=>finish('BLOCKED_UNAVAILABLE'));
   s.on('end',()=>{if(!done)finish('BLOCKED_BAD_REPLY');});
   s.on('connect',()=>s.end(JSON.stringify(req)+'\n'));
   s.on('data',b=>{bytes=Buffer.concat([bytes,b]);if(bytes.length>512){finish('BLOCKED_BAD_REPLY');return;}
    const i=bytes.indexOf(10);if(i<0)return;
    if(i!==bytes.length-1){finish('BLOCKED_BAD_REPLY');return;}
    let r;try{r=JSON.parse(bytes.subarray(0,i).toString('utf8'));}catch{finish('BLOCKED_BAD_REPLY');return;}
    if(!record(r,['status','productionChangeAuthorized','liveAttested','requestId','expectedBundleSha256','replyMac'])||
       !STATUSES.has(r.status)||r.productionChangeAuthorized!==false||r.liveAttested!==false||
       r.requestId!==req.requestId||r.expectedBundleSha256!==req.expectedBundleSha256||typeof r.replyMac!=='string'||!/^[a-f0-9]{64}$/.test(r.replyMac)){
       finish('BLOCKED_BAD_REPLY');return;
    }
    const got=Buffer.from(r.replyMac,'hex'),want=Buffer.from(responseMAC(secret,req.requestId,req.expectedBundleSha256,r),'hex');
    finish(crypto.timingSafeEqual(got,want)?r.status:'BLOCKED_BAD_REPLY');
   });
  });
 }
 return Object.freeze({activate});
}
module.exports={ACTION,createAuthenticatedReloadBroker,createAuthenticatedReloadClient};
