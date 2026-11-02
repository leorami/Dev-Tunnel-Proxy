'use strict';
// DEVPROXY-003A: dependency-free authentication primitives. Never logs secrets.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const MAX_PASSWORD_BYTES=4096;
const SESSION_LIFETIME_MS=7*24*60*60*1000;
const TOKEN_PATTERN=/^[a-f0-9]{64}$/;

function safeAdminPasswordMatches(candidate,expected){
  if(typeof candidate!=='string'||typeof expected!=='string'||!expected.length) return false;
  if(Buffer.byteLength(candidate,'utf8')>MAX_PASSWORD_BYTES) return false;
  // Compare fixed-size digests; timingSafeEqual(raw Buffers) throws on
  // different lengths and previously produced 500 for ordinary bad passwords.
  const a=crypto.createHash('sha256').update(candidate,'utf8').digest();
  const b=crypto.createHash('sha256').update(expected,'utf8').digest();
  return crypto.timingSafeEqual(a,b);
}
function extractAdminSessionToken(req){
  const headers=req?.headers||{};
  const auth=headers.authorization;
  if(auth!==undefined){
    const match=typeof auth==='string'&&/^Bearer ([a-f0-9]{64})$/.exec(auth);
    return match?match[1]:null;
  }
  const cookie=headers.cookie;
  if(typeof cookie!=='string'||cookie.length>8192)return null;
  let found=null;
  for(const part of cookie.split(';')){
    const fragment=part.trim();
    const idx=fragment.indexOf('=');
    if(idx<0||fragment.slice(0,idx)!=='admin_session')continue;
    if(found!==null)return null; // Never resolve ambiguous duplicated cookie.
    found=fragment.slice(idx+1);
  }
  return found!==null&&TOKEN_PATTERN.test(found)?found:null;
}
function isLoopbackHostname(host){
  return typeof host==='string'&&/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host.toLowerCase());
}
function adminSessionCookie(token,{host='',expire=false}={}){
  if(!expire&&(!TOKEN_PATTERN.test(token)))throw new Error('Invalid session token');
  const parts=[
    'admin_session='+(expire?'':token),
    'Path=/','HttpOnly','SameSite=Strict',
    'Max-Age='+(expire?0:SESSION_LIFETIME_MS/1000),
  ];
  // Browser HTTP localhost remains usable; any non-loopback address is HTTPS-only.
  // This is a host-policy assertion, not proof the upstream tunnel is secure.
  if(!isLoopbackHostname(host))parts.push('Secure');
  return parts.join('; ');
}
function sanitizedSessionEntries(data,now=Date.now()){
  const output=new Map();
  if(!data||typeof data!=='object'||Array.isArray(data))return output;
  for(const [token,session] of Object.entries(data)){
    if(!TOKEN_PATTERN.test(token)||!session||typeof session!=='object'||Array.isArray(session))continue;
    const {createdAt,expiresAt,lastUsed}=session;
    if(!Number.isSafeInteger(createdAt)||!Number.isSafeInteger(expiresAt)||expiresAt<=now ||
       expiresAt<=createdAt||expiresAt-createdAt>SESSION_LIFETIME_MS+1000 ||
       !Number.isSafeInteger(lastUsed))continue;
    output.set(token,{createdAt,expiresAt,lastUsed});
  }
  return output;
}
function writeSecureSessionFile(file,entries){
  if(!(entries instanceof Map))throw new TypeError('Expected session map');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.tmp-'+process.pid+'-'+crypto.randomBytes(8).toString('hex');
  const record=JSON.stringify({
    sessions:Object.fromEntries(sanitizedSessionEntries(Object.fromEntries(entries),Date.now())),
    savedAt:new Date().toISOString()
  },null,2);
  try{
    fs.writeFileSync(temp,record,{encoding:'utf8',flag:'wx',mode:0o600});
    fs.renameSync(temp,file);
    fs.chmodSync(file,0o600);
  }catch(e){
    try{fs.unlinkSync(temp);}catch{}
    throw e;
  }
}
function readSecureSessionFile(file,now=Date.now()){
  try{
    const st=fs.lstatSync(file);
    if(!st.isFile())return new Map(); // no symlink following
    if(st.mode&0o077)fs.chmodSync(file,0o600);
    const value=JSON.parse(fs.readFileSync(file,'utf8'));
    return sanitizedSessionEntries(value?.sessions,now);
  }catch{return new Map();}
}
module.exports={safeAdminPasswordMatches,extractAdminSessionToken,adminSessionCookie,writeSecureSessionFile,readSecureSessionFile,isLoopbackHostname};
