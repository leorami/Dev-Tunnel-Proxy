'use strict';
/**
 * One deterministic, proposal-only translation of an October 2025 Cursor fix.
 * Caller MUST use reviewed transaction/host settlement (in another layer) to
 * execute any patch; no filesystem, network, Docker or agent tool access here.
 */
const crypto=require('node:crypto');
const ROUTE=/^[a-z][a-z0-9-]{0,47}$/;
const HEX=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const outcome=(status,extra={})=>Object.freeze({status,executionAuthorized:false,
  ownerApprovalGranted:false,healingPerformed:false,liveAttested:false,
  productionChangeAuthorized:false,...extra});
function proposeNextjsRedirectLoopRepair({source,route}={}){
 if(typeof source!=='string'||typeof route!=='string'||!ROUTE.test(route)||
    Buffer.byteLength(source,'utf8')>256*1024||!source.length||
    /[\u0000\u000d]/.test(source))return outcome('INVALID_REPAIR_INPUT');
 // The route is a *single* trusted segment, not a caller-controlled URI/regexp.
 const expr=new RegExp(`(^|\\n)([ \\t]*location[ \\t]+(?:\\^~[ \\t]+)?\\/${route}\\/_next\\/[ \\t]*\\{)([^{}]*)(\\})`,'g');
 const found=[...source.matchAll(expr)];
 if(found.length>1)return outcome('AMBIGUOUS_ROUTE_BLOCK');
 if(found.length===0)return outcome('NO_KNOWN_REDIRECT_LOOP');
 const match=found[0],body=match[3];
 // If an exact target block is nested, the scanner must not match an inner
 // segment from an otherwise unsafe multi-brace Nginx grammar.
 const original=match[0];
 const base=match.index;
 const locationHeader=match[2];
 if(source.includes('if (',base+locationHeader.length)||
    body.includes('include '))return outcome('UNSUPPORTED_PROXY_PASS');
 const allPass=[...body.matchAll(/^[ \t]*proxy_pass\b[^\n]*$/gm)];
 if(allPass.length!==1)return outcome('UNSUPPORTED_PROXY_PASS');
 const targetLine=new RegExp(`^([ \\t]*)proxy_pass[ \\t]+http:\\/\\/([a-z][a-z0-9-]*):([0-9]{2,5})\\/${route}\\/_next\\/[ \\t]*;[ \\t]*$`,'m');
 const pass=body.match(targetLine);
 if(!pass){
  // Existing good route should be idempotent, not an unsupported 'healed'.
  const good=/^[ \t]*proxy_pass[ \t]+http:\/\/[a-z][a-z0-9-]*:[0-9]{2,5}[ \t]*;[ \t]*$/m;
  return outcome(good.test(body)?'NO_KNOWN_REDIRECT_LOOP':'UNSUPPORTED_PROXY_PASS');
 }
 const port=Number(pass[3]);
 if(port<1||port>65535)return outcome('UNSUPPORTED_PROXY_PASS');
 const next=body.replace(targetLine,`${pass[1]}proxy_pass http://${pass[2]}:${pass[3]};`);
 if(next===body)return outcome('NO_KNOWN_REDIRECT_LOOP');
 const modified=match[1]+locationHeader+next+match[4];
 const candidateConfig=source.slice(0,base)+modified+source.slice(base+original.length);
 if(candidateConfig===source)return outcome('NO_KNOWN_REDIRECT_LOOP');
 return outcome('PATCH_PROPOSAL_ONLY',{
  beforeSha256:HEX(source),afterSha256:HEX(candidateConfig),candidateConfig,
  changeType:'KNOWN_NEXTJS_UPSTREAM_PREFIX_REPAIR',route,
  requiredVerification:Object.freeze(['review_exact_diff','nginx_syntax_test',
    'owner_route_http_probe','browser_redirect_loop_test','17_route_regression','rollback_proven']),
  executionPath:'REQUIRES_REVIEWED_HMAC_ROUTE_MUTATION'
 });
}
module.exports={proposeNextjsRedirectLoopRepair};
