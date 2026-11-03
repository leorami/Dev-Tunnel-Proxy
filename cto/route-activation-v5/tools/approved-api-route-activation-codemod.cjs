'use strict';
/**
 * CTO source-exact safe transformation for approved RC1 proxyConfigAPI.js.
 * No Git, owner files, Docker, or process invocation. Dry-run by default.
 * Apply ONLY to an authorized isolated NONLIVE source tree after checking SHA.
 */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const approvedBlobSha='2eb02328ab892add8a07648890c0047daafa3fc2';
function gitBlobSha(content){const b=Buffer.from(content,'utf8');return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');}
function replaceBetween(s,start,end,replacement){
 const i=s.indexOf(start);if(i<0||s.indexOf(start,i+start.length)>=0)throw Error('ANCHOR_START_NOT_UNIQUE:'+start);
 const j=s.indexOf(end,i+start.length);if(j<0)throw Error('ANCHOR_END_MISSING:'+end);
 return s.slice(0,i)+replacement.trimEnd()+'\n'+s.slice(j);
}
function replaceExactly(s,needle,replacement){
 const i=s.indexOf(needle);if(i<0||s.indexOf(needle,i+needle.length)>=0)throw Error('ANCHOR_NOT_UNIQUE:'+needle);
 return s.slice(0,i)+replacement+s.slice(i+needle.length);
}
const bootstrap=`const {createProductionRouteMutationService} = require('./production-route-mutation.cjs');
const {createAuthenticatedReloadClient} = require('./owner-authenticated-reload.cjs');
const {createExclusiveMutationLock} = require('./exclusive-route-mutation-lock.cjs');
let routeManager = null;
function getRouteMutationService(){
  if(routeManager) return routeManager;
  try {
    // All required values are operator-provisioned privately, never in Git.
    const socket=process.env.DEVPROXY_RELOAD_SOCKET;
    const secretFile=process.env.DEVPROXY_RELOAD_SECRET_FILE;
    let activation=null;
    if(socket||secretFile){
      if(typeof socket!=='string'||typeof secretFile!=='string'||!path.isAbsolute(secretFile))return null;
      const st=fs.lstatSync(secretFile);
      if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0)return null;
      const secret=fs.readFileSync(secretFile);
      activation=createAuthenticatedReloadClient({socketPath:socket,secret});
    }
    // Create only this private owner-data lock leaf; never modify /app source.
    const art=fs.lstatSync(ARTIFACTS_DIR);
    if(!art.isDirectory()||art.isSymbolicLink())return null;
    const lockDir=path.join(ARTIFACTS_DIR,'route-mutation-locks');
    try{fs.mkdirSync(lockDir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')return null;}
    const ld=fs.lstatSync(lockDir);
    if(!ld.isDirectory()||ld.isSymbolicLink()||(ld.mode&0o077)!==0||
       (typeof process.getuid==='function'&&ld.uid!==process.getuid()))return null;
    const lock=createExclusiveMutationLock({directory:lockDir});
    const generateBundle=()=>new Promise((resolve,reject)=>{
      require('node:child_process').execFile(process.execPath,[path.join(__dirname,'generateAppsBundle.js')],
        {cwd:ROOT,shell:false,timeout:12000,maxBuffer:4096},err=>err?reject(Error('BUNDLE_FAILED')):resolve());
    });
    routeManager=createProductionRouteMutationService({root:ROOT,activation,generateBundle,lock,allowConfigEdit:false});
    return routeManager;
  } catch { return null; }
}
`;
const safeConfig=`function safeConfigPath(file){
  if(typeof file!=='string'||file.includes('..'))return null;
  const m=/^(?:(apps|overrides|config)\\/)?([a-zA-Z0-9_-]{1,80}\\.conf|default\\.production\\.conf)$/.exec(file);
  if(!m)return null;
  const root=m[1]==='overrides'?OVERRIDES_DIR:m[1]==='config'?path.join(ROOT,'config'):APPS_DIR;
  if(m[2]==='default.production.conf'&&m[1]!=='config')return null;
  const resolved=path.join(root,m[2]);
  try{const st=fs.lstatSync(resolved);return st.isFile()&&!st.isSymbolicLink()&&st.nlink===1?resolved:null;}
  catch{return null;}
}
`;
const install=`async function installAppConfigFile(name, content){
  const manager=getRouteMutationService();
  if(!manager)throw {status:503,code:'ROUTE_ACTIVATION_UNAVAILABLE'};
  const r=await manager.install(name,content);
  if(!r.ok)throw {status:r.httpStatus,code:r.code};
  const appName=name.replace(/\\.conf$/i,'');
  return {filename:appName+'.conf',hardenWarning:null};
}
// Retired: non-transactional Docker CLI reload had a partial-write failure.
// Any remaining callers fail closed rather than regaining host Docker powers.
function nginxTestAndMaybeReload(){return {ok:false,stderr:'TRANSACTIONAL_ROUTE_ACTIVATION_REQUIRED'};}
`;
const regen=`    // POST /api/apps/regenerate. Preserve generation-only parity without
    // claiming nginx worker activation; reload:true must use the host broker.
    if (req.method === 'POST' && u.pathname === apiPath('apps/regenerate')){
      const body=await parseBody(req);
      const manager=getRouteMutationService();
      if(!manager)return send(res,503,{ok:false,error:'ROUTE_ACTIVATION_UNAVAILABLE'});
      const r=await manager.regenerate({reload:Boolean(body&&body.reload)});
      return send(res,r.httpStatus,{ok:r.ok,reloaded:r.reloaded===true,error:r.ok?undefined:r.code});
    }
`;
const promote=`    // Promote app route only via scoped filesystem transaction and host verification.
    if (req.method === 'POST' && u.pathname === apiPath('overrides/promote')){
      const body=await parseBody(req);
      const manager=getRouteMutationService();
      if(!manager)return send(res,503,{ok:false,error:'ROUTE_ACTIVATION_UNAVAILABLE'});
      const r=await manager.promote(body&&body.filename);
      return send(res,r.httpStatus,{ok:r.ok,error:r.ok?undefined:r.code,
        promoted:r.ok?body.filename:undefined});
    }
`;
const configGet=`    // GET /api/config/:file - only preexisting, bounded owner route files.
    if (req.method === 'GET' && u.pathname.startsWith(apiPath('config/'))){
      const p=safeConfigPath(u.pathname.slice(apiPath('config/').length));
      if(!p)return send(res,400,{error:'Invalid file'});
      try{return send(res,200,{file:path.relative(ROOT,p),content:fs.readFileSync(p,'utf8')});}
      catch{return send(res,404,{error:'File unavailable'});}
    }
`;
const edit=`    // POST /api/config/:file - bounded route data only, never application code.
    if (req.method === 'POST' && u.pathname.startsWith(apiPath('config/'))){
      const p=safeConfigPath(u.pathname.slice(apiPath('config/').length));
      if(!p)return send(res,400,{ok:false,error:'BLOCKED_UNSAFE_CONFIG_ROUTE'});
      const body=await parseBody(req);
      if(!body||typeof body.content!=='string')return send(res,400,{ok:false,error:'INVALID_CONTENT'});
      const manager=getRouteMutationService();
      if(!manager)return send(res,503,{ok:false,error:'ROUTE_ACTIVATION_UNAVAILABLE'});
      const rel=path.relative(ROOT,p),name=path.basename(p);
      const r=rel.startsWith('apps'+path.sep)?await manager.editApp(name,body.content):
        rel.startsWith('overrides'+path.sep)?await manager.editOverride(name,body.content):
        await manager.editConfig(name,body.content);
      return send(res,r.httpStatus,{ok:r.ok,error:r.ok?undefined:r.code});
    }
`;
const rename=`    // POST /api/rename-route intentionally held until source-exact atomic rename.
    // The old implementation wrote before a Docker CLI reload and was unsafe.
    if (req.method === 'POST' && u.pathname === apiPath('rename-route')){
      return send(res,503,{ok:false,error:'transactional_rename_not_integrated'});
    }
`;
function transformApprovedApi(source,{verifyBlob=true}={}){
 if(typeof source!=='string')throw Error('INVALID_API_SOURCE');
 if(verifyBlob&&gitBlobSha(source)!==approvedBlobSha)throw Error('BASELINE_SHA_MISMATCH');
 let s=source;
 s=replaceExactly(s,"const ROUTE_PROMOTIONS_FILE = path.join(ARTIFACTS_DIR, 'route-promotions.json');",
  "const ROUTE_PROMOTIONS_FILE = path.join(ARTIFACTS_DIR, 'route-promotions.json');\n"+bootstrap);
 s=replaceBetween(s,'function safeConfigPath(file){','\nfunction normalizeBasePath(',safeConfig);
 s=replaceBetween(s,'async function installAppConfigFile(name, content){','\nfunction loadResolutions(){',install);
 s=replaceBetween(s,'    // POST /api/apps/regenerate','    // POST /api/apps/cleanup',regen);
 s=replaceBetween(s,'    // Promote app config into overrides','    // POST /api/apps/create-route',promote);
 s=replaceBetween(s,'    // GET /api/config/:file','    // POST /api/config/:file  { content }',configGet);
 s=replaceBetween(s,'    // POST /api/config/:file  { content }','    // POST /api/resolve-conflict',edit);
 s=replaceBetween(s,'    // POST /api/rename-route { oldRoute, newRoute, configFile }','    // ======== AI Assistant (optional) ========',rename);
 s=replaceExactly(s,"        const dryRun = (body && typeof body.dryRun === 'boolean') ? body.dryRun : true;",
  "        const dryRun = (body && typeof body.dryRun === 'boolean') ? body.dryRun : true;\n"+
  "        if(!dryRun)return send(res,503,{ok:false,error:'transactional_cleanup_not_integrated'});");
 return s;
}
if(require.main===module){
 const file=process.argv[2];const explicit=process.argv[3]==='--preview-nonlive';
 if(typeof file!=='string'||!explicit||!path.isAbsolute(file)){
  process.stderr.write('Usage: node tools/approved-api-route-activation-codemod.cjs ABSOLUTE_NONLIVE_SOURCE --preview-nonlive\\n');process.exitCode=2;
 }else{
  const src=fs.readFileSync(file,'utf8'),next=transformApprovedApi(src);
  // Never overwrite owner source or make a Git commit. This creates a preview.
  const preview=file+'.cto-preview';fs.writeFileSync(preview,next,{flag:'wx',mode:0o600});
  process.stdout.write('NONLIVE_PREVIEW_WRITTEN_NO_GIT_NO_DOCKER\\n');
 }
}
module.exports={approvedBlobSha,gitBlobSha,transformApprovedApi};
