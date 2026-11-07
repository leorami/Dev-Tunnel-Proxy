#!/usr/bin/env node
'use strict';
/**
 * One-shot OPERATOR-EXPLICIT host worker credential/directory bootstrap.
 * No Docker, service start, protected merge, credential rotation, owner data
 * change, hostname or public listener. Only a previously created private
 * staging directory is writable. The human-reviewed manifest supplies exact
 * container identity and mounts; there is no discovery or silent trust update.
 *
 * This provisioner is not release authorization. It deliberately refuses to
 * rerun, clean partial work, or repair pre-existing private state.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {constants}=require('node:fs');
const INPUT='rc2-host-bootstrap-input.json';
const CANDIDATE='rc2-candidate-pins.json';
const SHARE='host-share';
const SECRET='activation.secret';
const PIN='worker.pin.json';
const HEX_ID=/^[0-9a-f]{64}$/;
const HEX_IMAGE=/^sha256:[0-9a-f]{64}$/;
const ALLOWED_DOCKER=new Set(['/opt/homebrew/bin/docker','/usr/local/bin/docker','/usr/bin/docker']);
const INPUT_KEYS=['protocol','dockerBinary','proxyContainerId','proxyImage','expectedMounts',
 'approvedRoot','apiUid','apiGid','operatorProvisionAuthorized'];
const NEED_NGINX=new Set(['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf',
 '/etc/nginx/conf.d/sites-enabled']);
const ONLY_RW='/usr/share/nginx/html/.artifacts';
const LEASE_LEAVES=['replay'];
function deny(code='RC2_BOOTSTRAP_UNSAFE'){throw Error(code);}
function validPath(p){
 return typeof p==='string'&&p.length>1&&p.length<1025&&path.isAbsolute(p)&&
  path.normalize(p)===p&&p!=='/'&&!p.endsWith(path.sep)&&
  !/[\x00-\x1f\x7f]/.test(p)&&!/(^|\/)docker\.sock($|\/)/.test(p);
}
function overlaps(a,b){return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
function exact(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.getPrototypeOf(o)!==Object.prototype)return false;
 const own=Reflect.ownKeys(o);
 return own.length===keys.length&&keys.every(k=>own.includes(k)&&
  Object.hasOwn(Object.getOwnPropertyDescriptor(o,k),'value'));
}
function sameStat(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.nlink===b.nlink&&a.size===b.size&&
 a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
function currentIdentity(){
 if(typeof process.getuid!=='function'||typeof process.getgid!=='function')deny('RC2_BOOTSTRAP_IDENTITY_UNAVAILABLE');
 const uid=process.getuid(),gid=process.getgid();
 if(!Number.isSafeInteger(uid)||uid<100||!Number.isSafeInteger(gid)||gid<1)deny('RC2_BOOTSTRAP_IDENTITY_UNSAFE');
 return {uid,gid};
}
async function privateStage(root,uid){
 if(!validPath(root))deny('RC2_BOOTSTRAP_STAGE_UNSAFE');
 let st;
 try{st=await fs.lstat(root,{bigint:true});}catch{deny('RC2_BOOTSTRAP_STAGE_UNSAFE');}
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o777n)!==0o700n||
  st.uid!==BigInt(uid)||await fs.realpath(root)!==root)deny('RC2_BOOTSTRAP_STAGE_UNSAFE');
 return st;
}
async function pinnedManifest(root,uid,leaf=INPUT){
 if(![INPUT,CANDIDATE].includes(leaf))deny('RC2_BOOTSTRAP_MANIFEST_UNSAFE');
 const file=path.join(root,leaf);
 let st,fd;
 try{
  st=await fs.lstat(file,{bigint:true});
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||st.uid!==BigInt(uid)||
     (st.mode&0o777n)!==0o600n||st.size<2n||st.size>16384n)deny('RC2_BOOTSTRAP_MANIFEST_UNSAFE');
  fd=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const a=await fd.stat({bigint:true});
  if(!sameStat(st,a))deny('RC2_BOOTSTRAP_MANIFEST_UNSAFE');
  const bytes=await fd.readFile();
  const b=await fd.stat({bigint:true}),c=await fs.lstat(file,{bigint:true});
  if(bytes.length!==Number(st.size)||!sameStat(a,b)||!sameStat(b,c))deny('RC2_BOOTSTRAP_MANIFEST_UNSAFE');
  let o;try{o=JSON.parse(bytes.toString('utf8'));}catch{deny('RC2_BOOTSTRAP_MANIFEST_UNSAFE');}
  return o;
 }catch(e){if(e?.message?.startsWith('RC2_BOOTSTRAP_'))throw e;deny('RC2_BOOTSTRAP_MANIFEST_UNSAFE');}
 finally{if(fd)await fd.close();}
}
function verifyManifest(m,root,identity){
 if(!exact(m,INPUT_KEYS)||m.protocol!=='DEVPROXY_RC2_OPERATOR_BOOTSTRAP_V1'||
  m.operatorProvisionAuthorized!==true||!ALLOWED_DOCKER.has(m.dockerBinary)||
  !HEX_ID.test(m.proxyContainerId||'')||!HEX_IMAGE.test(m.proxyImage||'')||
  !Number.isSafeInteger(m.apiUid)||m.apiUid<100||m.apiUid>65534||
  m.apiGid!==identity.gid||!validPath(m.approvedRoot)||
  !Array.isArray(m.expectedMounts)||m.expectedMounts.length<3||m.expectedMounts.length>32||
  overlaps(root,m.approvedRoot))deny('RC2_BOOTSTRAP_MANIFEST_INVALID');
 const seen=new Set();
 for(const v of m.expectedMounts){
  if(!exact(v,['destination','source','readOnly'])||!validPath(v.destination)||
   !validPath(v.source)||typeof v.readOnly!=='boolean'||seen.has(v.destination)||
   overlaps(v.source,root)||(!v.readOnly&&v.destination!==ONLY_RW)||
   (NEED_NGINX.has(v.destination)&&!v.readOnly))deny('RC2_BOOTSTRAP_MANIFEST_INVALID');
  seen.add(v.destination);
 }
 if([...NEED_NGINX].some(x=>!seen.has(x)))deny('RC2_BOOTSTRAP_MANIFEST_INVALID');
}
function verifyCandidatePins(m,candidate,stageRoot){
 const pathKeys=['sourceRoot','ownerEnvFile','secretHostFile','spoolHostDir','appsDir',
  'overridesDir','sitesDir','artifactsDir','nginxConf','defaultConf',
  'nginxEntrypoint','certsDir','statusDir','dashboardDir'];
 if(!exact(candidate,['proxyImage','apiImage','apiUid','apiGid','paths'])||
    !exact(candidate.paths,pathKeys)||
    !/^[a-z0-9][a-z0-9._/-]{1,160}@sha256:[a-f0-9]{64}$/.test(candidate.proxyImage||'')||
    !/^[a-z0-9][a-z0-9._/-]{1,160}@sha256:[a-f0-9]{64}$/.test(candidate.apiImage||'')||
    candidate.proxyImage.slice(candidate.proxyImage.lastIndexOf('@')+1)!==m.proxyImage||
    candidate.apiUid!==m.apiUid||candidate.apiGid!==m.apiGid||
    pathKeys.some(k=>!validPath(candidate.paths[k]))||
    candidate.paths.sourceRoot!==m.approvedRoot||
    candidate.paths.spoolHostDir!==path.join(stageRoot,SHARE)||
    candidate.paths.secretHostFile!==path.join(stageRoot,SECRET))
  deny('RC2_BOOTSTRAP_CANDIDATE_DRIFT');
 const mounts=new Map(m.expectedMounts.map(x=>[x.destination,x]));
 for(const [dest,source] of [
  ['/etc/nginx/nginx.conf',candidate.paths.nginxConf],
  ['/etc/nginx/conf.d/default.conf',candidate.paths.defaultConf],
  ['/etc/nginx/conf.d/sites-enabled',candidate.paths.sitesDir]]){
  const x=mounts.get(dest);
  if(!x||x.source!==source||x.readOnly!==true)deny('RC2_BOOTSTRAP_CANDIDATE_DRIFT');
 }
 const artifacts=mounts.get('/usr/share/nginx/html/.artifacts');
 if(artifacts&&(artifacts.source!==candidate.paths.artifactsDir||artifacts.readOnly!==false))
  deny('RC2_BOOTSTRAP_CANDIDATE_DRIFT');
}
async function verifiedSource(root,uid){
 let st;
 try{st=await fs.lstat(root,{bigint:true});}catch{deny('RC2_BOOTSTRAP_SOURCE_UNSAFE');}
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==BigInt(uid)||
   (st.mode&0o022n)!==0n||await fs.realpath(root)!==root)deny('RC2_BOOTSTRAP_SOURCE_UNSAFE');
}
async function writeExclusive(file,data,uid){
 let fd;
 try{
  fd=await fs.open(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  await fd.writeFile(data);await fd.sync();
  const st=await fd.stat({bigint:true});
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==BigInt(uid)||st.nlink!==1n||
    (st.mode&0o777n)!==0o600n||st.size!==BigInt(Buffer.byteLength(data)))deny('RC2_BOOTSTRAP_WRITE_UNSAFE');
 }catch(e){if(e?.code==='EEXIST')deny('RC2_BOOTSTRAP_ALREADY_PROVISIONED');if(e?.message?.startsWith('RC2_BOOTSTRAP_'))throw e;deny('RC2_BOOTSTRAP_WRITE_UNSAFE');}
 finally{if(fd)await fd.close();}
}
async function mkdirExclusive(directory,uid){
 try{await fs.mkdir(directory,{mode:0o700});}catch(e){if(e?.code==='EEXIST')deny('RC2_BOOTSTRAP_ALREADY_PROVISIONED');deny('RC2_BOOTSTRAP_WRITE_UNSAFE');}
 const st=await fs.lstat(directory,{bigint:true});
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==BigInt(uid)||(st.mode&0o777n)!==0o700n)
  deny('RC2_BOOTSTRAP_WRITE_UNSAFE');
}
async function syncDir(p){const fd=await fs.open(p,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await fd.sync();}finally{await fd.close();}}
async function readVerifiedBootstrapState({stageRoot}={}){
 const {uid,gid}=currentIdentity();
 await privateStage(stageRoot,uid);
 const m=await pinnedManifest(stageRoot,uid);
 const candidate=await pinnedManifest(stageRoot,uid,CANDIDATE);
 verifyManifest(m,stageRoot,{uid,gid});
 verifyCandidatePins(m,candidate,stageRoot);
 await verifiedSource(m.approvedRoot,uid);
 return Object.freeze({manifest:m,candidate,uid,gid});
}
async function provisionPrivateHostWorker({stageRoot}={}){
 const {manifest:m,uid}=await readVerifiedBootstrapState({stageRoot});
 const already=[SHARE,'lease',SECRET,PIN];
 for(const leaf of already){try{await fs.lstat(path.join(stageRoot,leaf));deny('RC2_BOOTSTRAP_ALREADY_PROVISIONED');}catch(e){if(e?.message?.startsWith('RC2_BOOTSTRAP_'))throw e;if(e?.code!=='ENOENT')deny('RC2_BOOTSTRAP_STAGE_UNSAFE');}}
 const sharedParent=path.join(stageRoot,SHARE),spool=path.join(sharedParent,'spool');
 const lease=path.join(stageRoot,'lease'),secretPath=path.join(stageRoot,SECRET),pinPath=path.join(stageRoot,PIN);
 // Docker Desktop exposes the bind ROOT as UID0 inside the Linux API.
 // Create ONLY a private, sticky, group-writable parent under stageRoot0700.
 // The API itself (UID504 etc.) must create the 0700 CHILD and queue leaves.
 await mkdirExclusive(sharedParent,uid);await fs.chmod(sharedParent,0o1770);
 const sharedSt=await fs.lstat(sharedParent,{bigint:true});
 if((sharedSt.mode&0o7777n)!==0o1770n||sharedSt.gid!==BigInt(m.apiGid))deny('RC2_BOOTSTRAP_SHARE_UNSAFE');
 await mkdirExclusive(lease,uid);
 for(const leaf of LEASE_LEAVES)await mkdirExclusive(path.join(lease,leaf),uid);
 for(const dir of [sharedParent,lease])await syncDir(dir);
 const secret=crypto.randomBytes(32);
 await writeExclusive(secretPath,secret,uid);
 // Never print, store in Git, or include the HMAC bytes in any result object.
 secret.fill(0);
 const pin={dockerBinary:m.dockerBinary,proxyContainerId:m.proxyContainerId,
  proxyImage:m.proxyImage,expectedMounts:m.expectedMounts,
  spoolDirectory:spool,leaseDirectory:lease,approvedRoot:m.approvedRoot,
  secretFile:secretPath,authorizeFixedHostAction:true};
 await writeExclusive(pinPath,Buffer.from(JSON.stringify(pin)+'\n','utf8'),uid);
 await syncDir(stageRoot);
 // The v82 pin reader requires an EXISTING owner-private spool. Do not invoke
 // it here: only the API UID can create that child on the Docker Desktop bind.
 // Recheck pin+secret with v82 loader AFTER the candidate API runs its init.
 return Object.freeze({code:'RC2_PRIVATE_HOST_STAGED_AWAITING_API_SPOOL',productionChangeAuthorized:false,
  deployed:false,ownerMacAttested:false,apiSpoolOwnedByApi:false});
}
module.exports={provisionPrivateHostWorker,readVerifiedBootstrapState};
if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length!==1){process.stderr.write('RC2_BOOTSTRAP_INVALID_INVOCATION\n');process.exitCode=2;}
 else provisionPrivateHostWorker({stageRoot:args[0]}).then(r=>{
  process.stdout.write(r.code+' / NOT_DEPLOYED\n');
 }).catch(e=>{process.stderr.write((e?.message?.startsWith('RC2_BOOTSTRAP_')?e.message:'RC2_BOOTSTRAP_UNSAFE')+'\n');process.exitCode=2;});
}
