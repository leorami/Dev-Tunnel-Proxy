'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {loadVerifiedHostWorkerPin}=require('../../utils/rc2-private-host-worker-pin.cjs');
const ID='a'.repeat(64), IMAGE='sha256:'+'b'.repeat(64);
async function fixture(){
 const root=await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(),'dpv82-pin-')));
 await fsp.chmod(root,0o700);
 const d={root, approved:path.join(root,'approved'),spool:path.join(root,'spool'),lease:path.join(root,'lease'),secrets:path.join(root,'secrets'),pins:path.join(root,'pins')};
 for(const key of ['approved','spool','lease','secrets','pins'])await fsp.mkdir(d[key],{mode:0o700});
 const secretFile=path.join(d.secrets,'signing-secret'),pinFile=path.join(d.pins,'worker.json');
 await fsp.writeFile(secretFile,Buffer.from('ab'.repeat(32),'hex'),{mode:0o600});
 const pin={dockerBinary:'/usr/local/bin/docker',proxyContainerId:ID,proxyImage:IMAGE,
  expectedMounts:[
   {destination:'/etc/nginx/nginx.conf',source:path.join(root,'nginx.conf'),readOnly:true},
   {destination:'/etc/nginx/conf.d/default.conf',source:path.join(root,'default.conf'),readOnly:true},
   {destination:'/etc/nginx/conf.d/sites-enabled',source:path.join(root,'sites-enabled'),readOnly:true}
  ],spoolDirectory:d.spool,leaseDirectory:d.lease,approvedRoot:d.approved,secretFile,authorizeFixedHostAction:true};
 const write=async(obj=pin)=>{await fsp.writeFile(pinFile,JSON.stringify(obj)+'\n',{mode:0o600});await fsp.chmod(pinFile,0o600)};
 await write();
 return {...d,secretFile,pinFile,pin,write,close:()=>fsp.rm(root,{force:true,recursive:true})};
}
async function checkReject(transform,pattern=/HOST_PIN_.*UNSAFE|HOST_PIN_INVALID/){const f=await fixture();try{await transform(f);assert.throws(()=>loadVerifiedHostWorkerPin(f.pinFile),pattern);}finally{await f.close();}}
test('RED: private exact pin and secret can be loaded without Docker or source mutation',async()=>{const f=await fixture();try{const p=loadVerifiedHostWorkerPin(f.pinFile);assert.equal(p.proxyContainerId,ID);assert.equal(p.authorizeFixedHostAction,true);assert.equal(p.secret.toString('hex'),'ab'.repeat(32));assert.ok(Object.isFrozen(p));}finally{await f.close();}});
test('RED: pin is required to be 0600',()=>checkReject(async f=>fsp.chmod(f.pinFile,0o644)));
test('RED: secret is required to be 0600',()=>checkReject(async f=>fsp.chmod(f.secretFile,0o644)));
test('RED: pin rejects hard links',()=>checkReject(async f=>fsp.link(f.pinFile,path.join(f.root,'hardlink'))));
test('RED: secret rejects hard links',()=>checkReject(async f=>fsp.link(f.secretFile,path.join(f.root,'hardlink'))));
test('RED: pin rejects symlinks',()=>checkReject(async f=>{await fsp.rename(f.pinFile,path.join(f.pins,'original'));await fsp.symlink(path.join(f.pins,'original'),f.pinFile)}));
test('RED: secret rejects symlinks',()=>checkReject(async f=>{await fsp.rename(f.secretFile,path.join(f.secrets,'original'));await fsp.symlink(path.join(f.secrets,'original'),f.secretFile)}));
test('RED: pin ancestor must be private 0700',()=>checkReject(async f=>fsp.chmod(f.pins,0o755)));
test('RED: secret ancestor must be private 0700',()=>checkReject(async f=>fsp.chmod(f.secrets,0o750)));
test('RED: host spool directory must be private 0700',()=>checkReject(async f=>fsp.chmod(f.spool,0o777)));
test('RED: host lease directory must be private 0700',()=>checkReject(async f=>fsp.chmod(f.lease,0o755)));
test('RED: pin cannot be writable by an unrelated process',()=>checkReject(async f=>fsp.chmod(f.pinFile,0o666)));
test('RED: non-approved Docker CLI is denied',()=>checkReject(async f=>f.write({...f.pin,dockerBinary:'/tmp/docker'})));
test('RED: pin cannot request host Docker socket bind',()=>checkReject(async f=>f.write({...f.pin,expectedMounts:[...f.pin.expectedMounts,{destination:'/var/run/docker.sock',source:'/var/run/docker.sock',readOnly:false}]})));
test('RED: pin cannot authorize writable nginx main config',()=>checkReject(async f=>f.write({...f.pin,expectedMounts:f.pin.expectedMounts.map((m,i)=>i===0?{...m,readOnly:false}:m)})));
test('RED: pin cannot add unsigned extra capability',()=>checkReject(async f=>f.write({...f.pin,command:'docker system prune'})));
test('RED: pin cannot have no explicit host authorization',()=>checkReject(async f=>f.write({...f.pin,authorizeFixedHostAction:false})));
test('RED: secret cannot be nested under approved candidate root',()=>checkReject(async f=>f.write({...f.pin,approvedRoot:f.root})));
test('RED: spool cannot be nested under approved candidate root',()=>checkReject(async f=>f.write({...f.pin,approvedRoot:f.root})));
test('RED: secret cannot reside in host spool',()=>checkReject(async f=>f.write({...f.pin,spoolDirectory:f.secrets})));
test('RED: spool and lease are separate directories',()=>checkReject(async f=>f.write({...f.pin,leaseDirectory:f.spool})));
test('RED: too-short HMAC secret denied',()=>checkReject(async f=>fsp.writeFile(f.secretFile,'short',{mode:0o600})));
test('RED: explicit non-canonical paths denied',()=>checkReject(async f=>f.write({...f.pin,approvedRoot:f.approved+'/../approved'})));
test('RED: stale pin path under symlinked parent denied',async()=>{const f=await fixture();try{const link=path.join(f.root,'indirect');await fsp.symlink(f.pins,link);assert.throws(()=>loadVerifiedHostWorkerPin(path.join(link,'worker.json')),/HOST_PIN_.*UNSAFE|HOST_PIN_INVALID/)}finally{await f.close();}});
test('RED: approved project source can be mode 0755 when not group/other writable',async()=>{const f=await fixture();try{
 await fsp.chmod(f.approved,0o755);
 assert.equal(loadVerifiedHostWorkerPin(f.pinFile).approvedRoot,f.approved);
 }finally{await f.close();}});
test('RED: approved project source may not be group/other writable',()=>checkReject(async f=>fsp.chmod(f.approved,0o777)));
test('RED: no mutations to pin or secret from read',async()=>{const f=await fixture();try{const a=await fsp.stat(f.pinFile,{bigint:true});const b=await fsp.stat(f.secretFile,{bigint:true});loadVerifiedHostWorkerPin(f.pinFile);const c=await fsp.stat(f.pinFile,{bigint:true});const d=await fsp.stat(f.secretFile,{bigint:true});assert.equal(a.mtimeNs,c.mtimeNs);assert.equal(b.mtimeNs,d.mtimeNs)}finally{await f.close();}});
