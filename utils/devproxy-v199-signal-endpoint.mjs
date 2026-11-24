/**
 * Node 24 libsignal endpoint for the owner pilot.
 * Private identity material stays inside the sealed store. The mailbox sees ciphertext only.
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sealedStore from './devproxy-v200-atomic-sealed-store.cjs';
const {readPrivateSealedStore,writePrivateSealedStore}=sealedStore;
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const INTENT=Object.freeze(['intent','nonce','sentAtMs','version']);
const RESULT=Object.freeze(['executable','intent','observedAtMs','source','summary','version']);

function sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}
function seal(key,plaintext){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]);
}
function openSeal(key,blob){
  const iv=blob.subarray(0,12);
  const tag=blob.subarray(12,28);
  const body=blob.subarray(28);
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body),decipher.final()]);
}
function exactKeys(value,fields){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const keys=Object.keys(value).sort();
  return keys.length===fields.length&&fields.slice().sort().every((name,index)=>keys[index]===name);
}
function boundedSummary(summary){
  if(!summary||typeof summary!=='object'||Array.isArray(summary))return null;
  const keys=Object.keys(summary);
  if(keys.length<1||keys.length>6)return null;
  const out={};
  for(const key of keys){
    if(!/^[a-z][a-z0-9]{0,24}$/.test(key))return null;
    const value=summary[key];
    if(typeof value==='string'){
      if(value.length>80)return null;
      out[key]=value;
    }else if(typeof value==='boolean'||(Number.isSafeInteger(value)&&value>=0&&value<100000)){
      out[key]=value;
    }else return null;
  }
  return out;
}

export async function createSignalEndpoint({
  role,storePath,sealingKey,packageRoot,expectedVersion,now=Date.now,readPublicHealth
}){
  if(role!=='trajectory'&&role!=='calliope')throw Error('ENDPOINT_ROLE_DENIED');
  if(!Buffer.isBuffer(sealingKey)||sealingKey.length!==32)throw Error('ENDPOINT_KEY_DENIED');
  const info=JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
  if(info.name!=='@signalapp/libsignal-client'||info.version!==expectedVersion||info.license!=='AGPL-3.0-only')
    throw Error('LIBSIGNAL_PIN_MISMATCH');
  const Signal=await import(pathToFileURL(join(packageRoot,'dist','index.js')).href);
  const peer=role==='trajectory'?'calliope':'trajectory';
  const previousSealedStore=readPrivateSealedStore(storePath);
  let state=previousSealedStore?JSON.parse(openSeal(sealingKey,previousSealedStore).toString('utf8')):{
    version:1,role,revoked:false,identity:null,pinned:null,sessions:{},prekeys:{},signed:{},kyber:{},
    kyberUsed:{},seen:[]
  };
  if(state.role!==role||state.version!==1)throw Error('ENDPOINT_STORE_MISMATCH');
  function persist(){
    const blob=seal(sealingKey,Buffer.from(JSON.stringify(state)));
    // V200: never truncate the last durable session/prekey state in place.
    // Exclusive writer lock + fsynced temp + atomic rename + dir fsync.
    writePrivateSealedStore(storePath,blob);
  }
  const identitySecret=state.identity?Signal.PrivateKey.deserialize(Buffer.from(state.identity,'base64')):Signal.PrivateKey.generate();
  if(!state.identity){state.identity=Buffer.from(identitySecret.serialize()).toString('base64');persist();}
  const sessions=new Map(Object.entries(state.sessions).map(([k,v])=>[k,Buffer.from(v,'base64')]));
  const prekeys=new Map(Object.entries(state.prekeys).map(([k,v])=>[Number(k),Buffer.from(v,'base64')]));
  const signed=new Map(Object.entries(state.signed).map(([k,v])=>[Number(k),Buffer.from(v,'base64')]));
  const kyber=new Map(Object.entries(state.kyber).map(([k,v])=>[Number(k),Buffer.from(v,'base64')]));
  const kyberUsed=new Map(Object.entries(state.kyberUsed).map(([k,v])=>[k,new Set(v)]));
  let pinned=state.pinned?Signal.PublicKey.deserialize(Buffer.from(state.pinned,'hex')):null;
  class Sessions extends Signal.SessionStore {
    async saveSession(address,record){sessions.set(address.name(),Buffer.from(record.serialize()));}
    async getSession(address){const b=sessions.get(address.name());return b?Signal.SessionRecord.deserialize(b):null;}
    async getExistingSessions(addresses){
      return Promise.all(addresses.map(async address=>{
        const record=await this.getSession(address);
        if(!record)throw Error('NO_SESSION');
        return record;
      }));
    }
  }
  class Identities extends Signal.IdentityKeyStore {
    async getIdentityKey(){return identitySecret;}
    async getLocalRegistrationId(){return role==='trajectory'?11:23;}
    async isTrustedIdentity(address,key){return address.name()===peer&&pinned!==null&&pinned.equals(key);}
    async getIdentity(address){return address.name()===peer?pinned:null;}
    async saveIdentity(address,key){
      if(!(await this.isTrustedIdentity(address,key)))throw Error('UNTRUSTED_IDENTITY');
      return Signal.IdentityChange.NewOrUnchanged;
    }
    async recordReceivedIdentity(){return undefined;}
  }
  class PreKeys extends Signal.PreKeyStore {
    async savePreKey(id,record){prekeys.set(id,Buffer.from(record.serialize()));}
    async getPreKey(id){const b=prekeys.get(id);if(!b)throw Error('PREKEY_UNAVAILABLE');return Signal.PreKeyRecord.deserialize(b);}
    async removePreKey(id){prekeys.delete(id);}
  }
  class SignedPreKeys extends Signal.SignedPreKeyStore {
    async saveSignedPreKey(id,record){signed.set(id,Buffer.from(record.serialize()));}
    async getSignedPreKey(id){const b=signed.get(id);if(!b)throw Error('SIGNED_PREKEY_UNAVAILABLE');return Signal.SignedPreKeyRecord.deserialize(b);}
  }
  class KyberPreKeys extends Signal.KyberPreKeyStore {
    async saveKyberPreKey(id,record){kyber.set(id,Buffer.from(record.serialize()));}
    async getKyberPreKey(id){const b=kyber.get(id);if(!b)throw Error('KYBER_PREKEY_UNAVAILABLE');return Signal.KyberPreKeyRecord.deserialize(b);}
    async markKyberPreKeyUsed(id,signedPreKeyId,baseKey){
      const group=id+':'+signedPreKeyId;
      const hex=Buffer.from(baseKey.serialize()).toString('hex');
      const used=kyberUsed.get(group)??new Set();
      if(used.has(hex))throw Error('REUSED_KYBER_BASE_KEY');
      used.add(hex);kyberUsed.set(group,used);
    }
    async hasKyberPreKeyBeenUsed(id){return [...kyberUsed.keys()].some(k=>k.startsWith(id+':'));}
  }
  const me=Signal.ProtocolAddress.new(role,1);
  const stores={session:new Sessions(),identity:new Identities(),pre:new PreKeys(),signed:new SignedPreKeys(),kyber:new KyberPreKeys()};
  function checkpoint(){
    if(state.revoked)throw Error('ENDPOINT_REVOKED');
    state.sessions=Object.fromEntries([...sessions].map(([k,v])=>[k,v.toString('base64')]));
    state.prekeys=Object.fromEntries([...prekeys].map(([k,v])=>[String(k),v.toString('base64')]));
    state.signed=Object.fromEntries([...signed].map(([k,v])=>[String(k),v.toString('base64')]));
    state.kyber=Object.fromEntries([...kyber].map(([k,v])=>[String(k),v.toString('base64')]));
    state.kyberUsed=Object.fromEntries([...kyberUsed].map(([k,v])=>[k,[...v]]));
    state.pinned=pinned?Buffer.from(pinned.serialize()).toString('hex'):null;
    persist();
  }
  function requireActive(){if(state.revoked)throw Error('ENDPOINT_REVOKED');}
  function identityPublicHex(){
    return Buffer.from(identitySecret.getPublicKey().serialize()).toString('hex');
  }
  async function identitySha256(){
    return sha256(identitySecret.getPublicKey().serialize());
  }
  async function publicBundle(){
    requireActive();
    const ec=Signal.PrivateKey.generate();
    const signedKey=Signal.PrivateKey.generate();
    const pq=Signal.KEMKeyPair.generate();
    const signedSig=identitySecret.sign(signedKey.getPublicKey().serialize());
    const pqSig=identitySecret.sign(pq.getPublicKey().serialize());
    await stores.pre.savePreKey(71,Signal.PreKeyRecord.new(71,ec.getPublicKey(),ec));
    await stores.signed.saveSignedPreKey(72,Signal.SignedPreKeyRecord.new(72,now(),signedKey.getPublicKey(),signedKey,signedSig));
    await stores.kyber.saveKyberPreKey(73,Signal.KyberPreKeyRecord.new(73,now(),pq,pqSig));
    checkpoint();
    return {
      registrationId:role==='trajectory'?11:23,deviceId:1,
      identityPublic:Buffer.from(identitySecret.getPublicKey().serialize()).toString('hex'),
      preId:71,prePublic:Buffer.from(ec.getPublicKey().serialize()).toString('hex'),
      signedId:72,signedPublic:Buffer.from(signedKey.getPublicKey().serialize()).toString('hex'),
      signedSig:Buffer.from(signedSig).toString('hex'),
      kyberId:73,kyberPublic:Buffer.from(pq.getPublicKey().serialize()).toString('hex'),
      kyberSig:Buffer.from(pqSig).toString('hex')
    };
  }
  function pinPeer(identityHex){
    requireActive();
    const next=Signal.PublicKey.deserialize(Buffer.from(identityHex,'hex'));
    if(pinned&&!pinned.equals(next))throw Error('IDENTITY_CHANGED');
    pinned=next;
    checkpoint();
  }
  async function acceptPeerBundle(bundle){
    requireActive();
    if(!pinned||Buffer.from(pinned.serialize()).toString('hex')!==bundle.identityPublic)
      throw Error('UNTRUSTED_BUNDLE_IDENTITY');
    const built=Signal.PreKeyBundle.new(
      bundle.registrationId,bundle.deviceId,bundle.preId,
      Signal.PublicKey.deserialize(Buffer.from(bundle.prePublic,'hex')),bundle.signedId,
      Signal.PublicKey.deserialize(Buffer.from(bundle.signedPublic,'hex')),Buffer.from(bundle.signedSig,'hex'),
      Signal.PublicKey.deserialize(Buffer.from(bundle.identityPublic,'hex')),bundle.kyberId,
      Signal.KEMPublicKey.deserialize(Buffer.from(bundle.kyberPublic,'hex')),Buffer.from(bundle.kyberSig,'hex')
    );
    await Signal.processPreKeyBundle(built,Signal.ProtocolAddress.new(peer,1),me,stores.session,stores.identity);
    checkpoint();
  }
  async function encryptJson(payload){
    requireActive();
    const bytes=Buffer.from(JSON.stringify(payload),'utf8');
    if(bytes.length>2048)throw Error('MESSAGE_TOO_LARGE');
    const ciphertext=await Signal.signalEncrypt(bytes,Signal.ProtocolAddress.new(peer,1),me,stores.session,stores.identity);
    checkpoint();
    return {messageType:ciphertext.type(),ciphertext:Buffer.from(ciphertext.serialize()).toString('base64url')};
  }
  async function decryptRaw(packet){
    requireActive();
    if(!pinned||!packet||![2,3].includes(packet.messageType))throw Error('BAD_PACKET');
    const raw=Buffer.from(packet.ciphertext,'base64url');
    const address=Signal.ProtocolAddress.new(peer,1);
    const plain=packet.messageType===3
      ?await Signal.signalDecryptPreKey(Signal.PreKeySignalMessage.deserialize(raw),address,me,stores.session,stores.identity,stores.pre,stores.signed,stores.kyber)
      :await Signal.signalDecrypt(Signal.SignalMessage.deserialize(raw),address,me,stores.session,stores.identity);
    return Buffer.from(plain);
  }
  async function sendProxyStatus(){
    if(role!=='trajectory')throw Error('SENDER_ROLE_REQUIRED');
    const nonce=randomBytes(32).toString('hex');
    const packet=await encryptJson({version:1,intent:'proxy.status',nonce,sentAtMs:now()});
    return {nonce,packet};
  }
  async function receiveProxyStatus(packet){
    if(role!=='calliope'||typeof readPublicHealth!=='function')throw Error('RECIPIENT_ROLE_REQUIRED');
    const plain=JSON.parse((await decryptRaw(packet)).toString('utf8'));
    if(!exactKeys(plain,INTENT)||plain.version!==1||plain.intent!=='proxy.status'||
       typeof plain.nonce!=='string'||!/^[a-f0-9]{64}$/.test(plain.nonce)||
       !Number.isSafeInteger(plain.sentAtMs))throw Error('STATUS_INTENT_DENIED');
    if(state.seen.includes(plain.nonce))throw Error('STATUS_REPLAY');
    const health=await readPublicHealth();
    const summary=boundedSummary(health);
    if(!summary)throw Error('HEALTH_SUMMARY_DENIED');
    state.seen.push(plain.nonce);
    if(state.seen.length>256)state.seen.shift();
    const reply=await encryptJson({
      version:1,intent:'proxy.status.result',executable:false,
      observedAtMs:now(),source:'devproxy.api.ai.health',summary
    });
    return {ackAfterDurable:true,reply};
  }
  async function readProxyStatus(packet){
    if(role!=='trajectory')throw Error('SENDER_ROLE_REQUIRED');
    const plain=JSON.parse((await decryptRaw(packet)).toString('utf8'));
    const summary=boundedSummary(plain.summary);
    if(!exactKeys(plain,RESULT)||plain.version!==1||plain.intent!=='proxy.status.result'||
       plain.executable!==false||plain.source!=='devproxy.api.ai.health'||
       !Number.isSafeInteger(plain.observedAtMs)||!summary)throw Error('STATUS_RESULT_DENIED');
    checkpoint();
    return {executable:false,source:plain.source,observedAtMs:plain.observedAtMs,summary};
  }
  function revoke(){state.revoked=true;persist();}
  return Object.freeze({
    identityPublicHex,identitySha256,publicBundle,pinPeer,acceptPeerBundle,sendProxyStatus,
    receiveProxyStatus,readProxyStatus,revoke
  });
}
