'use strict';
/**
 * Owner-private public-identity registry and device-request replay arbiter.
 * Never accept an arbitrary user-supplied key/name identity binding.
 * Nonce reservations are O_EXCL + fsynced (same principle as V196), not a
 * shared JSON read-modify-write race. All grant approvals are STILL separate.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {deviceIdForSpki}=require('./devproxy-v199-device-proof.cjs');
const {readPrivateSealedStore,writePrivateSealedStore}=
  require('./devproxy-v200-atomic-sealed-store.cjs');
const SHA=/^[a-f0-9]{64}$/;
const NONCE_FILE=/^[a-f0-9]{64}\.nonce$/;
const ROLES=new Set(['trajectory','calliope']);
const MAX_NONCES=32768;
function assertPrivateDir(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||path.normalize(directory)!==directory)
  throw Error('INVALID_ENROLLMENT_DIRECTORY');
 if(directory.includes(`${path.sep}.artifacts${path.sep}`)||directory.endsWith(`${path.sep}.artifacts`))
  throw Error('INVALID_ENROLLMENT_DIRECTORY');
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700)
  throw Error('INVALID_ENROLLMENT_DIRECTORY');
 if(typeof process.getuid==='function'&&stat.uid!==process.getuid())
  throw Error('INVALID_ENROLLMENT_DIRECTORY');
 if(fs.realpathSync(directory)!==directory)throw Error('INVALID_ENROLLMENT_DIRECTORY');
}
function validRecord(record){
 if(!record||record.version!==1||!ROLES.has(record.role)||
    typeof record.deviceId!=='string'||!SHA.test(record.deviceId)||
    typeof record.transportPublicKeySpki!=='string'||record.transportPublicKeySpki.length>1000||
    typeof record.signalIdentitySha256!=='string'||!SHA.test(record.signalIdentitySha256)||
    typeof record.peerSignalIdentitySha256!=='string'||!SHA.test(record.peerSignalIdentitySha256)||
    (record.revoked!==false&&record.revoked!==true))return false;
 try{
  const bytes=Buffer.from(record.transportPublicKeySpki,'base64');
  const pub=crypto.createPublicKey({key:bytes,format:'der',type:'spki'});
  if(pub.asymmetricKeyType!=='ed25519')return false;
  if(pub.export({format:'der',type:'spki'}).toString('base64')!==record.transportPublicKeySpki)return false;
  return deviceIdForSpki(record.transportPublicKeySpki)===record.deviceId;
 }catch{return false;}
}
function openEnrollmentRegistry(directory){
 assertPrivateDir(directory);
 const file=path.join(directory,'enrollment.json');
 // Created explicitly during owner-visible provisioning of existing 0700
 // enrollment directory. Missing directory denies; never auto-create.
 const nonceDir=path.join(directory,'proof-nonces');
 function load(){
  let raw;
  try{raw=readPrivateSealedStore(file);}
  catch{throw Error('UNSAFE_ENROLLMENT_FILE');}
  if(raw===null)return [];
  let parsed;
  try{parsed=JSON.parse(raw.toString('utf8'));}
  catch{throw Error('UNSAFE_ENROLLMENT_FILE');}
  if(!parsed||parsed.version!==1||!Array.isArray(parsed.devices)||
     parsed.devices.length>16||parsed.devices.some(record=>!validRecord(record)))
   throw Error('UNSAFE_ENROLLMENT_FILE');
  const devices=new Set(),roles=new Set();
  for(const record of parsed.devices){
   if(devices.has(record.deviceId)||roles.has(record.role))
    throw Error('UNSAFE_ENROLLMENT_FILE');
   devices.add(record.deviceId);roles.add(record.role);
  }
  return parsed.devices;
 }
 function save(devices){
  if(devices.some(record=>!validRecord(record)))throw Error('ENROLLMENT_IDENTITY_BINDING');
  writePrivateSealedStore(file,Buffer.from(JSON.stringify({version:1,devices}),'utf8'));
 }
 function lookup(deviceId){
  if(typeof deviceId!=='string'||!SHA.test(deviceId))return null;
  return load().find(item=>item.deviceId===deviceId)||null;
 }
 function enroll(record){
  if(!validRecord(record))throw Error('ENROLLMENT_IDENTITY_BINDING');
  if(record.revoked!==false)throw Error('INVALID_ENROLLMENT_RECORD');
  const before=load();
  const active=before.find(item=>item.role===record.role&&!item.revoked);
  if(active&&(active.deviceId!==record.deviceId||
      active.transportPublicKeySpki!==record.transportPublicKeySpki||
      active.signalIdentitySha256!==record.signalIdentitySha256||
      active.peerSignalIdentitySha256!==record.peerSignalIdentitySha256))
   throw Error('ENROLLMENT_REQUIRES_OWNER_REVOKE');
  const devices=before.filter(item=>item.deviceId!==record.deviceId&&item.role!==record.role);
  devices.push({
   version:1,role:record.role,deviceId:record.deviceId,
   transportPublicKeySpki:record.transportPublicKeySpki,
   signalIdentitySha256:record.signalIdentitySha256,
   peerSignalIdentitySha256:record.peerSignalIdentitySha256,revoked:false
  });
  save(devices);
 }
 function revoke(deviceId){
  const devices=load();
  const found=devices.find(item=>item.deviceId===deviceId);
  if(!found)return false;
  found.revoked=true;save(devices);return true;
 }
 function role(name){
  const matches=load().filter(item=>item.role===name&&!item.revoked);
  return matches.length===1?matches[0]:null;
 }
 function consumeNonce(deviceId,nonce,at){
  if(typeof deviceId!=='string'||!SHA.test(deviceId)||
     typeof nonce!=='string'||!SHA.test(nonce)||
     !Number.isSafeInteger(at)||at<=0)return false;
  let fd;
  try{
   assertPrivateDir(nonceDir);
   const names=fs.readdirSync(nonceDir);
   if(names.length>=MAX_NONCES||names.some(n=>!NONCE_FILE.test(n)))return false;
   const digest=crypto.createHash('sha256').update(
     'DEVPROXY-DEVICE-REPLAY-V200\n'+deviceId+'\0'+nonce,'utf8'
   ).digest('hex');
   fd=fs.openSync(path.join(nonceDir,digest+'.nonce'),
     fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   const st=fs.fstatSync(fd);
   if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600||
      (typeof process.getuid==='function'&&st.uid!==process.getuid()))return false;
   fs.writeFileSync(fd,'V200\n'+String(at)+'\n','utf8');
   fs.fsyncSync(fd);
   fs.closeSync(fd);fd=undefined;
   const root=fs.openSync(nonceDir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
   try{fs.fsyncSync(root);}finally{fs.closeSync(root);}
   return true;
  }catch{return false;}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 return Object.freeze({lookup,enroll,revoke,role,consumeNonce});
}
module.exports=Object.freeze({openEnrollmentRegistry});
