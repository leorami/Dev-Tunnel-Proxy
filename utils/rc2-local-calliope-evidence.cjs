'use strict';
/**
 * Local, bounded, read-only evidence-based fallback for Calliope's chat.
 * It is retrieval, NOT an LLM. It does not inspect env, credentials, KB,
 * private owner source, sockets, Docker, or launch host actions.
 * The web layer MUST authenticate the owner and apply trusted Origin rules.
 */
const fs=require('node:fs');
const path=require('node:path');
const DOCS=Object.freeze([
 'README.md',
 'docs/ARCHITECTURE.md',
 'docs/API.md',
 'docs/CALLIOPE_ASSISTANT.md',
 'docs/CONFIGURATION.md',
 'docs/PRODUCTION_MODE.md',
 'docs/USER_GUIDE.md',
 'docs/TROUBLESHOOTING_NEXTJS_BASEPATH.md'
]);
const STOP=new Set('how do does did can what which where when the a an i we is are to this that who why for about with from as it in on and or have has of by me my our them you your please help tell explain something some should would could'.split(' '));
const FLAGS=Object.freeze({usedAI:false,healingPerformed:false,liveAttested:false,executionAuthorized:false,
 productionChangeAuthorized:false,networkTransferAuthorized:false});
const MAX_FILE=256*1024;
const MAX_DOCS=3;
function invalid(code){return Object.freeze({ok:false,mode:'local_documentation',code,answer:'Local documentation lookup unavailable.',sources:Object.freeze([]),...FLAGS});}
function validateLocalQuestion(query){
 if(typeof query!=='string'||!query.trim()||Buffer.byteLength(query,'utf8')>512||/[\u0000-\u001f\u007f]/.test(query))
  return Object.freeze({ok:false,code:'INVALID_LOCAL_QUERY'});
 return Object.freeze({ok:true,query:query.trim()});
}
function terms(s){
 const words=s.toLowerCase().match(/[a-z0-9]{2,30}/g)||[];
 const normalize=w=>({routes:'route',routing:'route',loops:'loop',fixes:'fix',fixing:'fix',redirects:'redirect',assets:'asset',sessions:'session',applications:'application',configuration:'config',configurations:'config',healing:'heal',heals:'heal'}[w]||w);
 return new Set(words.map(normalize).filter(w=>w.length>=3&&!STOP.has(w)));
}
function safeFile(root,relative){
 const segments=relative.split('/');
 let dir=root;
 try{
  const base=fs.lstatSync(root);if(!base.isDirectory()||base.isSymbolicLink())return null;
  for(const seg of segments.slice(0,-1)){
   dir=path.join(dir,seg);
   const s=fs.lstatSync(dir);
   if(!s.isDirectory()||s.isSymbolicLink())return null;
  }
  const name=path.join(dir,segments.at(-1));
  const ls=fs.lstatSync(name);
  if(!ls.isFile()||ls.isSymbolicLink()||ls.nlink!==1||ls.size===0||ls.size>MAX_FILE||(ls.mode&0o022)!==0)return null;
  const flags=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK;
  const fd=fs.openSync(name,flags);
  try{
   const s=fs.fstatSync(fd);
   if(!s.isFile()||s.nlink!==1||s.size!==ls.size||s.ino!==ls.ino||s.dev!==ls.dev||(s.mode&0o022)!==0)return null;
   const contents=fs.readFileSync(fd,{encoding:'utf8'});
   const after=fs.fstatSync(fd);
   const later=fs.lstatSync(name);
   if(!after.isFile()||after.size!==s.size||after.mtimeMs!==s.mtimeMs||after.ctimeMs!==s.ctimeMs||later.ino!==s.ino||later.dev!==s.dev||later.size!==s.size)return null;
   return contents;
  }finally{fs.closeSync(fd);}
 }catch{return null;}
}
function segmentsFromDoc(markdown){
 // Search paragraphs rather than copying entire documentation; no source writing.
 return markdown.replace(/\r/g,'').split(/\n\s*\n/g).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length>20&&x.length<5000).slice(0,160);
}
function score(text,queryTokens){
 const documentTerms=terms(text);let hits=0;
 for(const t of queryTokens){if(documentTerms.has(t))hits++;}
 return hits;
}
function answerFromLocalProjectDocs({root,query,maxDocs=3}={}){
 const valid=validateLocalQuestion(query);if(!valid.ok)return invalid(valid.code);
 if(typeof root!=='string'||!path.isAbsolute(root)||!Number.isSafeInteger(maxDocs)||maxDocs<1||maxDocs>MAX_DOCS)
  return invalid('INVALID_LOCAL_LOOKUP_OPTIONS');
 const t=terms(valid.query);
 if(t.size===0)return invalid('LOCAL_QUERY_TOO_VAGUE');
 let readable=0;const findings=[];
 for(const rel of DOCS){
  const markdown=safeFile(root,rel);
  if(markdown===null)continue;
  readable++;
  for(const paragraph of segmentsFromDoc(markdown)){
   const hits=score(paragraph,t);
   if(hits===0)continue;
   findings.push({rel,text:paragraph,hits});
  }
 }
 if(!readable)return invalid('LOCAL_DOCUMENTATION_UNAVAILABLE');
 findings.sort((a,b)=>b.hits-a.hits||DOCS.indexOf(a.rel)-DOCS.indexOf(b.rel)||a.text.localeCompare(b.text));
 const selected=[],seen=new Set();
 for(const item of findings){
  if(seen.has(item.rel))continue;
  selected.push(item);seen.add(item.rel);
  if(selected.length>=maxDocs)break;
 }
 const answer=selected.length
  ?'Local project documentation excerpts (no AI model, network access, or repair executed):\n\n'+selected.map((x,i)=>`${i+1}. ${x.rel}: ${x.text.slice(0,330)}`).join('\n\n')
  :'I could not find a grounded answer in the available local project documentation. No diagnostic or repair was run.';
 return Object.freeze({ok:true,mode:'local_documentation',answer,sources:Object.freeze(selected.map(x=>x.rel)),...FLAGS});
}
/**
 * Bounded request adapter for one protected POST. The parent API authenticates
 * the owner and checks Origin BEFORE invoking this method. No body-supplied
 * URLs, root paths, host actions, source directories or permissions allowed.
 */
function readBoundedLocalQuestionBody(req){
 if(!req||typeof req.on!=='function'||typeof req.off!=='function')
  return Promise.resolve(Object.freeze({ok:false,code:'INVALID_LOCAL_CHAT_REQUEST'}));
 return new Promise(resolve=>{
  const pieces=[];let used=0,finished=false;
  const timer=setTimeout(()=>finish({ok:false,code:'LOCAL_CHAT_REQUEST_TIMEOUT'}),4000);
  if(typeof timer.unref==='function')timer.unref();
  function cleanup(){
   clearTimeout(timer);
   req.off('data',onData);req.off('end',onEnd);
   req.off('error',onError);req.off('aborted',onAbort);req.off('close',onClose);
  }
  function finish(value){
   if(finished)return;
   finished=true;cleanup();resolve(Object.freeze(value));
  }
  function onData(value){
   const b=Buffer.isBuffer(value)?value:Buffer.from(value);
   used+=b.length;
   if(used>2048){
    // Drop unread bytes rather than retain an unbounded request in memory.
    if(typeof req.resume==='function')req.resume();
    finish({ok:false,code:'LOCAL_CHAT_REQUEST_TOO_LARGE'});
    return;
   }
   pieces.push(b);
  }
  function onEnd(){
   let data;
   try{data=JSON.parse(Buffer.concat(pieces).toString('utf8'));}
   catch{return finish({ok:false,code:'INVALID_LOCAL_CHAT_JSON'});}
   // Existing Calliope UI sends {query}; optional maxDocs is for client
   // callers that want fewer excerpts. No other caller-supplied options.
   if(!data||typeof data!=='object'||Array.isArray(data)||
      Object.getPrototypeOf(data)!==Object.prototype||
      (Object.keys(data).length!==1&&Object.keys(data).length!==2)||
      !Object.hasOwn(data,'query')||
      (Object.keys(data).length===2&&!Object.hasOwn(data,'maxDocs')))
    return finish({ok:false,code:'INVALID_LOCAL_CHAT_SCHEMA'});
   const maxDocs=Object.hasOwn(data,'maxDocs')?data.maxDocs:3;
   if(!Number.isSafeInteger(maxDocs)||maxDocs<1||maxDocs>MAX_DOCS)
    return finish({ok:false,code:'INVALID_LOCAL_CHAT_SCHEMA'});
   const valid=validateLocalQuestion(data.query);
   if(!valid.ok)return finish({ok:false,code:valid.code});
   return finish({ok:true,query:valid.query,maxDocs});
  }
  function onError(){finish({ok:false,code:'INVALID_LOCAL_CHAT_REQUEST'});}
  function onAbort(){finish({ok:false,code:'LOCAL_CHAT_REQUEST_ABORTED'});}
  function onClose(){finish({ok:false,code:'LOCAL_CHAT_REQUEST_CLOSED'});}
  req.on('data',onData);req.on('end',onEnd);req.on('error',onError);
  req.on('aborted',onAbort);req.on('close',onClose);
 });
}
module.exports={answerFromLocalProjectDocs,validateLocalQuestion,readBoundedLocalQuestionBody};
