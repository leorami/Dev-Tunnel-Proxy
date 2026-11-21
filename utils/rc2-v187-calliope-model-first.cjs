'use strict';
/**
 * SOURCE ONLY — deterministic two-line reorder against the exact V186
 * installed Config API Git blob. Not a deployer, agent, network client,
 * permission source, host attestation or model tool broker.
 */
const crypto=require('node:crypto');
const PREIMAGE='f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528';
const FLAGS=Object.freeze({
  productionChangeAuthorized:false,
  apiRestartAuthorized:false,
  hostAttested:false,
  processLoaded:false,
  ownerUatAccepted:false,
  healingPerformed:false
});
const EXPLAIN=[
  '      const explained=explainLocalCalliopeCapability(request.query);',
  '      if(explained.ok)return send(res,200,explained);'
].join('\n')+'\n';
const DOCS='      const answer=answerFromLocalProjectDocs({root:ROOT,query:request.query,maxDocs:request.maxDocs});';
const MODEL='      const ownerSessionId=calliopeAskRuntime().sessionKey(extractSessionToken(req));';
const ASK_START="if(req.method==='POST'&&u.pathname===apiPath('ai/ask')&&inlineHostDockerUnavailable())";
const AUDIT_START="if (req.method==='POST' && u.pathname===apiPath('ai/audit') && inlineHostDockerUnavailable())";
function deny(code){return Object.freeze({ok:false,code,...FLAGS});}
function sha(source){
  const b=Buffer.from(source,'utf8');
  return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
}
function one(haystack,needle){
  const ix=haystack.indexOf(needle);
  return ix>=0&&haystack.indexOf(needle,ix+1)===-1?ix:-1;
}
function compileModelFirstApi(input){
  const sourceDescriptor=input&&typeof input==='object'
    ? Object.getOwnPropertyDescriptor(input,'deployedSource') : null;
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.getPrototypeOf(input)!==Object.prototype||
     Reflect.ownKeys(input).length!==1||!sourceDescriptor||
     !Object.hasOwn(sourceDescriptor,'value')){
    return deny('UNTRUSTED_SOURCE_INPUT');
  }
  const source=input.deployedSource;
  if(typeof source!=='string'||source.length>300000||sha(source)!==PREIMAGE){
    return deny('DEPLOYED_API_PREIMAGE_MISMATCH');
  }
  const first=one(source,EXPLAIN),docs=one(source,DOCS),model=one(source,MODEL);
  const start=one(source,ASK_START),end=one(source,AUDIT_START);
  if(start<0||first<0||model<0||docs<0||end<0||
     !(start<first&&first<model&&model<docs&&docs<end)){
    return deny('UNTRUSTED_SOURCE_HANDLER_ANCHOR');
  }
  // Move ONLY the two legacy short-circuit lines after successful model
  // response. On model failure deterministic explain remains ahead of docs.
  const candidate=source.replace(EXPLAIN,'').replace(DOCS,EXPLAIN+DOCS);
  if(candidate===source||one(candidate,EXPLAIN)<0||
     !(candidate.indexOf(MODEL)<candidate.indexOf(EXPLAIN)&&
       candidate.indexOf(EXPLAIN)<candidate.indexOf(DOCS))){
    return deny('CONVERSATION_PRIORITY_NOT_ESTABLISHED');
  }
  return Object.freeze({
    ok:true,
    code:'SOURCE_ONLY_CONVERSATION_FIRST',
    preimageSha:PREIMAGE,
    sourceGitBlobSha1:sha(candidate),
    source:candidate,
    movedLineCount:2,
    ...FLAGS
  });
}
module.exports=Object.freeze({compileModelFirstApi,PREIMAGE});
