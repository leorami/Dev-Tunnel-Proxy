'use strict';
/**
 * Red-first follow-up to V198 accepted source: reject forged or non-private
 * on-disk ACKs rather than following symlinks or ignoring mode violations.
 * All files are disposable CI/test-only synthetic ciphertext.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createPrivateSignalMailbox}=require('../../utils/calliope-private-signal-mailbox.cjs');
const {createPrivateSignalCiphertextAdmission}=require('../../utils/calliope-private-signal-admission.cjs');
const NOW=1800000000000;
function sandbox(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v199-fs-')));
 fs.chmodSync(root,0o700);
 const dir=path.join(root,'mailbox');
 fs.mkdirSync(dir,{mode:0o700});
 return {root,dir,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function accepted(){
 const data={
  version:1,recipient:'calliope',
  messageId:crypto.randomBytes(32).toString('hex'),signalMessageType:3,
  ciphertextBase64url:crypto.randomBytes(96).toString('base64url'),
  createdAtMs:NOW-250,expiresAtMs:NOW+12000
 };
 const gate=createPrivateSignalCiphertextAdmission({
  now:()=>NOW,
  resolveAuthenticatedSender:()=>({
   sender:'trajectory',project:'demo-studio',recipient:'calliope',
   senderSignalKeySha256:'a'.repeat(64),
   recipientSignalKeySha256:'b'.repeat(64)
  }),
  isRecipientEnrolled:()=>true
 });
 const a=gate.admit(data,{});
 assert.equal(a.ok,true);
 return a;
}
function acknowledgedDirectory(s){
 const m=createPrivateSignalMailbox({directory:s.dir,now:()=>NOW});
 const p=accepted();
 assert.equal(m.enqueue(p).ok,true);
 assert.equal(m.ack({recipient:'calliope',messageId:p.messageId}).ok,true);
 const ack=path.join(s.dir,p.messageId+'.ack');
 assert.equal(fs.existsSync(ack),true);
 return {m,ack};
}
test('RED: a symlinked ACK cannot make a private mailbox list look healthy',()=>{
 const s=sandbox();
 try{
  const {m,ack}=acknowledgedDirectory(s);
  const text=fs.readFileSync(ack,'utf8');
  const forgedTarget=path.join(s.root,'synthetic-ack-outside-private-mailbox');
  fs.writeFileSync(forgedTarget,text,{mode:0o600});
  fs.unlinkSync(ack);
  fs.symlinkSync(forgedTarget,ack);
  const result=m.list('calliope');
  assert.equal(result.ok,false,'private mailbox must reject symlinked .ack');
 }finally{s.close()}
});
test('RED: ACK symlinks cannot authorize another ciphertext enqueue or read external files',()=>{
 const s=sandbox();
 try{
  const {m,ack}=acknowledgedDirectory(s);
  const external=path.join(s.root,'synthetic-external-ack');
  fs.writeFileSync(external,fs.readFileSync(ack),{mode:0o600});
  fs.unlinkSync(ack);fs.symlinkSync(external,ack);
  const result=m.enqueue(accepted());
  assert.equal(result.ok,false,'enqueue must fail closed when any ACK is symlinked');
 }finally{s.close()}
});
test('RED: group-readable ACKs are rejected consistently for list and enqueue',()=>{
 const s=sandbox();
 try{
  const {m,ack}=acknowledgedDirectory(s);
  fs.chmodSync(ack,0o644);
  const list=m.list('calliope');
  assert.equal(list.ok,false,'list must not accept an ACK with weak permissions');
  const enqueue=m.enqueue(accepted());
  assert.equal(enqueue.ok,false,'enqueue must not accept an ACK with weak permissions');
 }finally{s.close()}
});
test('GREEN control: privately owned regular 0600 ACKs survive restart without replay',()=>{
 const s=sandbox();
 try{
  const {m,ack}=acknowledgedDirectory(s);
  const st=fs.lstatSync(ack);
  assert.equal(st.isFile(),true);
  assert.equal(st.mode&0o777,0o600);
  assert.equal(m.list('calliope').ok,true);
  const restarted=createPrivateSignalMailbox({directory:s.dir,now:()=>NOW});
  assert.equal(restarted.list('calliope').ok,true);
 }finally{s.close()}
});
