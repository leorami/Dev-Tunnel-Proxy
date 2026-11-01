/**
 * Shared app-centric local MCP gateway (original implementation: Wizardmaker PRs #375/#376). No shell, arbitrary file, arbitrary HTTP,
 * grant minting, or app discovery from GPT-provided paths. Node 22, no deps.
 *
 * This is a LOCAL adapter. Cloud ChatGPT needs a separately configured Secure
 * MCP Tunnel and appropriately authenticated custom MCP connection.
 */
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const VERSION='2026-07-28';
const SERVER_INFO=Object.freeze({name:'dev-tunnel-proxy-app-mcp',version:'0.1.0'});
const serverMeta=()=>({'io.modelcontextprotocol/serverInfo':SERVER_INFO});
const MAX_BODY=16384;
const MAX_RESULT=8192;
const ID=/^[a-z][a-z0-9._-]{0,63}$/;
const isObject=x=>x!==null && typeof x==='object' && !Array.isArray(x)
  && (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
function exactObject(value,required,optional=[]){
  if(!isObject(value))return false;
  const keys=Reflect.ownKeys(value);
  return keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k) && Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))
    &&required.every(k=>Object.hasOwn(value,k));
}
function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(isObject(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function checkArgs(value,schema){
  if(!schema||schema.type!=='object'||schema.additionalProperties!==false||!isObject(schema.properties)||!Array.isArray(schema.required))return false;
  if(!exactObject(value,schema.required,Object.keys(schema.properties).filter(k=>!schema.required.includes(k))))return false;
  for(const [name,v] of Object.entries(value)){
    const rule=schema.properties[name];
    if(!rule)return false;
    if(rule.type==='string'){
      if(typeof v!=='string'||(rule.maxLength!==undefined&&v.length>rule.maxLength)||(rule.minLength!==undefined&&v.length<rule.minLength))return false;
      if(rule.enum&&!rule.enum.includes(v))return false;
    }else if(rule.type==='integer'){
      if(!Number.isSafeInteger(v)||(rule.minimum!==undefined&&v<rule.minimum)||(rule.maximum!==undefined&&v>rule.maximum))return false;
    }else if(rule.type==='boolean'){
      if(typeof v!=='boolean')return false;
    }else return false;
  }
  return true;
}
const emptySchema=Object.freeze({type:'object',additionalProperties:false,required:[],properties:{}});
function digest(text){return createHash('sha256').update(text).digest();}
function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;return timingSafeEqual(digest(a),digest(b));}
function toolOutput(value,isError=false){
  const encoded=JSON.stringify(value);
  if(typeof encoded!=='string'||Buffer.byteLength(encoded)>MAX_RESULT)return {resultType:'complete',content:[{type:'text',text:'{"status":"RESPONSE_TOO_LARGE"}'}],isError:true};
  return {resultType:'complete',content:[{type:'text',text:encoded}],isError};
}
const tools=Object.freeze([
  {name:'app.list',description:'List registered local apps and explicit commands. Never executes a command.',inputSchema:emptySchema},
  {name:'app.status',description:'Read status of a registered local app only.',inputSchema:{type:'object',additionalProperties:false,required:['app'],properties:{app:{type:'string'}}}},
  {name:'app.command',description:'Execute only a registered, typed app command. Writes and destructive commands require a one-use local human approval, which is NOT mintable over MCP.',inputSchema:{type:'object',additionalProperties:false,required:['app','command','args'],properties:{app:{type:'string'},command:{type:'string'},args:{type:'object'},approval:{type:'string'}}}},
]);

export function createDevProxy({token,apps,clock=()=>Date.now(),maxCommandMs=15000}={}){
  if(typeof token!=='string'||token.length<32||!isObject(apps)||typeof clock!=='function')throw Error('LOCAL_PROXY_CONFIG_REQUIRED');
  if(!Number.isSafeInteger(maxCommandMs)||maxCommandMs<100||maxCommandMs>60000)throw Error('BAD_TIMEOUT');
  const registry=new Map(),approvals=new Map();
  for(const [id,app] of Object.entries(apps)){
    if(!ID.test(id)||!isObject(app)||typeof app.status!=='function'||!isObject(app.commands))throw Error('BAD_APP_REGISTRATION');
    const commands=new Map();
    for(const [name,cmd] of Object.entries(app.commands)){
      if(!ID.test(name)||!isObject(cmd)||typeof cmd.run!=='function'||!['read','write','destructive'].includes(cmd.risk))throw Error('BAD_COMMAND_REGISTRATION');
      if(!isObject(cmd.inputSchema)||cmd.inputSchema.type!=='object'||cmd.inputSchema.additionalProperties!==false||!Array.isArray(cmd.inputSchema.required)||!isObject(cmd.inputSchema.properties))throw Error('BAD_COMMAND_SCHEMA');
      commands.set(name,cmd);
    }
    registry.set(id,{label:typeof app.label==='string'?app.label:id,status:app.status,commands});
  }
  let server;
  const getCommand=(app,command)=> registry.get(app)?.commands.get(command);
  function issueApproval({app,command,args,ttlMs=60000}){
    const cmd=getCommand(app,command);
    if(!cmd||cmd.risk==='read'||!checkArgs(args,cmd.inputSchema)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>120000)throw Error('APPROVAL_REQUEST_INVALID');
    const key=randomBytes(32).toString('hex');
    const expiresAt=clock()+ttlMs;
    approvals.set(key,{app,command,hash:stable(args),expiresAt});
    return Object.freeze({token:key,expiresAt});
  }
  function permit(approval,app,command,args){
    const entry=typeof approval==='string'?approvals.get(approval):null;
    if(!entry||entry.app!==app||entry.command!==command||entry.hash!==stable(args))return false;
    approvals.delete(approval);
    return clock()<=entry.expiresAt;
  }
  async function dispatch(name,args){
    if(name==='app.list'){
      if(!exactObject(args,[]))return toolOutput({status:'ARGUMENTS_DENIED'},true);
      return toolOutput({apps:[...registry].map(([id,app])=>({id,label:app.label,commands:[...app.commands].map(([name,cmd])=>({name,risk:cmd.risk,description:cmd.description||''}))}))});
    }
    if(name==='app.status'){
      if(!exactObject(args,['app'])||!registry.has(args.app))return toolOutput({status:'UNKNOWN_APP'},true);
      const controller=new AbortController();
      let onAbort;
      const timedOut=new Promise(resolve=>{onAbort=()=>resolve({timeout:true});controller.signal.addEventListener('abort',onAbort,{once:true});});
      const timeout=setTimeout(()=>controller.abort(),maxCommandMs);
      try{
        const outcome=await Promise.race([Promise.resolve().then(()=>registry.get(args.app).status({signal:controller.signal})).then(value=>({value})),timedOut]);
        return outcome.timeout ? toolOutput({status:'LOCAL_APP_STATUS_TIMEOUT'},true) : toolOutput(outcome.value);
      }catch{return toolOutput({status:'LOCAL_APP_UNAVAILABLE'},true);}
      finally{clearTimeout(timeout);controller.signal.removeEventListener('abort',onAbort);}
    }
    if(name==='app.command'){
      if(!exactObject(args,['app','command','args'],['approval'])||typeof args.app!=='string'||typeof args.command!=='string')return toolOutput({status:'ARGUMENTS_DENIED'},true);
      const cmd=getCommand(args.app,args.command);
      if(!cmd)return toolOutput({status:'COMMAND_NOT_REGISTERED'},true);
      if(!checkArgs(args.args,cmd.inputSchema))return toolOutput({status:'COMMAND_ARGUMENTS_DENIED'},true);
      if(cmd.risk!=='read'&&!permit(args.approval,args.app,args.command,args.args))return toolOutput({status:'LOCAL_APPROVAL_REQUIRED'},true);
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),maxCommandMs);
      let stop;
      const aborted=new Promise(resolve=>{stop=()=>resolve({timeout:true});controller.signal.addEventListener('abort',stop,{once:true});});
      try{
        const response=await Promise.race([Promise.resolve().then(()=>cmd.run(structuredClone(args.args),{signal:controller.signal})).then(value=>({value})),aborted]);
        if(response.timeout)return toolOutput({status:cmd.risk==='read'?'LOCAL_READ_TIMED_OUT':'APP_OUTCOME_UNKNOWN_DO_NOT_RETRY'},true);
        return toolOutput(response.value);
      }catch{return toolOutput({status:'APP_COMMAND_FAILED'},true);}
      finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);}
    }
    return toolOutput({status:'UNKNOWN_TOOL'},true);
  }
  function failure(id,code,message,data){
    const error={code,message};
    if(data)error.data=data;
    return {jsonrpc:'2.0',id:typeof id==='string'||Number.isSafeInteger(id)?id:null,error};
  }
  // MCP 2026-07-28 has no initialize handshake. Every request is stateless;
  // explicit metadata and mirrored headers are required, including for tools.
  function validateModernRequest(message,headers){
    if(!exactObject(message,['jsonrpc','method'],['id','params'])||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {status:400,body:failure(null,-32600,'Invalid Request')};
    const params=message.params;
    const metadata=params?._meta;
    const version=metadata?.['io.modelcontextprotocol/protocolVersion'];
    if(typeof headers['mcp-protocol-version']!=='string'||typeof headers['mcp-method']!=='string'||headers['mcp-method']!==message.method||headers['mcp-protocol-version']!==version){
      return {status:400,body:failure(message.id,-32020,'HeaderMismatch')};
    }
    if(version!==VERSION)return {status:400,body:failure(message.id,-32000,'UnsupportedProtocolVersionError',{supported:[VERSION]})};
    if(!isObject(metadata)||!isObject(metadata['io.modelcontextprotocol/clientCapabilities']))return {status:400,body:failure(message.id,-32602,'MissingRequiredClientCapabilityError')};
    if(message.method==='tools/call'){
      const name=params?.name;
      const rawHeader=headers['mcp-name'];
      if(typeof name!=='string'||typeof rawHeader!=='string')return {status:400,body:failure(message.id,-32020,'HeaderMismatch')};
      let headerName=rawHeader;
      if(rawHeader.startsWith('=?base64?')&&rawHeader.endsWith('?=')){
        const encoded=rawHeader.slice('=?base64?'.length,-2);
        if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return {status:400,body:failure(message.id,-32020,'HeaderMismatch')};
        headerName=Buffer.from(encoded,'base64').toString('utf8');
      }
      if(headerName!==name)return {status:400,body:failure(message.id,-32020,'HeaderMismatch')};
    }
    return null;
  }
  async function handle(message){
    if(!['server/discover','tools/list','tools/call'].includes(message.method))return failure(message.id,-32601,'Method not found');
    if(!Object.hasOwn(message,'id'))return null;
    const id=message.id;
    if(!(typeof id==='string'||Number.isSafeInteger(id)))return failure(null,-32600,'Invalid Request');
    if(message.method==='server/discover')return {jsonrpc:'2.0',id,result:{resultType:'complete',supportedVersions:[VERSION],capabilities:{tools:{listChanged:false}},_meta:serverMeta()}};
    if(message.method==='tools/list')return {jsonrpc:'2.0',id,result:{resultType:'complete',tools,_meta:serverMeta()}};
    if(message.method==='tools/call'){
      const p=message.params;
      if(!exactObject(p,['name','_meta'],['arguments'])||typeof p.name!=='string')return failure(id,-32602,'Invalid params');
      return {jsonrpc:'2.0',id,result:{...await dispatch(p.name,p.arguments??{}),_meta:serverMeta()}};
    }
    return failure(id,-32601,'Method not found');
  }
  async function start({port=0}={}){
    if(server)throw Error('ALREADY_LISTENING');
    if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('BAD_PORT');
    server=createServer(async(req,res)=>{
      const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
      const allowedHost=new Set([`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`]);
      if(!allowedHost.has(req.headers.host)||req.headers.origin&&!['http://'+`127.0.0.1:${server.address().port}`,'http://'+`localhost:${server.address().port}`].includes(req.headers.origin)){send(403,{error:'LOCAL_ORIGIN_DENIED'});return;}
      if(req.url!=='/mcp'){send(404,{error:'NOT_FOUND'});return;}
      if(req.method!=='POST'){send(405,{error:'METHOD_NOT_ALLOWED'});return;}
      const supplied=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
      if(!sameSecret(supplied,token)){send(401,{error:'AUTH_REQUIRED'});return;}
      if(req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()!=='application/json'){send(415,{error:'UNSUPPORTED_MEDIA_TYPE'});return;}
      let body='',tooLarge=false;
      try{for await(const chunk of req){body+=chunk.toString('utf8');if(Buffer.byteLength(body)>MAX_BODY){tooLarge=true;break;}}}
      catch{send(400,{error:'BAD_JSON'});return;}
      if(tooLarge){req.resume();send(413,{error:'REQUEST_TOO_LARGE'});return;}
      let parsed;
      try{parsed=JSON.parse(body);}catch{send(400,{error:'BAD_JSON'});return;}
      try{
        const problem=validateModernRequest(parsed,req.headers);
        if(problem){send(problem.status,problem.body);return;}
        const result=await handle(parsed);
        if(result===null){res.writeHead(202,{'cache-control':'no-store'});res.end();return;}
        send(result?.error?.code===-32601?404:200,result);
      }catch{send(500,{error:'MCP_INTERNAL_ERROR'});}
    });
    server.requestTimeout=5000;
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
    catch(e){server=undefined;throw e;}
    const active=server;
    return Object.freeze({port:active.address().port,close:()=>new Promise(resolve=>{active.closeAllConnections?.();active.close(()=>{server=undefined;approvals.clear();resolve();});})});
  }
  return Object.freeze({start,issueApproval});
}

export function createLoopbackHealthApp({label='Local app',port}={}){
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('PINNED_APP_PORT_REQUIRED');
  const status=async()=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2000);
    try{
      const response=await fetch(`http://127.0.0.1:${port}/`,{method:'GET',redirect:'manual',signal:controller.signal});
      void response.body?.cancel?.().catch(()=>{});
      return {online:response.status>=200&&response.status<400,httpStatus:response.status,host:'loopback',port};
    }catch{return {online:false,host:'loopback',port};}
    finally{clearTimeout(timer);}
  };
  return {label,status,commands:{'health.check':{risk:'read',description:'Check the fixed local application endpoint',inputSchema:emptySchema,run:status}}};
}
