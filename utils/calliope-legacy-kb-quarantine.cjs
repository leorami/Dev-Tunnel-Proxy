'use strict';
/**
 * Read-only quarantine for untrusted legacy Calliope healing-kb.json.
 * Inventories pattern IDs, fingerprints JSON-order-independently, classifies
 * known historical Next.js/mixed-content evidence, and emits non-executable
 * ability review requests for unknown functions. Never executes RegExp(signal),
 * never invokes named repair functions, never mutates the KB file.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const KNOWN_PATTERN_CLASS=Object.freeze({
 redirect_loop_errors:'KNOWN_NEXTJS_REDIRECT_HISTORICAL',
 mixed_content_errors:'KNOWN_MIXED_CONTENT_HISTORICAL',
 nextjs_auth_errors:'KNOWN_NEXTJS_ADJACENT_HISTORICAL'
});
const MAX_BYTES=2*1024*1024;
const HEX=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');

function deny(code,extra={}){
 return Object.freeze({
  ok:false,code,ownerApprovalGranted:false,executionAuthorized:false,
  healingPerformed:false,kbMutated:false,regexpExecuted:false,functionsInvoked:false,...extra
 });
}

function isPlain(o){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
}

function canonicalize(value){
 if(value===null||typeof value==='number'||typeof value==='boolean'||typeof value==='string')
  return value;
 if(Array.isArray(value))return value.map(canonicalize);
 if(!isPlain(value))return null;
 const out={};
 for(const k of Object.keys(value).sort())out[k]=canonicalize(value[k]);
 return out;
}

function fingerprintPattern(pattern){
 const signals=Array.isArray(pattern?.detection?.signals)
  ?pattern.detection.signals.filter(x=>typeof x==='string').slice().sort()
  :[];
 const effects=Array.isArray(pattern?.detection?.effects)
  ?pattern.detection.effects.filter(x=>typeof x==='string').slice().sort()
  :[];
 const solutions=Array.isArray(pattern?.solutions)?pattern.solutions:[];
 const solutionMeta=solutions.map(s=>{
  const impl=s&&isPlain(s.implementation)?s.implementation:{};
  return {
   id:typeof s?.id==='string'?s.id:'',
   type:typeof impl.type==='string'?impl.type:'',
   function:typeof impl.function==='string'?impl.function:null
  };
 }).sort((a,b)=>a.id.localeCompare(b.id)||String(a.function).localeCompare(String(b.function)));
 const body=canonicalize({
  id:typeof pattern?.id==='string'?pattern.id:'',
  signals,effects,solutions:solutionMeta
 });
 return HEX(JSON.stringify(body));
}

function classifyPattern(pattern){
 const id=typeof pattern?.id==='string'?pattern.id:'';
 if(Object.hasOwn(KNOWN_PATTERN_CLASS,id))return KNOWN_PATTERN_CLASS[id];
 return 'UNKNOWN_HISTORICAL_EVIDENCE';
}

function collectAbilityRequests(pattern){
 const out=[];
 const solutions=Array.isArray(pattern?.solutions)?pattern.solutions:[];
 for(const s of solutions){
  const impl=s&&isPlain(s.implementation)?s.implementation:null;
  if(!impl)continue;
  if(impl.type==='automated'&&typeof impl.function==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,95}$/.test(impl.function)){
   out.push(Object.freeze({
    id:`legacy.kb.fn.${impl.function}`,
    fromPattern:typeof pattern.id==='string'?pattern.id:'',
    registryStatus:'NEW_ABILITY_REQUEST_NOT_IMPLEMENTED',
    runnable:false,
    note:'Legacy KB named a privileged repair function; review only — do not auto-install'
   }));
  }
 }
 // Signal strings are treated as opaque descriptors, never compiled to RegExp.
 const signals=Array.isArray(pattern?.detection?.signals)?pattern.detection.signals:[];
 for(const sig of signals){
  if(typeof sig!=='string')continue;
  if(sig.length>0&&sig.length<=512){
   out.push(Object.freeze({
    id:`legacy.kb.signal.${HEX(sig).slice(0,16)}`,
    fromPattern:typeof pattern.id==='string'?pattern.id:'',
    registryStatus:'SIGNAL_DESCRIPTOR_REVIEW_ONLY',
    runnable:false,
    note:'Opaque historical signal text; RegExp execution forbidden'
   }));
  }
 }
 return out;
}

async function quarantineLegacyHealingKb({kbPath,kbObject,maxBytes=MAX_BYTES}={}){
 let originalBytes=null;
 let parsed=kbObject;
 if(kbPath!==undefined){
  if(typeof kbPath!=='string'||!path.isAbsolute(kbPath)||path.normalize(kbPath)!==kbPath||
     kbPath.endsWith(path.sep)||typeof maxBytes!=='number'||maxBytes<1||maxBytes>MAX_BYTES)
   return deny('INVALID_KB_PATH');
  try{
   const st=await fs.lstat(kbPath);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>maxBytes)
    return deny('UNSAFE_OR_OVERSIZED_KB');
   // Owner-writable group/other bits are allowed for existing artifacts; refuse world-writable sticky surprises only.
   if((st.mode&0o002)!==0)return deny('WORLD_WRITABLE_KB_REFUSED');
   originalBytes=await fs.readFile(kbPath);
   parsed=JSON.parse(originalBytes.toString('utf8'));
  }catch(e){
   if(e&&e.code==='ENOENT')return deny('KB_NOT_FOUND');
   return deny('KB_UNREADABLE_OR_INVALID_JSON');
  }
 }else if(kbObject!==undefined){
  if(!isPlain(kbObject))return deny('INVALID_KB_OBJECT');
  originalBytes=Buffer.from(JSON.stringify(canonicalize(kbObject)),'utf8');
 }else return deny('KB_SOURCE_REQUIRED');

 if(!isPlain(parsed)||!Array.isArray(parsed.patterns))
  return deny('INVALID_KB_SHAPE');

 const patterns=[];
 const abilityRequests=[];
 const seenIds=new Set();
 for(const pattern of parsed.patterns){
  if(!isPlain(pattern)||typeof pattern.id!=='string'||!pattern.id)
   return deny('INVALID_PATTERN_ENTRY');
  if(seenIds.has(pattern.id))return deny('DUPLICATE_PATTERN_ID',{id:pattern.id});
  seenIds.add(pattern.id);
  // Hostile getters: re-read via own data properties only through canonicalize snapshot.
  const snap=canonicalize(pattern);
  if(snap===null)return deny('NON_JSON_SAFE_PATTERN');
  const fp=fingerprintPattern(snap);
  const classification=classifyPattern(snap);
  patterns.push(Object.freeze({
   id:snap.id,fingerprint:fp,classification,
   signalCount:Array.isArray(snap.detection?.signals)?snap.detection.signals.length:0,
   solutionCount:Array.isArray(snap.solutions)?snap.solutions.length:0
  }));
  for(const req of collectAbilityRequests(snap))abilityRequests.push(req);
 }

 const inventoryFingerprint=HEX(JSON.stringify(patterns.map(p=>[p.id,p.fingerprint]).sort((a,b)=>a[0].localeCompare(b[0]))));
 // Prove we did not mutate file bytes when path-backed.
 let bytesUnchanged=true;
 if(kbPath!==undefined){
  const now=await fs.readFile(kbPath);
  bytesUnchanged=Buffer.compare(now,originalBytes)===0;
 }

 return Object.freeze({
  ok:true,code:'LEGACY_KB_QUARANTINED_READONLY',
  patternCount:patterns.length,
  patterns:Object.freeze(patterns),
  abilityRequests:Object.freeze(abilityRequests),
  inventoryFingerprint,
  bytesUnchanged,
  kbMutated:false,regexpExecuted:false,functionsInvoked:false,
  ownerApprovalGranted:false,executionAuthorized:false,healingPerformed:false,
  note:'Historical KB is evidence only until independent replay and owner approval'
 });
}

module.exports={quarantineLegacyHealingKb,fingerprintPattern,canonicalize};
