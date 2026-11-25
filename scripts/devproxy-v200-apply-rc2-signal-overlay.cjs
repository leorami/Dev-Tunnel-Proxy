'use strict';
/**
 * Additive Signal overlay for the owner's loaded RC2 Config API.
 * Inserts the V198–V200 private mailbox namespace only.
 * Every other byte of the input file is preserved.
 */
const fs=require('node:fs');
const path=require('node:path');

const REQUIRES=Buffer.from(
  "const {createPrivateSignalCiphertextAdmission}=require('./calliope-private-signal-admission.cjs');\n"+
  "const {isPrivateSignalMailbox}=require('./calliope-private-signal-mailbox.cjs');\n"+
  "const {loadLivePrivateSignalService}=require('./devproxy-v199-live-signal-service.cjs');\n"
);
const EXPLAIN=Buffer.from("const {explainLocalCalliopeCapability}=require('./rc2-local-calliope-observe-explain.cjs');\n");
const SAFE=Buffer.from('\nfunction safeConfigPath(file){');
const SIGNAL_START=Buffer.from('const PRIVATE_SIGNAL_ROOT');
const OPTIONS_OLD=Buffer.from(
`  // CORS for convenience (not strictly needed when proxied)
  if (req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
`);
const OPTIONS_NEW=Buffer.from(
`  // Private Signal mailbox must never inherit the anonymous OPTIONS CORS
  // wildcard. Preflight is not enrollment, pairing, or a data-plane grant.
  if (isPrivateSignalNamespace(u.pathname)){
    if (req.method === 'OPTIONS'){
      return send(res, 401, { ok:false, error:'Unauthorized', message:'Authentication required' });
    }
  } else if (req.method === 'OPTIONS'){
    // CORS for convenience (not strictly needed when proxied)
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
`);
const DISPATCH_AT=Buffer.from('    // RC2_V95_LOCAL_CHAT: existing Calliope Ask UI stays useful in secure\n');
const DISPATCH=Buffer.from(
`    // Default-disabled private ciphertext mailbox. Admin session is not a
    // Signal device identity; missing enrollment fails closed with 503.
    if (isPrivateSignalNamespace(u.pathname)){
      return handlePrivateSignalMailbox(req, res);
    }
`);
const TEST_HOOK=Buffer.from(
`
if (process.env.NODE_ENV === 'test') {
  module.exports.handle = handle;
  module.exports.__setPrivateSignalServiceForTests = function(service){
    privateSignalTestService = service;
  };
}
`);
const ENV_LOADER=Buffer.from(
`function loadOwnerSignalServiceEnv(){
  try{
    const file=path.join(ROOT,'.signal-private','service-env.json');
    const st=fs.lstatSync(file);
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)return;
    if((st.mode&0o777)!==0o600)return;
    if(typeof process.getuid==='function'&&st.uid!==process.getuid())return;
    const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
    if(typeof parsed.enrollmentDir==='string'&&path.isAbsolute(parsed.enrollmentDir))
      process.env.DEVPROXY_V199_ENROLLMENT_DIR=parsed.enrollmentDir;
    if(typeof parsed.mailboxDir==='string'&&path.isAbsolute(parsed.mailboxDir))
      process.env.DEVPROXY_V199_MAILBOX_DIR=parsed.mailboxDir;
  }catch{/* fail closed: enrollment stays disabled */}
}
`);
const ACTIVE_OLD=Buffer.from(
`function activePrivateSignalService(){
  if(process.env.NODE_ENV==='test'&&privateSignalTestService)return privateSignalTestService;
  try{return loadLivePrivateSignalService();}catch{return null;}
}
`);
const ACTIVE_NEW=Buffer.from(
`function activePrivateSignalService(){
  if(process.env.NODE_ENV==='test'&&privateSignalTestService)return privateSignalTestService;
  try{loadOwnerSignalServiceEnv();return loadLivePrivateSignalService();}catch{return null;}
}
`);

function once(buf,needle,label){
  const first=buf.indexOf(needle);
  if(first<0)throw Error('OVERLAY_ANCHOR_MISSING:'+label);
  if(buf.indexOf(needle,first+needle.length)>=0)throw Error('OVERLAY_ANCHOR_AMBIGUOUS:'+label);
  return first;
}
function insert(buf,at,chunk){
  return Buffer.concat([buf.subarray(0,at),chunk,buf.subarray(at)]);
}
function replaceOnce(buf,oldBytes,newBytes,label){
  const at=once(buf,oldBytes,label);
  const replacement=Buffer.isBuffer(newBytes)?newBytes:Buffer.alloc(0);
  return Buffer.concat([buf.subarray(0,at),replacement,buf.subarray(at+oldBytes.length)]);
}
function signalBlockFromRepo(repoRoot){
  const source=fs.readFileSync(path.join(repoRoot,'utils','proxyConfigAPI.js'));
  const start=once(source,SIGNAL_START,'github-signal-start');
  const end=once(source,SAFE,'github-safeConfigPath');
  if(end<=start)throw Error('OVERLAY_SIGNAL_BLOCK_ORDER');
  let block=Buffer.concat([source.subarray(start,end),Buffer.from('\n')]);
  if(block.indexOf(ACTIVE_OLD)<0)throw Error('OVERLAY_ACTIVE_SERVICE_MISSING');
  block=replaceOnce(block,ACTIVE_OLD,Buffer.concat([ENV_LOADER,ACTIVE_NEW]),'active-service');
  return block;
}
function applyRc2SignalOverlay(source,repoRoot){
  if(!Buffer.isBuffer(source))throw Error('OVERLAY_SOURCE_BUFFER_REQUIRED');
  if(source.includes(SIGNAL_START))throw Error('OVERLAY_ALREADY_APPLIED');
  const block=signalBlockFromRepo(repoRoot);
  let next=source;
  const explainAt=once(next,EXPLAIN,'explain-require');
  next=insert(next,explainAt+EXPLAIN.length,REQUIRES);
  const safeAt=once(next,SAFE,'safeConfigPath');
  next=insert(next,safeAt,Buffer.concat([Buffer.from('\n'),block]));
  next=replaceOnce(next,OPTIONS_OLD,OPTIONS_NEW,'options');
  const dispatchAt=once(next,DISPATCH_AT,'local-chat');
  next=insert(next,dispatchAt,DISPATCH);
  if(!next.includes(Buffer.from('module.exports')))throw Error('OVERLAY_EXPORTS_MISSING');
  next=Buffer.concat([next,TEST_HOOK]);
  if(stripRc2SignalOverlay(next).equals(source)!==true)throw Error('OVERLAY_BYTE_PRESERVATION_FAILED');
  return next;
}
function stripRc2SignalOverlay(patched){
  let buf=patched;
  if(buf.subarray(buf.length-TEST_HOOK.length).equals(TEST_HOOK))buf=buf.subarray(0,buf.length-TEST_HOOK.length);
  else throw Error('OVERLAY_STRIP_HOOK');
  buf=replaceOnce(buf,DISPATCH,'','strip-dispatch');
  buf=replaceOnce(buf,OPTIONS_NEW,OPTIONS_OLD,'strip-options');
  const blockStart=once(buf,SIGNAL_START,'strip-signal');
  const safeAt=once(buf,SAFE,'strip-safe');
  // insert placed "\n"+block immediately before SAFE, and block itself ends with "\n"
  const inserted=buf.subarray(blockStart,safeAt);
  if(!inserted.includes(ENV_LOADER))throw Error('OVERLAY_STRIP_ENV');
  buf=Buffer.concat([buf.subarray(0,blockStart-1),buf.subarray(safeAt)]);
  buf=replaceOnce(buf,REQUIRES,'','strip-requires');
  return buf;
}
module.exports={applyRc2SignalOverlay,stripRc2SignalOverlay,signalBlockFromRepo};

if(require.main===module){
  const input=process.argv[2];
  const output=process.argv[3];
  if(!input||!output){
    process.stderr.write('usage: devproxy-v200-apply-rc2-signal-overlay.cjs <loaded-api> <staged-api>\n');
    process.exit(2);
  }
  const repoRoot=path.resolve(__dirname,'..');
  const source=fs.readFileSync(input);
  const staged=applyRc2SignalOverlay(source,repoRoot);
  fs.writeFileSync(output,staged,{mode:0o600});
}
