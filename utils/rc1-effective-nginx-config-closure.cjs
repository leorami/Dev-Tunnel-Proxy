'use strict';
/**
 * Fail-closed STATIC Nginx effective-config include closure preflight.
 *
 * Approved product nginx.production.conf loads conf.d/*.conf, and its
 * default.production.conf loads sites-enabled/*.conf. Binding only the three
 * v6 candidate files does NOT bind arbitrary additional glob-matched .conf or
 * nested include directives. This preflight detects those bypasses BEFORE a
 * host-only worker is permitted to consider nginx validation/reload.
 *
 * NONLIVE: an untrusted callback is NOT proof of actual Mac/Docker mounts,
 * image contents or owner authorization. A safe return is only source review,
 * never production readiness or permission to invoke Docker.
 */
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {TextDecoder}=require('node:util');
const {createCandidateManifest}=require('./rc1-route-candidate-manifest.cjs');
const MIME='/etc/nginx/mime.types';
const CONF='/etc/nginx/conf.d/*.conf';
const ROUTES='/etc/nginx/conf.d/sites-enabled/*.conf';
const STATIC=Object.freeze({
 main:Object.freeze([MIME,CONF]),
 default:Object.freeze([ROUTES]),
 bundle:Object.freeze([])
});
const FILES=Object.freeze({
 main:'config/nginx.production.conf',
 default:'config/default.production.conf',
 bundle:'build/sites-enabled/apps.generated.conf'
});
const MAX_SIZE=2*1024*1024;
const failed=(code)=>Object.freeze({code,productionChangeAuthorized:false,deployed:false,
 actualHostAttested:false,ownerUatApproved:false});
function parseIncludeDirectives(input){
 if(typeof input!=='string'||input.length>MAX_SIZE||input.includes('\0'))throw Error('UNSUPPORTED_CONFIG_BYTES');
 const includes=[];let word='',words=[],quote=null,inComment=false,esc=false,dirEsc=false;
 function finish(){if(word.length){words.push(word);word='';}}
 function complete(){
  finish();
  if(words.length&&words[0]==='include'){
   if(words.length!==2)throw Error('INVALID_INCLUDE_DIRECTIVE');
   includes.push(words[1]);
  }
  words=[];dirEsc=false;
 }
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(inComment){if(ch==='\n'||ch==='\r')inComment=false;continue;}
  if(esc){word+=ch;esc=false;continue;}
  if(ch==='\\'){
   if(quote===null&&words.length===0)dirEsc=true;
   esc=true;continue;
  }
  if(quote!==null){if(ch===quote)quote=null;else word+=ch;continue;}
  if(ch==='"'||ch==="'"){quote=ch;continue;}
  if(ch==='#'){inComment=true;continue;}
  if(/\s/.test(ch)){finish();continue;}
  if(ch===';'||ch==='{'||ch==='}'){
   if(dirEsc)throw Error('UNSUPPORTED_DIRECTIVE_ESCAPE');
   if(ch===';')complete();
   else{
    finish();if(words[0]==='include')throw Error('INVALID_INCLUDE_DIRECTIVE');
    words=[];dirEsc=false;
   }
   continue;
  }
  word+=ch;
 }
 if(esc||quote!==null)throw Error('UNTERMINATED_CONFIG_QUOTE');
 if(word.length||words.length)throw Error('UNTERMINATED_DIRECTIVE');
 return includes;
}
async function safeFile(file){
 const before=await fs.lstat(file,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size<1n||before.size>BigInt(MAX_SIZE))
  throw Error('UNSAFE_CLOSURE_FILE');
 const fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const a=await fd.stat({bigint:true});
  if(a.dev!==before.dev||a.ino!==before.ino||a.nlink!==1n||a.size!==before.size)
   throw Error('UNSAFE_CLOSURE_FILE');
  const bytes=await fd.readFile();
  const b=await fd.stat({bigint:true});
  const after=await fs.lstat(file,{bigint:true});
  if(BigInt(bytes.length)!==a.size||a.ino!==b.ino||a.dev!==b.dev||a.mtimeNs!==b.mtimeNs||
     a.ctimeNs!==b.ctimeNs||a.ino!==after.ino||a.dev!==after.dev||a.size!==after.size)
   throw Error('CLOSURE_FILE_CHANGED_DURING_READ');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{await fd.close();}
}
async function scanSites(approvedRoot){
 const root=path.join(approvedRoot,'build/sites-enabled');
 const st=await fs.lstat(root);
 if(!st.isDirectory()||st.isSymbolicLink()||await fs.realpath(root)!==root)
  throw Error('UNBOUND_NGINX_CONFIG_FILE');
 const entries=await fs.readdir(root,{withFileTypes:true});
 if(entries.length!==1||entries[0].name!=='apps.generated.conf'||!entries[0].isFile())
  throw Error('UNBOUND_NGINX_CONFIG_FILE');
}
function compareIncludes(actual,allowed){
 if(actual.length!==allowed.length){
  if(actual.some(p=>!allowed.includes(p)))return 'UNBOUND_INCLUDE_DIRECTIVE';
  if(actual.length>allowed.length)return 'DUPLICATE_NGINX_INCLUDE';
  return 'EXPECTED_NGINX_INCLUDE_MISSING';
 }
 const a=[...actual].sort(),b=[...allowed].sort();
 if(a.some((v,i)=>v!==b[i]))return 'UNBOUND_INCLUDE_DIRECTIVE';
 return null;
}
function hostViewIsExact(view){
 if(!view||typeof view!=='object'||Array.isArray(view)||Object.getPrototypeOf(view)!==Object.prototype||
    Reflect.ownKeys(view).length!==2||!Object.hasOwn(view,'confD')||!Object.hasOwn(view,'siteEnabled'))return false;
 if(!Array.isArray(view.confD)||!Array.isArray(view.siteEnabled))return false;
 if(view.confD.some(x=>typeof x!=='string')||view.siteEnabled.some(x=>typeof x!=='string'))return false;
 return true;
}
async function checkEffectiveNginxConfigClosure({approvedRoot,hostView}={}){
 try{
  if(typeof approvedRoot!=='string'||!path.isAbsolute(approvedRoot)||path.normalize(approvedRoot)!==approvedRoot||
     approvedRoot==='/'||approvedRoot.endsWith(path.sep)||
     (hostView!==undefined&&typeof hostView!=='function'))return failed('INVALID_CLOSURE_CONFIGURATION');
  const start=await createCandidateManifest({approvedRoot});
  await scanSites(approvedRoot);
  for(const[k,rel]of Object.entries(FILES)){
   const data=await safeFile(path.join(approvedRoot,rel));
   const found=parseIncludeDirectives(data);
   const problem=compareIncludes(found,STATIC[k]);
   if(problem)return failed(problem);
  }
  let view=null;
  if(hostView!==undefined){
   try{view=await hostView(Object.freeze({expectedConfD:Object.freeze(['default.conf']),
    expectedSites:Object.freeze(['apps.generated.conf'])}));}
   catch{return failed('RUNTIME_INCLUDE_CLOSURE_UNATTESTED');}
  }
  await scanSites(approvedRoot);
  const end=await createCandidateManifest({approvedRoot});
  if(start.candidateSha256!==end.candidateSha256)return failed('CONFIG_SET_CHANGED_DURING_CLOSURE');
  if(hostView===undefined)return failed('STATIC_CONFIG_CLOSURE_VERIFIED');
  if(view===null||!hostViewIsExact(view))return failed('RUNTIME_INCLUDE_CLOSURE_UNATTESTED');
  if(view.confD.length!==1||view.confD[0]!=='default.conf'||
     view.siteEnabled.length!==1||view.siteEnabled[0]!=='apps.generated.conf')
   return failed('RUNTIME_UNBOUND_NGINX_CONFIG');
  return failed('HOST_CALLBACK_CONFIG_CLOSURE_REPORTED');
 }catch(e){
  if(e?.message==='UNBOUND_NGINX_CONFIG_FILE')return failed('UNBOUND_NGINX_CONFIG_FILE');
  if(e?.message==='UNSUPPORTED_DIRECTIVE_ESCAPE'||e?.message==='UNTERMINATED_DIRECTIVE'||
     e?.message==='UNTERMINATED_CONFIG_QUOTE'||e?.message==='INVALID_INCLUDE_DIRECTIVE')
   return failed('UNBOUND_INCLUDE_DIRECTIVE');
  return failed('CONFIG_SET_UNVERIFIABLE');
 }
}
module.exports={parseIncludeDirectives,checkEffectiveNginxConfigClosure};
