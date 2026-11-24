'use strict';
/**
 * Owner-private opaque Signal ciphertext mailbox. SOURCE implementation
 * only: no live listener, no nginx route, no auto-created user tree.
 * Caller must pass an already existing 0700 directory outside .artifacts.
 * Duplicate messageId/payload cannot create a second delivery. Messages
 * remain until a recipient ack is fsynced; crash without ack is replayable.
 * This is not a V196 nonce ledger, ratchet store, or grant issuer.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const BRAND=new WeakSet();
const NAME=/^[a-z][a-z0-9-]{0,47}$/;
const SHA=/^[a-f0-9]{64}$/;
const B64=/^[A-Za-z0-9_-]+$/;
const MSG=/^[a-f0-9]{64}\.msg$/;
const ACK=/^[a-f0-9]{64}\.ack$/;
const DOMAIN='DEVPROXY-PRIVATE-SIGNAL-MAILBOX-V1\n';
const FLAGS=Object.freeze({ownerApprovalGranted:false,exportAuthorized:false,
 executionAuthorized:false,healingPerformed:false,liveAttested:false,
 productionChangeAuthorized:false});
const DENY=Object.freeze({ok:false,status:'PRIVATE_MAILBOX_DENIED',...FLAGS});
const CANDIDATE=['ok','status','sender','recipient','project','messageId',
 'signalMessageType','ciphertextBase64url','byteLength',
 'ownerApprovalGranted','exportAuthorized','executionAuthorized',
 'healingPerformed','liveAttested','productionChangeAuthorized'];
function exact(input,fields){
 try{
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.getPrototypeOf(input)!==Object.prototype||
     Reflect.ownKeys(input).length!==fields.length)return null;
  const out=Object.create(null);
  for(const name of fields){
   const d=Object.getOwnPropertyDescriptor(input,name);
   if(!d||!Object.hasOwn(d,'value'))return null;
   out[name]=d.value;
  }
  return out;
 }catch{return null;}
}
function deny(status){
 return Object.freeze({ok:false,status,...FLAGS});
}
function validateDirectory(directory){
 if(typeof directory!=='string'||directory.length<2||directory.length>2048||
    !path.isAbsolute(directory)||path.normalize(directory)!==directory||
    directory==='/'||directory.endsWith(path.sep)||
    /[\x00-\x1f\x7f]/.test(directory)||
    directory.includes(`${path.sep}.artifacts${path.sep}`)||
    directory.endsWith(`${path.sep}.artifacts`))
  throw Error('INVALID_MAILBOX_DIRECTORY');
 try{
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||
     (stat.mode&0o777)!==0o700||
     (typeof process.getuid==='function'&&stat.uid!==process.getuid())||
     fs.realpathSync(directory)!==directory)throw Error('INVALID_MAILBOX_DIRECTORY');
  return {dev:stat.dev,ino:stat.ino};
 }catch{throw Error('INVALID_MAILBOX_DIRECTORY');}
}
function listSafe(directory,expected){
 const current=validateDirectory(directory);
 if(current.dev!==expected.dev||current.ino!==expected.ino)
  throw Error('INVALID_MAILBOX_DIRECTORY');
 const names=fs.readdirSync(directory);
 if(names.some(name=>!MSG.test(name)&&!ACK.test(name)))
  throw Error('UNSAFE_MAILBOX_ENTRY');
 return names;
}
function payloadDigest(bytes){
 return crypto.createHash('sha256').update(bytes).digest('hex');
}
function readMsg(directory,name){
 const target=path.join(directory,name);
 let fd;
 try{
  fd=fs.openSync(target,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==0o600||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))
   throw Error('UNSAFE_MAILBOX_ENTRY');
  const raw=fs.readFileSync(fd);
  if(!raw.toString('utf8').startsWith(DOMAIN))throw Error('UNSAFE_MAILBOX_ENTRY');
  const parsed=JSON.parse(raw.slice(Buffer.byteLength(DOMAIN)).toString('utf8'));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
   throw Error('UNSAFE_MAILBOX_ENTRY');
  return parsed;
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function readAckDigest(directory,name){
 const target=path.join(directory,name);
 const raw=fs.readFileSync(target,'utf8');
 const m=/^V1\n([a-f0-9]{64})\n$/.exec(raw);
 if(!m)throw Error('UNSAFE_MAILBOX_ENTRY');
 return m[1];
}
function fsyncDir(directory){
 const rootFd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY);
 try{fs.fsyncSync(rootFd);}finally{fs.closeSync(rootFd);}
}
function writeExclusive(directory,filename,body,mode){
 const target=path.join(directory,filename);
 let fd;
 try{
  fd=fs.openSync(target,fs.constants.O_CREAT|fs.constants.O_EXCL|
    fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,mode);
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||(st.mode&0o777)!==mode||
     (typeof process.getuid==='function'&&st.uid!==process.getuid()))
   throw Error('UNSAFE_MAILBOX_ENTRY');
  fs.writeFileSync(fd,body);
  fs.fsyncSync(fd);
 }finally{if(fd!==undefined)fs.closeSync(fd);}
 fsyncDir(directory);
}
function createPrivateSignalMailbox({
 directory,now=Date.now,maxMessages=64,maxMessageBytes=32768,
 maxTotalBytes=262144
}={}){
 if(typeof now!=='function'||
    !Number.isSafeInteger(maxMessages)||maxMessages<1||maxMessages>256||
    !Number.isSafeInteger(maxMessageBytes)||maxMessageBytes<256||
    maxMessageBytes>65536||
    !Number.isSafeInteger(maxTotalBytes)||maxTotalBytes<maxMessageBytes||
    maxTotalBytes>1048576)throw Error('INVALID_MAILBOX_CAPACITY');
 const expected=validateDirectory(directory);
 function occupied(names){
  let bytes=0,messages=0;
  const payloads=new Set();
  for(const name of names){
   if(MSG.test(name)){
    messages+=1;
    const st=fs.lstatSync(path.join(directory,name));
    if(st.isSymbolicLink()||!st.isFile())throw Error('UNSAFE_MAILBOX_ENTRY');
    bytes+=st.size;
    const rec=readMsg(directory,name);
    if(typeof rec.payloadSha256==='string'&&SHA.test(rec.payloadSha256))
     payloads.add(rec.payloadSha256);
   }else if(ACK.test(name)){
    payloads.add(readAckDigest(directory,name));
   }
  }
  return {bytes,messages,payloads,files:names.length};
 }
 function enqueue(input){
  const p=exact(input,CANDIDATE);
  if(!p||p.ok!==true||p.status!=='PRIVATE_DELIVERY_CANDIDATE_ONLY'||
     typeof p.sender!=='string'||!NAME.test(p.sender)||
     typeof p.recipient!=='string'||!NAME.test(p.recipient)||
     p.sender===p.recipient||
     typeof p.project!=='string'||!NAME.test(p.project)||
     typeof p.messageId!=='string'||!SHA.test(p.messageId)||
     ![2,3].includes(p.signalMessageType)||
     typeof p.ciphertextBase64url!=='string'||!B64.test(p.ciphertextBase64url)||
     !Number.isSafeInteger(p.byteLength)||p.byteLength<32||
     p.byteLength>maxMessageBytes)return DENY;
  for(const flag of Object.keys(FLAGS)){
   if(p[flag]!==false)return DENY;
  }
  let bytes;
  try{bytes=Buffer.from(p.ciphertextBase64url,'base64url');}catch{return DENY;}
  if(bytes.length!==p.byteLength||
     bytes.toString('base64url')!==p.ciphertextBase64url)return DENY;
  const digest=payloadDigest(bytes);
  let at;
  try{at=now();}catch{return DENY;}
  if(!Number.isSafeInteger(at)||at<=0)return DENY;
  try{
   const names=listSafe(directory,expected);
   const used=occupied(names);
   if(used.files>=maxMessages*2||used.messages>=maxMessages||
      used.bytes+bytes.length>maxTotalBytes)return deny('PRIVATE_MAILBOX_FULL');
   if(used.payloads.has(digest)||
      names.includes(p.messageId+'.msg')||
      names.includes(p.messageId+'.ack'))
    return deny('PRIVATE_MAILBOX_DUPLICATE');
   const record=JSON.stringify({
    sender:p.sender,recipient:p.recipient,project:p.project,
    messageId:p.messageId,signalMessageType:p.signalMessageType,
    ciphertextBase64url:p.ciphertextBase64url,byteLength:p.byteLength,
    payloadSha256:digest,storedAtMs:at,expiresAtMs:at+60000
   });
   writeExclusive(directory,p.messageId+'.msg',DOMAIN+record,0o600);
   return Object.freeze({
    ok:true,status:'PRIVATE_MAILBOX_ENQUEUED',
    messageId:p.messageId,recipient:p.recipient,project:p.project,
    byteLength:p.byteLength,...FLAGS
   });
  }catch(err){
   if(err&&err.code==='EEXIST')return deny('PRIVATE_MAILBOX_DUPLICATE');
   return DENY;
  }
 }
 function list(recipient){
  if(typeof recipient!=='string'||!NAME.test(recipient))return DENY;
  let at;
  try{at=now();}catch{return DENY;}
  if(!Number.isSafeInteger(at)||at<=0)return DENY;
  try{
   const names=listSafe(directory,expected);
   const acked=new Set(names.filter(n=>ACK.test(n)).map(n=>n.slice(0,64)));
   const items=[];
   for(const name of names){
    if(!MSG.test(name))continue;
    const id=name.slice(0,64);
    if(acked.has(id))continue;
    const rec=readMsg(directory,name);
    if(rec.recipient!==recipient)continue;
    if(rec.messageId!==id)return DENY;
    if(!Number.isSafeInteger(rec.storedAtMs)||
       !Number.isSafeInteger(rec.expiresAtMs)||
       rec.expiresAtMs<=rec.storedAtMs||
       rec.expiresAtMs-rec.storedAtMs>60000)return DENY;
    if(rec.expiresAtMs<=at)continue;
    items.push(Object.freeze({
     messageId:rec.messageId,sender:rec.sender,project:rec.project,
     signalMessageType:rec.signalMessageType,
     ciphertextBase64url:rec.ciphertextBase64url,
     byteLength:rec.byteLength,storedAtMs:rec.storedAtMs
    }));
   }
   items.sort((a,b)=>a.storedAtMs-b.storedAtMs||a.messageId.localeCompare(b.messageId));
   return Object.freeze({
    ok:true,status:'PRIVATE_MAILBOX_LIST',recipient,items:Object.freeze(items),
    ...FLAGS
   });
  }catch{return DENY;}
 }
 function ack({recipient,messageId}={}){
  if(typeof recipient!=='string'||!NAME.test(recipient)||
     typeof messageId!=='string'||!SHA.test(messageId))return DENY;
  try{
   const names=listSafe(directory,expected);
   const msgName=messageId+'.msg';
   const ackName=messageId+'.ack';
   if(names.includes(ackName))return deny('PRIVATE_MAILBOX_DUPLICATE');
   if(!names.includes(msgName))return deny('PRIVATE_MAILBOX_MISSING');
   const rec=readMsg(directory,msgName);
   if(rec.recipient!==recipient||rec.messageId!==messageId)return DENY;
   if(typeof rec.payloadSha256!=='string'||!SHA.test(rec.payloadSha256))
    return DENY;
   writeExclusive(directory,ackName,'V1\n'+rec.payloadSha256+'\n',0o600);
   try{fs.unlinkSync(path.join(directory,msgName));}catch{/* ack is the commit */}
   fsyncDir(directory);
   return Object.freeze({
    ok:true,status:'PRIVATE_MAILBOX_ACKED',messageId,recipient,...FLAGS
   });
  }catch(err){
   if(err&&err.code==='EEXIST')return deny('PRIVATE_MAILBOX_DUPLICATE');
   return DENY;
  }
 }
 const instance=Object.freeze({enqueue,list,ack});
 BRAND.add(instance);
 return instance;
}
function isPrivateSignalMailbox(value){
 return !!value&&typeof value==='object'&&BRAND.has(value);
}
module.exports=Object.freeze({createPrivateSignalMailbox,isPrivateSignalMailbox});
