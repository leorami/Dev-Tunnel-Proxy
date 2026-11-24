'use strict';
/**
 * Public enrollment registry only. Private keys never enter this directory.
 */
const fs=require('node:fs');
const path=require('node:path');
const SHA=/^[a-f0-9]{64}$/;
const ROLES=new Set(['trajectory','calliope']);

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
function readJson(file){
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{
    const st=fs.fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600)throw Error('UNSAFE_ENROLLMENT_FILE');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  }finally{fs.closeSync(fd);}
}
function writeJson(file,value){
  const tmp=file+'.tmp';
  const fd=fs.openSync(tmp,fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{
    fs.writeFileSync(fd,JSON.stringify(value));
    fs.fsyncSync(fd);
  }finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
}
function validRecord(record){
  return !!record&&record.version===1&&ROLES.has(record.role)&&
    typeof record.deviceId==='string'&&SHA.test(record.deviceId)&&
    typeof record.transportPublicKeySpki==='string'&&record.transportPublicKeySpki.length>40&&
    typeof record.signalIdentitySha256==='string'&&SHA.test(record.signalIdentitySha256)&&
    typeof record.peerSignalIdentitySha256==='string'&&SHA.test(record.peerSignalIdentitySha256)&&
    (record.revoked===false||record.revoked===true);
}
function openEnrollmentRegistry(directory){
  assertPrivateDir(directory);
  const file=path.join(directory,'enrollment.json');
  const nonceFile=path.join(directory,'nonces.json');
  function load(){
    if(!fs.existsSync(file))return [];
    const parsed=readJson(file);
    if(!parsed||parsed.version!==1||!Array.isArray(parsed.devices))throw Error('UNSAFE_ENROLLMENT_FILE');
    return parsed.devices.filter(validRecord);
  }
  function save(devices){
    writeJson(file,{version:1,devices});
  }
  function lookup(deviceId){
    return load().find((item)=>item.deviceId===deviceId)||null;
  }
  function enroll(record){
    if(!validRecord(record)||record.revoked!==false)throw Error('INVALID_ENROLLMENT_RECORD');
    const devices=load().filter((item)=>item.deviceId!==record.deviceId&&item.role!==record.role);
    devices.push({
      version:1,role:record.role,deviceId:record.deviceId,
      transportPublicKeySpki:record.transportPublicKeySpki,
      signalIdentitySha256:record.signalIdentitySha256,
      peerSignalIdentitySha256:record.peerSignalIdentitySha256,
      revoked:false
    });
    save(devices);
  }
  function revoke(deviceId){
    const devices=load();
    const found=devices.find((item)=>item.deviceId===deviceId);
    if(!found)return false;
    found.revoked=true;
    save(devices);
    return true;
  }
  function role(name){
    const matches=load().filter((item)=>item.role===name&&item.revoked!==true);
    return matches.length===1?matches[0]:null;
  }
  function consumeNonce(deviceId,nonce,at){
    let used=[];
    if(fs.existsSync(nonceFile)){
      const parsed=readJson(nonceFile);
      if(!parsed||!Array.isArray(parsed.used))return false;
      used=parsed.used;
    }
    const fresh=used.filter((item)=>item&&Number.isSafeInteger(item.exp)&&item.exp>at-120000);
    if(fresh.some((item)=>item.deviceId===deviceId&&item.nonce===nonce))return false;
    fresh.push({deviceId,nonce,exp:at+120000});
    if(fresh.length>4096)return false;
    writeJson(nonceFile,{version:1,used:fresh});
    return true;
  }
  return Object.freeze({lookup,enroll,revoke,role,consumeNonce});
}
module.exports=Object.freeze({openEnrollmentRegistry});
