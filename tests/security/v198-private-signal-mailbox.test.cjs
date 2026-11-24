'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createPrivateSignalCiphertextAdmission}=
  require('../../utils/calliope-private-signal-admission.cjs');
const {createPrivateSignalMailbox}=
  require('../../utils/calliope-private-signal-mailbox.cjs');

const NOW=1800000000000;
const SHA='a'.repeat(64);
const FLAGS=['ownerApprovalGranted','exportAuthorized','executionAuthorized',
 'healingPerformed','liveAttested','productionChangeAuthorized'];
function sandbox(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v198-mbox-')));
 fs.chmodSync(root,0o700);
 const dir=path.join(root,'mailbox');
 fs.mkdirSync(dir,{mode:0o700});
 return {root,dir,close(){fs.rmSync(root,{recursive:true,force:true});}};
}
function principal(){return {sender:'trajectory',project:'demo-studio',
  recipient:'calliope',senderSignalKeySha256:SHA,recipientSignalKeySha256:'c'.repeat(64)};}
function packet(messageId,bytes){
 const ciphertextBase64url=Buffer.from(bytes||crypto.randomBytes(88)).toString('base64url');
 return {version:1,recipient:'calliope',messageId,
  signalMessageType:3,ciphertextBase64url,createdAtMs:NOW-1000,expiresAtMs:NOW+9000};
}
function candidate(boxOpts,packetOpts){
 const gate=createPrivateSignalCiphertextAdmission({
  now:()=>NOW,resolveAuthenticatedSender:()=>principal(),isRecipientEnrolled:()=>true
 });
 const id=packetOpts&&packetOpts.messageId||crypto.randomBytes(32).toString('hex');
 const pkt=packet(id,packetOpts&&packetOpts.bytes);
 const admitted=gate.admit(pkt,{});
 assert.equal(admitted.ok,true);
 return {admitted,packet:pkt,mailbox:createPrivateSignalMailbox({
  directory:boxOpts.dir,now:()=>NOW,maxMessages:boxOpts.maxMessages||8,
  maxTotalBytes:boxOpts.maxTotalBytes||65536
 })};
}
function noAuthority(result){
 assert.equal(Object.isFrozen(result),true);
 for(const flag of FLAGS)assert.equal(result[flag],false,flag);
 for(const key of ['plaintext','privateKey','path','url','exportPath','hostCommand',
  'ownerSession','grantId','sourceFile','fileBytes']){
  assert.equal(Object.hasOwn(result,key),false,key);
 }
}

test('RED: existing 0700 mailbox required; missing, symlink, world-readable and .artifacts paths rejected',()=>{
 const s=sandbox();
 try{
  const mk=dir=>createPrivateSignalMailbox({directory:dir});
  assert.throws(()=>mk('/'),/INVALID_MAILBOX_DIRECTORY/);
  assert.throws(()=>mk('relative'),/INVALID_MAILBOX_DIRECTORY/);
  const missing=path.join(s.root,'nope');
  assert.throws(()=>mk(missing),/INVALID_MAILBOX_DIRECTORY/);
  const alias=path.join(s.root,'shortcut');fs.symlinkSync(s.dir,alias);
  assert.throws(()=>mk(alias),/INVALID_MAILBOX_DIRECTORY/);
  fs.chmodSync(s.dir,0o755);
  assert.throws(()=>mk(s.dir),/INVALID_MAILBOX_DIRECTORY/);
  fs.chmodSync(s.dir,0o700);
  const artifacts=path.join(s.root,'.artifacts','mailbox');
  fs.mkdirSync(path.dirname(artifacts),{mode:0o700,recursive:true});
  fs.mkdirSync(artifacts,{mode:0o700});
  assert.throws(()=>mk(artifacts),/INVALID_MAILBOX_DIRECTORY/);
 }finally{s.close();}
});

test('GREEN: admitted ciphertext enqueues once; duplicate messageId and payload cannot deliver twice',()=>{
 const s=sandbox();
 try{
  const bytes=crypto.randomBytes(96);
  const first=candidate({dir:s.dir},{bytes,messageId:'b'.repeat(64)});
  const queued=first.mailbox.enqueue(first.admitted);
  assert.equal(queued.ok,true);
  assert.equal(queued.status,'PRIVATE_MAILBOX_ENQUEUED');
  assert.equal(Object.hasOwn(queued,'ciphertextBase64url'),false);
  noAuthority(queued);
  const again=first.mailbox.enqueue(first.admitted);
  assert.equal(again.ok,false);
  assert.equal(again.status,'PRIVATE_MAILBOX_DUPLICATE');
  const otherId=candidate({dir:s.dir},{bytes,messageId:'d'.repeat(64)});
  const dupPayload=first.mailbox.enqueue(otherId.admitted);
  assert.equal(dupPayload.ok,false);
  assert.equal(dupPayload.status,'PRIVATE_MAILBOX_DUPLICATE');
 }finally{s.close();}
});

test('GREEN: only the bound recipient lists ciphertext; ack is durable across reconstruction',()=>{
 const s=sandbox();
 try{
  const c=candidate({dir:s.dir},{});
  assert.equal(c.mailbox.enqueue(c.admitted).ok,true);
  const stranger=c.mailbox.list('trajectory');
  assert.equal(stranger.ok,true);
  assert.equal(stranger.items.length,0);
  const open=c.mailbox.list('calliope');
  assert.equal(open.ok,true);
  assert.equal(open.items.length,1);
  assert.equal(open.items[0].messageId,c.admitted.messageId);
  assert.equal(open.items[0].ciphertextBase64url,c.admitted.ciphertextBase64url);
  noAuthority(open);
  const firstAck=c.mailbox.ack({recipient:'calliope',messageId:c.admitted.messageId});
  assert.equal(firstAck.ok,true);
  assert.equal(firstAck.status,'PRIVATE_MAILBOX_ACKED');
  const restarted=createPrivateSignalMailbox({directory:s.dir,now:()=>NOW});
  assert.equal(restarted.list('calliope').items.length,0);
  const secondAck=restarted.ack({recipient:'calliope',messageId:c.admitted.messageId});
  assert.equal(secondAck.ok,false);
  assert.equal(secondAck.status,'PRIVATE_MAILBOX_DUPLICATE');
 }finally{s.close();}
});

test('RED: expired ciphertext is not delivered but is not silently deleted before ack',()=>{
 const s=sandbox();
 try{
  const c=candidate({dir:s.dir},{});
  assert.equal(c.mailbox.enqueue(c.admitted).ok,true);
  const later=createPrivateSignalMailbox({directory:s.dir,now:()=>NOW+120000});
  const listed=later.list('calliope');
  assert.equal(listed.ok,true);
  assert.equal(listed.items.length,0);
  const files=fs.readdirSync(s.dir);
  assert.equal(files.some(name=>name.endsWith('.msg')),true);
  const acked=later.ack({recipient:'calliope',messageId:c.admitted.messageId});
  assert.equal(acked.ok,true);
 }finally{s.close();}
});

test('RED: quota exhaustion and unexpected filenames fail closed',()=>{
 const s=sandbox();
 try{
  const small=createPrivateSignalMailbox({directory:s.dir,now:()=>NOW,maxMessages:1});
  const a=candidate({dir:s.dir},{});
  assert.equal(small.enqueue(a.admitted).ok,true);
  const b=candidate({dir:s.dir},{});
  const full=small.enqueue(b.admitted);
  assert.equal(full.ok,false);
  assert.equal(full.status,'PRIVATE_MAILBOX_FULL');
  fs.writeFileSync(path.join(s.dir,'not-a-message'),'x');
  const poisoned=createPrivateSignalMailbox({directory:s.dir,now:()=>NOW});
  const listed=poisoned.list('calliope');
  assert.equal(listed.ok,false);
 }finally{s.close();}
});

test('RED: extra candidate fields, caller filenames and symlink traversal cannot enqueue',()=>{
 const s=sandbox();
 try{
  const c=candidate({dir:s.dir},{});
  const extra={...c.admitted,path:'/Users/owner/.ssh/id_ed25519'};
  assert.equal(c.mailbox.enqueue(extra).ok,false);
  const proto=Object.assign(Object.create({ownerApproved:true}),c.admitted);
  assert.equal(c.mailbox.enqueue(proto).ok,false);
  const link=path.join(s.dir,'e'.repeat(64)+'.msg');
  fs.symlinkSync('/tmp',link);
  const listed=c.mailbox.list('calliope');
  assert.equal(listed.ok,false);
 }finally{s.close();}
});

test('RED: concurrent O_EXCL enqueue of one messageId admits exactly one',async()=>{
 const s=sandbox();
 try{
  const c=candidate({dir:s.dir},{});
  const payload=JSON.stringify(c.admitted);
  const childSource=`const m=require(process.argv[1]);const box=m.createPrivateSignalMailbox({directory:process.argv[2],now:()=>1800000000000,maxMessages:8});const got=box.enqueue(JSON.parse(process.argv[3]));process.stdout.write(got.ok?'1':'0');`;
  function child(){
   return new Promise((resolve,reject)=>{
    const proc=spawn(process.execPath,['-e',childSource,
      require.resolve('../../utils/calliope-private-signal-mailbox.cjs'),s.dir,payload],
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
 }finally{s.close();}
});

test('RED: mailbox helper never imports process/network spawn and does not use the V196 ledger path',()=>{
 const file=require.resolve('../../utils/calliope-private-signal-mailbox.cjs');
 const source=fs.readFileSync(file,'utf8');
 assert.doesNotMatch(source,/require\(['"](?:node:)?(?:http|https|net|tls|child_process|worker_threads)['"]\)/);
 assert.doesNotMatch(source,/calliope-durable-replay-ledger|signalDecrypt|process\.env|spawn\s*\(/);
 assert.match(source,/O_EXCL/);
 assert.match(source,/fsyncSync/);
});
