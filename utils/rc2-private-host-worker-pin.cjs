'use strict';
/**
 * Mac host-only fixed-action worker pin reader.
 * Performs no Docker operations, worker installation, network operations,
 * permission repair, or modification of owner data.
 *
 * The operator separately establishes authority and proves the same UID/ACL
 * and bind-mount mapping on the actual Mac. A true boolean in a private pin is
 * not owner GO; it only gates the fixed action after external authorization.
 */
const fs=require('node:fs');
const path=require('node:path');
const {constants}=require('node:fs');
const CID=/^[a-f0-9]{64}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const ALLOWED_DOCKER=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const REQUIRED=new Set(['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf',
 '/etc/nginx/conf.d/sites-enabled']);
const ONLY_RW='/usr/share/nginx/html/.artifacts';
const KEYS=['dockerBinary','proxyContainerId','proxyImage','expectedMounts',
 'spoolDirectory','leaseDirectory','approvedRoot','secretFile','authorizeFixedHostAction'];
const PIN_MAX=16384;
const CODE='HOST_PIN_UNSAFE';
function unsafe(){throw Error(CODE);}
function validPath(p){
 return typeof p==='string'&&p.length>=2&&p.length<=1024&&p.startsWith('/')&&p!=='/'&&
  !p.endsWith('/')&&path.posix.normalize(p)===p&&!/[\x00-\x1f\x7f]/.test(p)&&
  !/(^|\/)docker\.sock($|\/)/.test(p);
}
function inside(p,dir){return p===dir||p.startsWith(dir+'/');}
function owned(st){return typeof process.getuid!=='function'||st.uid===BigInt(process.getuid());}
function stable(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&
 a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function privateDir(p){
 if(!validPath(p))unsafe();
 let stat;
 try{stat=fs.lstatSync(p,{bigint:true});}catch{unsafe();}
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077n)!==0n||
  !owned(stat)||fs.realpathSync(p)!==p)unsafe();
 return stat;
}
function trustedReadOnlySourceDirectory(p){
 if(!validPath(p))unsafe();
 let st;
 try{st=fs.lstatSync(p,{bigint:true});}catch{unsafe();}
 // Source is typically 0755, not owner-private. Group/other WRITE is denied;
 // RO and image source provenance are independently checked before deployment.
 if(!st.isDirectory()||st.isSymbolicLink()||!owned(st)||
  (st.mode&0o022n)!==0n||fs.realpathSync(p)!==p)unsafe();
}
function pinnedBytes(file,max,min=1){
 if(!validPath(file))unsafe();
 privateDir(path.dirname(file));
 let original;
 try{original=fs.lstatSync(file,{bigint:true});}catch{unsafe();}
 if(!original.isFile()||original.isSymbolicLink()||original.nlink!==1n||
  !owned(original)||(original.mode&0o777n)!==0o600n||
  original.size<BigInt(min)||original.size>BigInt(max)||
  fs.realpathSync(file)!==file)unsafe();
 let fd;
 try{
  fd=fs.openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const opened=fs.fstatSync(fd,{bigint:true});
  if(!stable(original,opened)||!opened.isFile())unsafe();
  const data=fs.readFileSync(fd);
  const after=fs.fstatSync(fd,{bigint:true});
  const final=fs.lstatSync(file,{bigint:true});
  if(!stable(opened,after)||!stable(after,final)||BigInt(data.length)!==after.size)unsafe();
  return data;
 }catch{unsafe();}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function plainExact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const present=Reflect.ownKeys(o);
 return present.length===keys.length&&present.every(x=>typeof x==='string'&&keys.includes(x)&&
  Object.hasOwn(o,x)&&Object.hasOwn(Object.getOwnPropertyDescriptor(o,x),'value'));
}
function safeMounts(items){
 if(!Array.isArray(items)||items.length<3||items.length>32)return false;
 const seen=new Set();
 for(const m of items){
  if(!plainExact(m,['destination','source','readOnly'])||!validPath(m.destination)||
   !validPath(m.source)||typeof m.readOnly!=='boolean'||seen.has(m.destination)||
   (!m.readOnly&&m.destination!==ONLY_RW)||
   (REQUIRED.has(m.destination)&&!m.readOnly))return false;
  seen.add(m.destination);
 }
 return [...REQUIRED].every(s=>seen.has(s));
}
function validPin(pin){
 if(!plainExact(pin,KEYS)||pin.authorizeFixedHostAction!==true||
  !ALLOWED_DOCKER.has(pin.dockerBinary)||!CID.test(pin.proxyContainerId)||
  !IMAGE.test(pin.proxyImage)||!safeMounts(pin.expectedMounts))return false;
 for(const key of ['spoolDirectory','leaseDirectory','approvedRoot','secretFile'])
  if(!validPath(pin[key]))return false;
 const {spoolDirectory:spool,leaseDirectory:lease,approvedRoot:root,secretFile:secret}=pin;
 const pairs=[[spool,lease],[spool,root],[lease,root],[secret,spool],[secret,lease],[secret,root]];
 return pairs.every(([a,b])=>!inside(a,b)&&!inside(b,a));
}
function loadVerifiedHostWorkerPin(pinPath){
 const pinBytes=pinnedBytes(pinPath,PIN_MAX,2);
 let pin;
 try{pin=JSON.parse(pinBytes.toString('utf8'));}catch{unsafe();}
 if(!validPin(pin))unsafe();
 // Require existing private directories for the host-only worker. Provisioning
 // is a separate, auditable operation and must never happen during pin read.
 privateDir(pin.spoolDirectory);
 privateDir(pin.leaseDirectory);
 trustedReadOnlySourceDirectory(pin.approvedRoot);
 const secret=pinnedBytes(pin.secretFile,128,32);
 if(secret.length<32||secret.length>128)unsafe();
 return Object.freeze({...pin,expectedMounts:Object.freeze(pin.expectedMounts.map(x=>Object.freeze({...x}))),secret});
}
module.exports={loadVerifiedHostWorkerPin};
