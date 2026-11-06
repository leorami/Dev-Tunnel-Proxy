'use strict';
/**
 * Read-only single-snippet DNS-startup hypothesis classifier.
 * Count-only output: never exposes private upstream names or source snippets.
 * Not a substitute for fully expanded reviewed nginx -T or native
 * isolated Docker cold-start tests; never changes nginx/app configurations.
 */
const MAX_FRAGMENT=1024*1024;
const MAX_FRAGMENTS=100;
function result(code,details={}){
 return Object.freeze({code,...details,rootCauseVerified:false,sourceClosureVerified:false,
  nginxStartupTested:false,ownerMacVerified:false,productionChangeAuthorized:false});
}
function lex(source){
 const out=[];const blocks=[];const stack=[];
 let piece='',quote='',escaped=false,comment=false,broken=false;
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(comment){if(c==='\n'){comment=false;piece+=' ';}continue;}
  if(quote){piece+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
  if(c==='#'){comment=true;continue;}
  if(c==='"'||c==="'"){quote=c;piece+=c;continue;}
  if(c===';'){
   const directive=piece.trim();if(directive)out.push({directive,stack:[...stack]});
   else broken=true;
   piece='';continue;
  }
  if(c==='{'){
   const block=piece.trim();if(!block){broken=true;}
   blocks.push(block);stack.push(block);piece='';continue;
  }
  if(c==='}'){
   if(piece.trim())broken=true;
   if(stack.length===0)broken=true;else stack.pop();
   piece='';continue;
  }
  piece+=c;
 }
 if(quote||stack.length||piece.trim()||broken)return null;
 return {directives:out,blocks};
}
function words(d){return d.match(/^\s*([^\s]+)(?:\s+([\s\S]*))?$/)||[];}
function endpointKind(target){
 if(!target||target.includes('$'))return 'dynamic';
 const stripped=target.replace(/^['"]|['"]$/g,'');
 const match=stripped.match(/^https?:\/\/([^/]+)/i);
 if(!match)return 'unknown';
 const hostAndPort=match[1];
 if(hostAndPort.startsWith('unix:'))return 'literal';
 const host=hostAndPort.startsWith('[')?hostAndPort.slice(1,hostAndPort.indexOf(']')):hostAndPort.split(':')[0];
 if(!host)return 'unknown';
 if(host==='localhost'||host.endsWith('.localhost')||/^[0-9]+(?:\.[0-9]+){3}$/.test(host)||hostAndPort.startsWith('['))return 'literal';
 return 'static';
}
function upstreamServerKind(spec){
 if(!spec)return 'unknown';
 const x=spec.split(/\s+/)[0];
 if(x.includes('$'))return 'dynamic';
 if(x.startsWith('unix:'))return 'literal';
 const hostname=x.startsWith('[')?x.slice(1,x.indexOf(']')):x.split(':')[0];
 if(!hostname)return 'unknown';
 if(hostname==='localhost'||hostname.endsWith('.localhost')||/^[0-9]+(?:\.[0-9]+){3}$/.test(hostname)||x.startsWith('['))return 'literal';
 return 'static';
}
function assessNginxStartupDnsExposure({fragments}={}){
 if(!Array.isArray(fragments)||fragments.length===0||fragments.length>MAX_FRAGMENTS||
  fragments.some(x=>typeof x!=='string'||x.length===0||x.length>MAX_FRAGMENT))return result('SOURCE_UNVERIFIED');
 const parsed=fragments.map(lex);
 if(parsed.some(x=>!x)||parsed.every(x=>x.directives.length===0))return result('SOURCE_UNVERIFIED');
 const groups=new Set();
 for(const f of parsed)for(const block of f.blocks){const match=block.match(/^upstream\s+([A-Za-z0-9_\-]+)$/);if(match)groups.add(match[1]);}
 let staticDnsReferences=0,variableProxyReferences=0,groupProxyReferences=0;
 let literalEndpointReferences=0,resolverDirectivesSeen=0,unclassifiedProxyReferences=0;
 let includesPresent=false;
 for(const f of parsed)for(const {directive,stack} of f.directives){
  const w=words(directive),name=w[1],args=(w[2]||'').trim();
  if(name==='include')includesPresent=true;
  if(name==='resolver')resolverDirectivesSeen++;
  if(name==='server'&&stack.some(block=>/^upstream\s+/.test(block))){
   const kind=upstreamServerKind(args);
   if(kind==='static')staticDnsReferences++;
   else if(kind==='literal')literalEndpointReferences++;
   else unclassifiedProxyReferences++;
  }
  if(name!=='proxy_pass')continue;
  const kind=endpointKind(args);
  if(kind==='dynamic')variableProxyReferences++;
  else if(kind==='literal')literalEndpointReferences++;
  else if(kind==='unknown')unclassifiedProxyReferences++;
  else {
   const match=args.match(/^https?:\/\/([^/]+)/i);
   const host=match&&match[1].split(':')[0];
   if(host&&groups.has(host))groupProxyReferences++;
   else staticDnsReferences++;
  }
 }
 return result(staticDnsReferences?'POSSIBLE_STARTUP_DNS_DEPENDENCY':'NO_OBVIOUS_STATIC_DNS_IN_SUPPLIED_TEXT',{
  staticDnsReferences,variableProxyReferences,groupProxyReferences,
  literalEndpointReferences,resolverDirectivesSeen,
  unclassifiedProxyReferences,includesPresent,
  fragmentCount:fragments.length
 });
}
module.exports={assessNginxStartupDnsExposure};
