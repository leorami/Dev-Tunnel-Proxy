import test from 'node:test';
import assert from 'node:assert/strict';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const fixture=fileURLToPath(new URL('./fixtures/v192-libsignal-peer.mjs',import.meta.url));
const H='a'.repeat(64),SRC='c'.repeat(40);
const DENIED=['ownerApprovalGranted','exportAuthorized','executionAuthorized',
  'healingPerformed','liveAttested','productionChangeAuthorized'];
class Peer {
  constructor(name) {
    if(!process.env.V192_LIBSIGNAL_PACKAGE_ROOT)throw Error('LIBSIGNAL_REQUIRED');
    this.name=name;this.pending=new Map();this.stderr='';
    this.proc=spawn(process.execPath,[fixture],{stdio:['pipe','pipe','pipe'],
      env:{...process.env,V192_PEER_NAME:name}});
    this.proc.stderr.on('data',x=>this.stderr=(this.stderr+x.toString()).slice(-2000));
    readline.createInterface({input:this.proc.stdout}).on('line',line=>{
      let msg;try{msg=JSON.parse(line);}catch{return;}
      const p=this.pending.get(msg.id);if(!p)return;
      clearTimeout(p.timer);this.pending.delete(msg.id);
      msg.ok?p.resolve(msg.result):p.reject(Error(msg.error||'PEER_DENIED'));
    });
    this.proc.on('exit',()=>{
      for(const [id,p] of this.pending){clearTimeout(p.timer);p.reject(Error('PEER_EXITED_'+name));this.pending.delete(id);}
    });
  }
  send(op,args={}){
    return new Promise((resolve,reject)=>{
      const id=randomUUID();
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('TIMEOUT_'+this.name+'_'+op+' '+this.stderr));},12000);
      this.pending.set(id,{resolve,reject,timer});
      this.proc.stdin.write(JSON.stringify({id,op,...args})+'\n');
    });
  }
  stop(){this.proc.stdin.end();this.proc.kill();}
}
async function setup({withGrant=true}={}){
  const t=new Peer('trajectory'),c=new Peer('calliope');
  try{
    const [ti,ci]=await Promise.all([t.send('identity'),c.send('identity')]);
    assert.notEqual(ti.pid,ci.pid);
    assert.notEqual(ti.publicIdentity,ci.publicIdentity);
    assert.notEqual(ti.publicSigningKey,ci.publicSigningKey);
    await t.send('pin',{peer:'calliope',publicIdentity:ci.publicIdentity});
    await c.send('pin',{peer:'trajectory',publicIdentity:ti.publicIdentity});
    await c.send('configure-describe',{trustedSenderPublicKey:ti.publicSigningKey,withGrant});
    await t.send('start',{to:'calliope',bundle:await c.send('bundle')});
    return {t,c,close:()=>{t.stop();c.stop();}};
  }catch(e){t.stop();c.stop();throw e;}
}
function noAuthority(result){
  for(const flag of DENIED)assert.equal(result[flag],false,flag);
  for(const k of ['url','path','bytes','content','accessToken','ownerConsent','grantId','privateKey'])
    assert.equal(Object.hasOwn(result,k),false,k);
}
test('real Signal-encrypted signed artifact.describe stays opaque to relay and yields inert V193 descriptor', {timeout:30000},async()=>{
  const {t,c,close}=await setup();
  try{
    const packet=await t.send('encrypt-signed-describe',{to:'calliope'});
    assert.equal(packet.messageType,3,'first encrypted request must use PQXDH PreKey');
    assert.equal(Buffer.from(packet.ciphertext,'hex').includes(Buffer.from('artifact.describe')),false);
    const result=await c.send('decrypt-and-describe',{from:'trajectory',packet});
    assert.equal(result.ok,true);
    assert.equal(result.status,'DESCRIPTOR_CANDIDATE_ONLY');
    assert.equal(result.sender,'trajectory');
    assert.equal(result.project,'demo-studio');
    assert.equal(result.artifactSha256,H);
    assert.deepEqual(result.descriptor,{mediaType:'image/png',byteLength:12800,
      sourceCommit:SRC,capturedAtMs:1800000000000-1000});
    noAuthority(result);
  }finally{close();}
});
test('E2EE and valid signature alone do NOT grant metadata when trusted recipient grant absent', {timeout:30000},async()=>{
  const {t,c,close}=await setup({withGrant:false});
  try{
    const packet=await t.send('encrypt-signed-describe',{to:'calliope'});
    const result=await c.send('decrypt-and-describe',{from:'trajectory',packet});
    assert.equal(result.ok,false);noAuthority(result);
  }finally{close();}
});
test('encrypted forbidden intent, forged owner approval and modified signature deny', {timeout:30000},async()=>{
  const {t,c,close}=await setup();
  try{
    for(const opts of [
      {purpose:'artifact.export'},{ownerApproved:true},{tamperSignature:true},
      {artifactSha256:'b'.repeat(64)}
    ]){
      const packet=await t.send('encrypt-signed-describe',{to:'calliope',...opts});
      const result=await c.send('decrypt-and-describe',{from:'trajectory',packet});
      assert.equal(result.ok,false,JSON.stringify(opts));
      noAuthority(result);
    }
  }finally{close();}
});
test('separately encrypted messages carrying the same signed V191 nonce are rejected on replay', {timeout:30000},async()=>{
  const {t,c,close}=await setup();
  try{
    const args={to:'calliope',nonce:'A'.repeat(43)};
    const first=await t.send('encrypt-signed-describe',args);
    const second=await t.send('encrypt-signed-describe',args);
    assert.notEqual(first.ciphertext,second.ciphertext);
    const accepted=await c.send('decrypt-and-describe',{from:'trajectory',packet:first});
    assert.equal(accepted.ok,true);
    const replay=await c.send('decrypt-and-describe',{from:'trajectory',packet:second});
    assert.equal(replay.ok,false);
    noAuthority(replay);
  }finally{close();}
});
