'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createDurableCalliopeReplayLedger}=require('../../utils/calliope-durable-replay-ledger.cjs');
const {createCalliopeAgentEnvelopeVerifier,messageSigningBytes}=require('../../utils/calliope-agent-envelope.cjs');
const NOW=1800000000000, HASH='a'.repeat(64);
const rawNonce=() => crypto.randomBytes(32).toString('base64url');
function sandbox(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v196-source-only-')));
 fs.chmodSync(root,0o700);
 const dir=path.join(root,'replay');
 fs.mkdirSync(dir,{mode:0o700});
 return {root,dir,close(){fs.rmSync(root,{recursive:true,force:true})}};
}
const message=nonce=>({
 version:1,audience:'devproxy.calliope.agent.v1',sender:'trajectory',
 project:'demo-studio',purpose:'artifact.describe',artifactSha256:HASH,
 issuedAtMs:NOW-500,expiresAtMs:NOW+20000,nonce
});
function signed(msg,key){
 return {...msg,signature:crypto.sign(null,messageSigningBytes(msg),key).toString('base64url')};
}
const params=(nonce,now=NOW)=>({sender:'trajectory',project:'demo-studio',nonce,
 expiresAtMs:NOW+20000,at:now});

test('RED: accepts once then refuses the identical signed nonce across ledger and verifier reconstruction',()=>{
 const s=sandbox();
 try{
  const key=crypto.generateKeyPairSync('ed25519');
  const make=()=>createCalliopeAgentEnvelopeVerifier({
   identities:{trajectory:{publicKey:key.publicKey,projects:['demo-studio']}},
   now:()=>NOW,requireDurableReplay:true,
   replayLedger:createDurableCalliopeReplayLedger({directory:s.dir,maxEntries:16})
  });
  const envelope=signed(message(rawNonce()),key.privateKey);
  assert.equal(make().verifyEnvelope(envelope).ok,true);
  const result=make().verifyEnvelope(envelope);
  assert.equal(result.ok,false,'restart must never permit replay');
  assert.equal(result.exportAuthorized,false);
  assert.equal(result.executionAuthorized,false);
 }finally{s.close()}
});

test('RED: atomic O_EXCL reservations from six independent Node processes admit exactly one',async()=>{
 const s=sandbox();
 try{
  const nonce=rawNonce();
  const childSource=`const m=require(process.argv[1]);const l=m.createDurableCalliopeReplayLedger({directory:process.argv[2],maxEntries:16});const yes=l.reserve({sender:'trajectory',project:'demo-studio',nonce:process.argv[3],expiresAtMs:1800000020000,at:1800000000000});process.stdout.write(yes?'1':'0')`;
  function child(){
   return new Promise((resolve,reject)=>{
    const proc=spawn(process.execPath,['-e',childSource,
      require.resolve('../../utils/calliope-durable-replay-ledger.cjs'),s.dir,nonce],
      {stdio:['ignore','pipe','pipe']});
    let output='',err='';
    proc.stdout.on('data',v=>output+=v.toString());
    proc.stderr.on('data',v=>err+=v.toString());
    proc.on('exit',code=>code===0?resolve(output):reject(Error('child failed '+code+':'+err.slice(0,450))));
   });
  }
  const outcomes=await Promise.all(Array.from({length:6},()=>child()));
  assert.equal(outcomes.filter(x=>x==='1').length,1);
  assert.equal(outcomes.filter(x=>x==='0').length,5);
 }finally{s.close()}
});

test('RED: existing private directory required; symlinks, broad permissions and root path rejected',()=>{
 const s=sandbox();
 try{
  const mk=dir=>createDurableCalliopeReplayLedger({directory:dir});
  assert.throws(()=>mk('/'),/INVALID_REPLAY_DIRECTORY/);
  assert.throws(()=>mk('relative'),/INVALID_REPLAY_DIRECTORY/);
  const alias=path.join(s.root,'shortcut');fs.symlinkSync(s.dir,alias);
  assert.throws(()=>mk(alias),/INVALID_REPLAY_DIRECTORY/);
  fs.chmodSync(s.dir,0o755);
  assert.throws(()=>mk(s.dir),/INVALID_REPLAY_DIRECTORY/);
  fs.chmodSync(s.dir,0o700);
  assert.throws(()=>mk(path.join(s.root,'missing')),/INVALID_REPLAY_DIRECTORY/);
 }finally{s.close()}
});

test('RED: malformed, expired, oversized and unknown scopes refuse before any ledger writes',()=>{
 const s=sandbox();
 try{
  const l=createDurableCalliopeReplayLedger({directory:s.dir,maxEntries:16});
  const good=params(rawNonce());
  const invalid=[
   {...good,sender:'../../other'}, {...good,project:'../../../private'},
   {...good,nonce:'bad'}, {...good,nonce:'A'.repeat(400)},
   {...good,expiresAtMs:NOW}, {...good,expiresAtMs:NOW+120000},
   {...good,at:Number.NaN},{...good,issuedAtMs:NOW-1},
   {...good,ownerApproved:true}, Object.assign(Object.create({inherited:true}),good)
  ];
  for(const item of invalid)assert.equal(l.reserve(item),false);
  assert.deepEqual(fs.readdirSync(s.dir),[]);
 }finally{s.close()}
});

test('RED: reservation files expose no sender/project/nonce and have strict filesystem permissions',()=>{
 const s=sandbox();
 try{
  const nonce=rawNonce();
  const l=createDurableCalliopeReplayLedger({directory:s.dir});
  assert.equal(l.reserve(params(nonce)),true);
  const files=fs.readdirSync(s.dir);
  assert.equal(files.length,1);
  assert.match(files[0],/^[a-f0-9]{64}\.nonce$/);
  const loc=path.join(s.dir,files[0]);
  const content=fs.readFileSync(loc,'utf8');
  for(const sensitive of ['trajectory','demo-studio',nonce])
   assert.equal(files[0].includes(sensitive)||content.includes(sensitive),false);
  assert.equal(fs.statSync(loc).mode&0o777,0o600);
 }finally{s.close()}
});

test('RED: bounded capacity, unexpected directory contents and filesystem faults never silently allow',()=>{
 const s=sandbox();
 try{
  const l=createDurableCalliopeReplayLedger({directory:s.dir,maxEntries:1});
  assert.equal(l.reserve(params(rawNonce())),true);
  assert.equal(l.reserve(params(rawNonce())),false,'capacity must fail closed');
  const files=fs.readdirSync(s.dir);
  assert.equal(files.length,1);
  fs.writeFileSync(path.join(s.dir,'unexpected'),'x',{mode:0o600});
  assert.equal(l.reserve(params(rawNonce())),false,'unexpected file is not ignored');
 }finally{s.close()}
});

test('RED: cannot claim durable production replay using a missing or fabricated ledger',()=>{
 const keys=crypto.generateKeyPairSync('ed25519');
 const identities={trajectory:{publicKey:keys.publicKey,projects:['demo-studio']}};
 assert.throws(()=>createCalliopeAgentEnvelopeVerifier({
   identities,now:()=>NOW,requireDurableReplay:true
 }),/DURABLE_REPLAY_REQUIRED/);
 assert.throws(()=>createCalliopeAgentEnvelopeVerifier({
   identities,now:()=>NOW,requireDurableReplay:true,
   replayLedger:{reserve:()=>true}
 }),/DURABLE_REPLAY_REQUIRED/);
});

test('RED: signature-invalid messages never consume durable nonces',()=>{
 const s=sandbox();
 try{
  const signedKey=crypto.generateKeyPairSync('ed25519');
  const other=crypto.generateKeyPairSync('ed25519');
  const verifier=createCalliopeAgentEnvelopeVerifier({
   identities:{trajectory:{publicKey:signedKey.publicKey,projects:['demo-studio']}},
   now:()=>NOW,requireDurableReplay:true,
   replayLedger:createDurableCalliopeReplayLedger({directory:s.dir})
  });
  const original=message(rawNonce());
  assert.equal(verifier.verifyEnvelope(signed(original,other.privateKey)).ok,false);
  assert.deepEqual(fs.readdirSync(s.dir),[]);
  assert.equal(verifier.verifyEnvelope(signed(original,signedKey.privateKey)).ok,true);
 }finally{s.close()}
});

test('RED: durable ledger honors V191 sender-wide nonce scope across authorized projects',()=>{
 const s=sandbox();
 try{
  const l=createDurableCalliopeReplayLedger({directory:s.dir,maxEntries:16});
  const nonce=rawNonce();
  assert.equal(l.reserve(params(nonce)),true);
  assert.equal(l.reserve({...params(nonce),project:'aperture'}),false,
    'sender+nonce replay must not become valid by switching project');
 }finally{s.close()}
});
