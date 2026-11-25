'use strict';
/**
 * Live V199 device proof. A request header that names a peer is not identity.
 * The enrolled transport public key must verify this exact request.
 */
const crypto=require('node:crypto');
const DOMAIN='DEVPROXY-V199-DEVICE-PROOF-V1\n';
const SHA=/^[a-f0-9]{64}$/;

function proofMessage({method,pathname,body,time,nonce,deviceId}){
  const hash=crypto.createHash('sha256').update(body||Buffer.alloc(0)).digest('hex');
  return Buffer.from(DOMAIN+method+'\n'+pathname+'\n'+hash+'\n'+time+'\n'+nonce+'\n'+deviceId,'utf8');
}
function deviceIdForSpki(spkiBase64){
  const der=Buffer.from(spkiBase64,'base64');
  return crypto.createHash('sha256').update(der).digest('hex');
}
function createTransportIdentity(){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  const spki=publicKey.export({format:'der',type:'spki'}).toString('base64');
  const pkcs8=privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
  return Object.freeze({
    deviceId:deviceIdForSpki(spki),
    transportPublicKeySpki:spki,
    transportPrivateKeyPkcs8:pkcs8
  });
}
function signDeviceProof({privateKeyPkcs8,method,pathname,body,time,nonce,deviceId}){
  const key=crypto.createPrivateKey({key:Buffer.from(privateKeyPkcs8,'base64'),format:'der',type:'pkcs8'});
  const message=proofMessage({method,pathname,body,time,nonce,deviceId});
  return crypto.sign(null,message,key).toString('base64url');
}
function headerValue(headers,name){
  if(!headers||typeof headers!=='object')return undefined;
  const value=headers[name];
  return Array.isArray(value)?value[0]:value;
}
function verifyDeviceProof({method,pathname,body,headers,lookup,now,consumeNonce}){
  if(headerValue(headers,'x-devproxy-signal-peer')!==undefined)return null;
  const deviceId=headerValue(headers,'x-devproxy-device-id');
  const nonce=headerValue(headers,'x-devproxy-device-nonce');
  const time=headerValue(headers,'x-devproxy-device-time');
  const sig=headerValue(headers,'x-devproxy-device-sig');
  if(typeof deviceId!=='string'||!SHA.test(deviceId))return null;
  if(typeof nonce!=='string'||!SHA.test(nonce))return null;
  if(typeof time!=='string'||!/^[0-9]{13}$/.test(time))return null;
  if(typeof sig!=='string'||!/^[A-Za-z0-9_-]{80,120}$/.test(sig))return null;
  const at=Number(time);
  let current;
  try{current=now();}catch{return null;}
  if(!Number.isSafeInteger(current)||Math.abs(current-at)>60000)return null;
  const record=lookup(deviceId);
  if(!record||record.revoked===true)return null;
  let ok=false;
  try{
    const key=crypto.createPublicKey({
      key:Buffer.from(record.transportPublicKeySpki,'base64'),format:'der',type:'spki'
    });
    ok=crypto.verify(null,proofMessage({method,pathname,body,time,nonce,deviceId}),key,Buffer.from(sig,'base64url'));
  }catch{return null;}
  if(ok!==true)return null;
  try{
    if(consumeNonce(deviceId,nonce,at)!==true)return null;
  }catch{return null;}
  return record;
}
module.exports=Object.freeze({
  createTransportIdentity,signDeviceProof,verifyDeviceProof,deviceIdForSpki,proofMessage
});
