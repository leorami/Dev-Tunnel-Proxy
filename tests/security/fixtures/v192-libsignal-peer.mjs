/**
 * V192 TEST-ONLY two-process endpoint. This is NOT an application entrypoint,
 * real agent, hosted relay, grant service, or distributable Signal integration.
 * All synthetic identity and ratchet secret state dies with the test process.
 * Only public prekey bundle fields and encrypted messages cross process IPC.
 */
import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createPublicKey, generateKeyPairSync, randomBytes, sign as edSign } from 'node:crypto';

const root=process.env.V192_LIBSIGNAL_PACKAGE_ROOT;
const localName=process.env.V192_PEER_NAME;
if (!root || !['trajectory','calliope','intruder'].includes(localName)) {
  throw Error('TEST_ONLY_CONFIG_INVALID');
}
const packageInfo=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
// Original V192/V194 proofs remain pinned to 0.106.0 by default. The
// separate upstream-latest compatibility runner explicitly supplies the
// exact npm/GitHub-verified candidate; a floating version is never accepted.
const expectedVersion=process.env.V192_EXPECTED_LIBSIGNAL_VERSION??'0.106.0';
if (packageInfo.name!=='@signalapp/libsignal-client' || packageInfo.version!==expectedVersion) {
  throw Error('TEST_ONLY_LIBSIGNAL_VERSION_MISMATCH');
}
const Signal=await import(pathToFileURL(join(root,'dist','index.js')).href);
// V194 SYNTHETIC ONLY: Signal E2EE and V191 signed metadata are distinct.
const require=createRequire(import.meta.url);
const {messageSigningBytes}=require('../../../utils/calliope-agent-envelope.cjs');
const {createCalliopeArtifactDescriptorGate}=require('../../../utils/calliope-artifact-descriptor-gate.cjs');
const signer=generateKeyPairSync('ed25519');
const TEST_NOW=1800000000000,TEST_HASH='a'.repeat(64),TEST_SOURCE='c'.repeat(40);
let descriptorGate=null;
const identityKey=(name)=>name+'#1';
const asAddress=(name)=>Signal.ProtocolAddress.new(name,1);
const keyHex=(publicKey)=>Buffer.from(publicKey.serialize()).toString('hex');
const fromHex=(hex)=>Buffer.from(hex,'hex');
const requireHex=(hex,maxBytes=30000)=>{
  if (typeof hex!=='string' || hex.length<2 || hex.length>maxBytes*2 ||
      hex.length%2!==0 || !/^[a-f0-9]+$/.test(hex)) throw Error('INVALID_HEX');
  return fromHex(hex);
};

class Sessions extends Signal.SessionStore {
  constructor(){super();this.records=new Map();}
  async saveSession(address, record){this.records.set(identityKey(address.name()),Buffer.from(record.serialize()));}
  async getSession(address){
    const bytes=this.records.get(identityKey(address.name()));
    return bytes?Signal.SessionRecord.deserialize(bytes):null;
  }
  async getExistingSessions(addresses){
    return Promise.all(addresses.map(async address=>{
      const record=await this.getSession(address);
      if(!record)throw Error('NO_SESSION');
      return record;
    }));
  }
}
class Identities extends Signal.IdentityKeyStore {
  constructor(){
    super();
    this.secret=Signal.PrivateKey.generate();
    this.pinned=new Map();
  }
  async getIdentityKey(){return this.secret;}
  async getLocalRegistrationId(){return localName==='trajectory'?11:localName==='calliope'?23:31;}
  pin(name,key){
    if (name===localName || !['trajectory','calliope','intruder'].includes(name))throw Error('IDENTITY_SCOPE_DENIED');
    const pub=Signal.PublicKey.deserialize(requireHex(key,64));
    const old=this.pinned.get(name);
    if(old && !old.equals(pub))throw Error('IDENTITY_CHANGED');
    this.pinned.set(name,pub);
  }
  async isTrustedIdentity(address,key,_direction){
    return this.pinned.get(address.name())?.equals(key)===true;
  }
  async saveIdentity(address,key){
    if (!(await this.isTrustedIdentity(address,key))) throw Error('UNTRUSTED_IDENTITY');
    return Signal.IdentityChange.NewOrUnchanged;
  }
  async getIdentity(address){return this.pinned.get(address.name())??null;}
  async recordReceivedIdentity(address,key){
    if (!(await this.isTrustedIdentity(address,key)))throw Error('UNTRUSTED_IDENTITY');
  }
}
class PreKeys extends Signal.PreKeyStore {
  constructor(){super();this.records=new Map();}
  async savePreKey(id,record){this.records.set(id,Buffer.from(record.serialize()));}
  async getPreKey(id){
    const bytes=this.records.get(id);if(!bytes)throw Error('PREKEY_UNAVAILABLE');
    return Signal.PreKeyRecord.deserialize(bytes);
  }
  async removePreKey(id){this.records.delete(id);}
}
class SignedPreKeys extends Signal.SignedPreKeyStore {
  constructor(){super();this.records=new Map();}
  async saveSignedPreKey(id,record){this.records.set(id,Buffer.from(record.serialize()));}
  async getSignedPreKey(id){
    const bytes=this.records.get(id);if(!bytes)throw Error('SIGNED_PREKEY_UNAVAILABLE');
    return Signal.SignedPreKeyRecord.deserialize(bytes);
  }
}
class KyberPreKeys extends Signal.KyberPreKeyStore {
  constructor(){super();this.records=new Map();this.used=new Map();}
  async saveKyberPreKey(id,record){this.records.set(id,Buffer.from(record.serialize()));}
  async getKyberPreKey(id){
    const bytes=this.records.get(id);if(!bytes)throw Error('KYBER_PREKEY_UNAVAILABLE');
    return Signal.KyberPreKeyRecord.deserialize(bytes);
  }
  async markKyberPreKeyUsed(id,signedPreKeyId,baseKey){
    const group=id+':'+signedPreKeyId;
    const key=keyHex(baseKey);
    const used=this.used.get(group)??new Set();
    if(used.has(key))throw Error('REUSED_KYBER_BASE_KEY');
    used.add(key);this.used.set(group,used);
  }
  async hasKyberPreKeyBeenUsed(id){return [...this.used.keys()].some(k=>k.startsWith(id+':'));}
}
const session=new Sessions(),identity=new Identities(),prekeys=new PreKeys(),
  signedPrekeys=new SignedPreKeys(),kyberPrekeys=new KyberPreKeys();
const me=asAddress(localName);
const publicSigningKey=signer.publicKey.export({type:'spki',format:'der'}).toString('base64');
const AUTH_FALSE=Object.freeze({ownerApprovalGranted:false,exportAuthorized:false,executionAuthorized:false});
const MESSAGE_FIELDS=['version','sender','recipient','project','purpose','artifactSha256'];
function evaluateMessage(raw,from){
  let msg;
  try{msg=JSON.parse(Buffer.from(raw).toString('utf8'))}catch{return {accepted:false,status:'INTENT_DENIED',...AUTH_FALSE}};
  const correctShape=msg && typeof msg==='object' && !Array.isArray(msg) &&
    Object.keys(msg).sort().join(',')===MESSAGE_FIELDS.slice().sort().join(',');
  const accepted=correctShape && msg.version===1 && msg.sender===from &&
    msg.recipient===localName && msg.project==='demo-studio' &&
    msg.purpose==='artifact.describe' && typeof msg.artifactSha256==='string' &&
    /^[a-f0-9]{64}$/.test(msg.artifactSha256);
  return accepted?{accepted:true,status:'METADATA_ONLY',sender:from,purpose:'artifact.describe',...AUTH_FALSE}:
    {accepted:false,status:'INTENT_DENIED',...AUTH_FALSE};
}
async function createPublicBundle(){
  const privateIdentity=await identity.getIdentityKey();
  const ecPre=Signal.PrivateKey.generate(), signed=Signal.PrivateKey.generate();
  const pq=Signal.KEMKeyPair.generate();
  const preId=71,signedId=72,kyberId=73;
  const signedSig=privateIdentity.sign(signed.getPublicKey().serialize());
  const pqSig=privateIdentity.sign(pq.getPublicKey().serialize());
  await prekeys.savePreKey(preId,Signal.PreKeyRecord.new(preId,ecPre.getPublicKey(),ecPre));
  await signedPrekeys.saveSignedPreKey(signedId,Signal.SignedPreKeyRecord.new(signedId,Date.now(),
    signed.getPublicKey(),signed,signedSig));
  await kyberPrekeys.saveKyberPreKey(kyberId,Signal.KyberPreKeyRecord.new(kyberId,Date.now(),pq,pqSig));
  return {registrationId:await identity.getLocalRegistrationId(),deviceId:1,identityPublic:keyHex(privateIdentity.getPublicKey()),
    preId,prePublic:keyHex(ecPre.getPublicKey()),signedId,signedPublic:keyHex(signed.getPublicKey()),
    signedSig:Buffer.from(signedSig).toString('hex'),kyberId,kyberPublic:Buffer.from(pq.getPublicKey().serialize()).toString('hex'),
    kyberSig:Buffer.from(pqSig).toString('hex')};
}
function readBundle(bundle){
  if(!bundle||typeof bundle!=='object'||Array.isArray(bundle)||
    !Number.isSafeInteger(bundle.registrationId)||bundle.deviceId!==1)return null;
  return Signal.PreKeyBundle.new(bundle.registrationId,bundle.deviceId,bundle.preId,
    Signal.PublicKey.deserialize(requireHex(bundle.prePublic,64)),bundle.signedId,
    Signal.PublicKey.deserialize(requireHex(bundle.signedPublic,64)),requireHex(bundle.signedSig,100),
    Signal.PublicKey.deserialize(requireHex(bundle.identityPublic,64)),bundle.kyberId,
    Signal.KEMPublicKey.deserialize(requireHex(bundle.kyberPublic,4096)),requireHex(bundle.kyberSig,100));
}
async function decryptPacket(from,packet){
  if(from===localName || !identity.pinned.has(from))throw Error('UNAUTHORIZED_SENDER');
  if(!packet||![2,3].includes(packet.messageType))throw Error('BAD_PACKET');
  const raw=requireHex(packet.ciphertext,8192);
  return packet.messageType===3?
    Signal.signalDecryptPreKey(Signal.PreKeySignalMessage.deserialize(raw),
      asAddress(from),me,session,identity,prekeys,signedPrekeys,kyberPrekeys):
    Signal.signalDecrypt(Signal.SignalMessage.deserialize(raw),asAddress(from),me,session,identity);
}
async function encryptMetadata(to,payload){
  if(to===localName || !identity.pinned.has(to))throw Error('UNAUTHORIZED_RECIPIENT');
  const serialized=Buffer.from(JSON.stringify(payload),'utf8');
  if(serialized.length>2048)throw Error('MESSAGE_TOO_LARGE');
  const ciphertext=await Signal.signalEncrypt(serialized,asAddress(to),me,session,identity);
  return {messageType:ciphertext.type(),ciphertext:Buffer.from(ciphertext.serialize()).toString('hex')};
}
async function execute(command){
  const {op,peer,to,from,publicIdentity,bundle,packet,message}=command;
  if(op==='identity')return {pid:process.pid,
    publicIdentity:keyHex((await identity.getIdentityKey()).getPublicKey()),publicSigningKey};
  if(op==='pin'){identity.pin(peer,publicIdentity);return {pinned:true};}
  if(op==='bundle')return await createPublicBundle();
  if(op==='start'){
    if(to===localName || !identity.pinned.has(to)) throw Error('UNKNOWN_RECEIVER');
    // A prekey bundle's public identity must be pinned *before* a session is built.
    if(bundle.identityPublic!==keyHex(identity.pinned.get(to)))throw Error('UNTRUSTED_BUNDLE_IDENTITY');
    await Signal.processPreKeyBundle(readBundle(bundle),asAddress(to),me,session,identity);
    return {sessionInitialized:true};
  }
  if(op==='encrypt')return encryptMetadata(to,message);
  if(op==='decrypt')return evaluateMessage(await decryptPacket(from,packet),from);
  // V194 ONLY: The coordinator is the synthetic, independently trusted enrollment
  // fixture. It can install a PUBLIC signing identity, not a private key or grant
  // obtained from the encrypted client. The grant and manifest are test constants.
  if(op==='configure-describe'){
    if(localName!=='calliope'||descriptorGate!==null||
       typeof command.trustedSenderPublicKey!=='string'||
       typeof command.withGrant!=='boolean')throw Error('TEST_DESCRIPTOR_CONFIG_DENIED');
    const pk=createPublicKey({key:Buffer.from(command.trustedSenderPublicKey,'base64'),
      format:'der',type:'spki'});
    descriptorGate=createCalliopeArtifactDescriptorGate({
      identities:{trajectory:{publicKey:pk,projects:['demo-studio']}},
      artifacts:[{project:'demo-studio',artifactSha256:TEST_HASH,
        sourceCommit:TEST_SOURCE,mediaType:'image/png',byteLength:12800,
        capturedAtMs:TEST_NOW-1000}],
      trustedGrants:command.withGrant?[{sender:'trajectory',project:'demo-studio',
        purpose:'artifact.describe',artifactSha256:TEST_HASH,sourceCommit:TEST_SOURCE,
        issuedAtMs:TEST_NOW-1000,expiresAtMs:TEST_NOW+10000}]:[],
      now:()=>TEST_NOW
    });
    return {configured:true,ownerConsentProven:false,exportAuthorized:false};
  }
  if(op==='encrypt-signed-describe'){
    if(localName!=='trajectory'||to!=='calliope')throw Error('TEST_SIGNER_DENIED');
    const signed={version:1,audience:'devproxy.calliope.agent.v1',
      sender:'trajectory',project:'demo-studio',
      purpose:command.purpose??'artifact.describe',
      artifactSha256:command.artifactSha256??TEST_HASH,
      issuedAtMs:TEST_NOW-500,expiresAtMs:TEST_NOW+20000,
      nonce:command.nonce??randomBytes(32).toString('base64url')};
    let signature=edSign(null,messageSigningBytes(signed),signer.privateKey).toString('base64url');
    if(command.tamperSignature===true)signature=signature.slice(0,-1)+(signature.at(-1)==='A'?'B':'A');
    const envelope={...signed,signature};
    if(command.ownerApproved===true)envelope.ownerApproved=true;
    return encryptMetadata(to,envelope);
  }
  if(op==='decrypt-and-describe'){
    if(localName!=='calliope'||!descriptorGate)throw Error('NO_TRUSTED_DESCRIPTOR_FIXTURE');
    const plain=await decryptPacket(from,packet);
    if(plain.length>2048)throw Error('SIGNED_MESSAGE_TOO_LARGE');
    let msg;try{msg=JSON.parse(Buffer.from(plain).toString('utf8'));}
    catch{throw Error('INVALID_ENCRYPTED_MESSAGE');}
    // The test-only recipient decrypts and verifies inside the Calliope OS
    // process. Neither plaintext nor private key is returned to the relay.
    return descriptorGate.describe(msg);
  }
  throw Error('OPERATION_NOT_ALLOWED');
}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let sequential=Promise.resolve();
input.on('line',line=>{
  sequential=sequential.then(async()=>{
    let request;
    try{
      request=JSON.parse(line);
      if(typeof request.id!=='string'||request.id.length>80)throw Error('INVALID_ID');
      const result=await execute(request);
      process.stdout.write(JSON.stringify({id:request.id,ok:true,result})+'\n');
    }catch{
      process.stdout.write(JSON.stringify({id:request?.id??null,ok:false,error:'PEER_REQUEST_REJECTED'})+'\n');
    }
  });
});
