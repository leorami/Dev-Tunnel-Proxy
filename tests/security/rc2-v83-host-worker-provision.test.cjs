'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {provisionPrivateHostWorker}=require('../../scripts/rc2-provision-private-host-worker.cjs');
const {loadVerifiedHostWorkerPin}=require('../../utils/rc2-private-host-worker-pin.cjs');
const {createApiOwnedSpool}=require('../../scripts/rc2-create-api-spool.cjs');
const ID='a'.repeat(64),IMG='sha256:'+'b'.repeat(64);
const baseMounts=root=>[
 {destination:'/etc/nginx/nginx.conf',source:path.join(root,'nginx.conf'),readOnly:true},
 {destination:'/etc/nginx/conf.d/default.conf',source:path.join(root,'default.conf'),readOnly:true},
 {destination:'/etc/nginx/conf.d/sites-enabled',source:path.join(root,'sites'),readOnly:true},
 {destination:'/usr/share/nginx/html/.artifacts',source:path.join(root,'artifacts'),readOnly:false}
];
async function fixture(){
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dp83-provision-')));
 await fs.chmod(dir,0o700);
 const stageRoot=path.join(dir,'private-stage'),approvedRoot=path.join(dir,'approved');
 await fs.mkdir(stageRoot,{mode:0o700});await fs.mkdir(approvedRoot,{mode:0o755});
 const apiUid=process.getuid(),apiGid=process.getgid();
 const manifest={protocol:'DEVPROXY_RC2_OPERATOR_BOOTSTRAP_V1',dockerBinary:'/usr/local/bin/docker',
  proxyContainerId:ID,proxyImage:IMG,expectedMounts:baseMounts(dir),approvedRoot,
  apiUid,apiGid,operatorProvisionAuthorized:true};
 const manifestFile=path.join(stageRoot,'rc2-host-bootstrap-input.json');
 async function save(m=manifest){await fs.writeFile(manifestFile,JSON.stringify(m)+'\n',{mode:0o600});await fs.chmod(manifestFile,0o600)}
 await save();
 const candidate={proxyImage:'approved-proxy@sha256:'+'b'.repeat(64),apiImage:'approved-api@sha256:'+'d'.repeat(64),apiUid,apiGid,
  paths:{sourceRoot:approvedRoot,ownerEnvFile:path.join(dir,'.env'),secretHostFile:path.join(stageRoot,'activation.secret'),
   spoolHostDir:path.join(stageRoot,'host-share'),appsDir:path.join(dir,'apps'),overridesDir:path.join(dir,'overrides'),
   sitesDir:path.join(dir,'sites'),artifactsDir:path.join(dir,'artifacts'),nginxConf:path.join(dir,'nginx.conf'),
   defaultConf:path.join(dir,'default.conf'),nginxEntrypoint:path.join(dir,'entrypoint.sh'),
   certsDir:path.join(dir,'certs'),statusDir:path.join(dir,'status'),dashboardDir:path.join(dir,'dashboard')}};
 const candidateFile=path.join(stageRoot,'rc2-candidate-pins.json');
 async function saveCandidate(value=candidate){await fs.writeFile(candidateFile,JSON.stringify(value)+'\n',{mode:0o600});await fs.chmod(candidateFile,0o600)}
 await saveCandidate();
 const run=()=>provisionPrivateHostWorker({stageRoot});
 return {dir,stageRoot,approvedRoot,manifest,manifestFile,save,candidate,candidateFile,saveCandidate,run,close:()=>fs.rm(dir,{recursive:true,force:true})};
}
async function rejected(change,re=/RC2_BOOTSTRAP_/){const f=await fixture();try{await change(f);await assert.rejects(f.run,re);}finally{await f.close()}}
test('RED: private bootstrap creates valid host pin and 32-byte CSPRNG secret with 0700/0600',async()=>{
 const f=await fixture();try{
  const r=await f.run();assert.equal(r.code,'RC2_PRIVATE_HOST_STAGED_AWAITING_API_SPOOL');assert.equal(r.deployed,false);
  assert.equal((await fs.lstat(path.join(f.stageRoot,'host-share'))).mode&0o7777,0o1770);
  await assert.rejects(()=>fs.lstat(path.join(f.stageRoot,'host-share','spool')),{code:'ENOENT'});
  for(const d of ['lease','lease/replay']){const st=await fs.lstat(path.join(f.stageRoot,d));assert.equal(st.mode&0o777,0o700,d);}
  for(const file of ['activation.secret','worker.pin.json'])assert.equal((await fs.lstat(path.join(f.stageRoot,file))).mode&0o777,0o600,file);
  // TEST SIMULATION ONLY: the actual Linux API UID must create this child.
  await createApiOwnedSpool({directory:path.join(f.stageRoot,'host-share','spool')});
  const pin=loadVerifiedHostWorkerPin(path.join(f.stageRoot,'worker.pin.json'));
  assert.equal(pin.proxyContainerId,ID);assert.equal(pin.secret.length,32);
  assert.equal(pin.spoolDirectory,path.join(f.stageRoot,'host-share','spool'));assert.equal(pin.leaseDirectory,path.join(f.stageRoot,'lease'));
 }finally{await f.close()}
});
test('RED: no second provision can replace the signing secret or host pin',async()=>{const f=await fixture();try{
 await f.run();const a=await fs.readFile(path.join(f.stageRoot,'activation.secret'));
 await assert.rejects(f.run,/RC2_BOOTSTRAP_(ALREADY_PROVISIONED|STAGE_UNSAFE)/);
 assert.deepEqual(await fs.readFile(path.join(f.stageRoot,'activation.secret')),a);
 }finally{await f.close()}});
test('RED: reject root operator identity before any state change',()=>rejected(async f=>f.save({...f.manifest,apiUid:0})));
test('RED: API UID may differ from host Mac UID because Docker Desktop bind root reports uid0',async()=>{const f=await fixture();try{await f.save({...f.manifest,apiUid:process.getuid()+17});await f.saveCandidate({...f.candidate,apiUid:process.getuid()+17});assert.equal((await f.run()).code,'RC2_PRIVATE_HOST_STAGED_AWAITING_API_SPOOL');}finally{await f.close()}});
test('RED: host actor GID and container API GID must be identical',()=>rejected(async f=>f.save({...f.manifest,apiGid:process.getgid()+3})));
test('RED: operator provisioning requires explicit true authorization',()=>rejected(async f=>f.save({...f.manifest,operatorProvisionAuthorized:false})));
test('RED: unrecognized provisioning keys are rejected',()=>rejected(async f=>f.save({...f.manifest,extraCommand:'docker run'})));
test('RED: pin with Docker socket mount refused before creating spool',async()=>{const f=await fixture();try{
 await f.save({...f.manifest,expectedMounts:[...f.manifest.expectedMounts,{destination:'/var/run/docker.sock',source:'/var/run/docker.sock',readOnly:false}]});
 await assert.rejects(f.run,/RC2_BOOTSTRAP_/);await assert.rejects(()=>fs.stat(path.join(f.stageRoot,'host-share')),{code:'ENOENT'});
 }finally{await f.close()}});
test('RED: source writable nginx mount refused before provision',()=>rejected(async f=>f.save({...f.manifest,expectedMounts:f.manifest.expectedMounts.map((m,i)=>i===0?{...m,readOnly:false}:m)})));
test('RED: stage must be private owner 0700',()=>rejected(async f=>fs.chmod(f.stageRoot,0o755)));
test('RED: stage symlink forbidden even if target is private',async()=>{const f=await fixture();try{
 const link=path.join(f.dir,'stage-link');await fs.symlink(f.stageRoot,link);
 await assert.rejects(()=>provisionPrivateHostWorker({stageRoot:link}),/RC2_BOOTSTRAP_/);
 }finally{await f.close()}});
test('RED: bootstrap input must be one-link regular file with mode 0600',()=>rejected(async f=>fs.chmod(f.manifestFile,0o644)));
test('RED: hard-linked bootstrap input rejected',()=>rejected(async f=>fs.link(f.manifestFile,path.join(f.dir,'other-link'))));
test('RED: missing approved source rejected before provision',()=>rejected(async f=>f.save({...f.manifest,approvedRoot:'/not-a-real-approved-source'})));
test('RED: no private spool may sit inside approved project source',()=>rejected(async f=>f.save({...f.manifest,approvedRoot:f.dir})));
test('RED: private stage cannot have preexisting partial spool/replay data',async()=>{const f=await fixture();try{
 await fs.mkdir(path.join(f.stageRoot,'host-share'),{mode:0o700});
 await assert.rejects(f.run,/RC2_BOOTSTRAP_(ALREADY_PROVISIONED|STAGE_UNSAFE)/);
 }finally{await f.close()}});
test('RED: bootstrap does not modify source files or owner session',async()=>{const f=await fixture();try{
 const source=path.join(f.approvedRoot,'src-marker');await fs.writeFile(source,'KEEP\n');const st=await fs.stat(source);
 await f.run();assert.equal(await fs.readFile(source,'utf8'),'KEEP\n');assert.equal((await fs.stat(source)).mtimeMs,st.mtimeMs);
 }finally{await f.close()}});
test('RED: provisioning errors never print secrets, private paths or raw pin',async()=>{const f=await fixture();try{
 const result=await f.run();const output=JSON.stringify(result);
 assert.equal(output.includes(f.dir),false);assert.equal(output.includes('a'.repeat(64)),false);
 assert.equal(output.includes('secret'),false);
 }finally{await f.close()}});

test('RED: candidate manifest must exist before provisioning any host capability',()=>rejected(async f=>fs.unlink(f.candidateFile)));
test('RED: candidate API UID must match approved host actor and provisioning pin',()=>rejected(async f=>f.saveCandidate({...f.candidate,apiUid:f.candidate.apiUid+1})));
test('RED: candidate API GID must match approved host actor and provisioning pin',()=>rejected(async f=>f.saveCandidate({...f.candidate,apiGid:f.candidate.apiGid+1})));
test('RED: candidate proxy image digest must equal worker image digest',()=>rejected(async f=>f.saveCandidate({...f.candidate,proxyImage:'approved-proxy@sha256:'+'a'.repeat(64)})));
test('RED: candidate spool mount source must equal host worker spool',()=>rejected(async f=>f.saveCandidate({...f.candidate,paths:{...f.candidate.paths,spoolHostDir:path.join(f.dir,'rogue-spool')}})));
test('RED: candidate signing file source must equal host worker secret',()=>rejected(async f=>f.saveCandidate({...f.candidate,paths:{...f.candidate.paths,secretHostFile:path.join(f.dir,'rogue.secret')}})));
test('RED: candidate source root must equal verified host worker approvedRoot',()=>rejected(async f=>f.saveCandidate({...f.candidate,paths:{...f.candidate.paths,sourceRoot:f.dir}})));
test('RED: candidate nginx main mount must match reviewed host expectedMounts',()=>rejected(async f=>f.saveCandidate({...f.candidate,paths:{...f.candidate.paths,nginxConf:path.join(f.dir,'another-nginx.conf')}})));
test('RED: candidate manifest must remain private 0600',()=>rejected(async f=>fs.chmod(f.candidateFile,0o644)));
test('RED: candidate manifest may not have extra key that changes release behavior',()=>rejected(async f=>f.saveCandidate({...f.candidate,command:'docker run'})));
