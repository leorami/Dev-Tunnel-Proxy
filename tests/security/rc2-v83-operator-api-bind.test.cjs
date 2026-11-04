'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {provisionPrivateHostWorker}=require('../../scripts/rc2-provision-private-host-worker.cjs');
const {verifyProvisionedApiSpoolAccess}=require('../../scripts/rc2-verify-api-spool-access.cjs');
const {createApiOwnedSpool}=require('../../scripts/rc2-create-api-spool.cjs');
const PROXY='sha256:'+'b'.repeat(64),API='sha256:'+'d'.repeat(64),CID='a'.repeat(64);
async function stage(){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'dp-v83-operator-')));await fs.chmod(root,0o700);
 const approvedRoot=path.join(root,'approved'),stageRoot=path.join(root,'stage');
 await fs.mkdir(approvedRoot,{mode:0o755});await fs.mkdir(stageRoot,{mode:0o700});
 const uid=process.getuid(),gid=process.getgid();
 const sources={
  nginxConf:path.join(root,'nginx.conf'),defaultConf:path.join(root,'default.conf'),sitesDir:path.join(root,'sites'),artifactsDir:path.join(root,'artifacts')
 };
 const manifest={protocol:'DEVPROXY_RC2_OPERATOR_BOOTSTRAP_V1',dockerBinary:'/usr/local/bin/docker',proxyContainerId:CID,
  proxyImage:PROXY,approvedRoot,apiUid:uid,apiGid:gid,operatorProvisionAuthorized:true,expectedMounts:[
   {source:sources.nginxConf,destination:'/etc/nginx/nginx.conf',readOnly:true},
   {source:sources.defaultConf,destination:'/etc/nginx/conf.d/default.conf',readOnly:true},
   {source:sources.sitesDir,destination:'/etc/nginx/conf.d/sites-enabled',readOnly:true},
   {source:sources.artifactsDir,destination:'/usr/share/nginx/html/.artifacts',readOnly:false}
  ]};
 const candidate={proxyImage:'secure/proxy@'+PROXY,apiImage:'secure/api@'+API,apiUid:uid,apiGid:gid,
 paths:{sourceRoot:approvedRoot,ownerEnvFile:path.join(root,'.env'),secretHostFile:path.join(stageRoot,'activation.secret'),
  spoolHostDir:path.join(stageRoot,'host-share'),appsDir:path.join(root,'apps'),overridesDir:path.join(root,'overrides'),
  sitesDir:sources.sitesDir,artifactsDir:sources.artifactsDir,nginxConf:sources.nginxConf,defaultConf:sources.defaultConf,
  nginxEntrypoint:path.join(root,'entry.sh'),certsDir:path.join(root,'certs'),statusDir:path.join(root,'status'),dashboardDir:path.join(root,'dashboard')}};
 const manifestPath=path.join(stageRoot,'rc2-host-bootstrap-input.json');
 const candidatePath=path.join(stageRoot,'rc2-candidate-pins.json');
 const write=async(p,v)=>{await fs.writeFile(p,JSON.stringify(v)+'\n',{mode:0o600});await fs.chmod(p,0o600)};
 await write(manifestPath,manifest);await write(candidatePath,candidate);
 await provisionPrivateHostWorker({stageRoot});
 // Local TEST simulation of the actual API-created child on the parent bind.
 await createApiOwnedSpool({directory:path.join(stageRoot,'host-share','spool')});
 const calls=[];
 let failure=null;
 const execute=(binary,args,options,cb)=>{
  calls.push({binary,args,options});
  if(failure)return setImmediate(()=>cb(Error(failure),'',''));
  let raw;
  if(args[0]==='inspect'){
   const dict={'{{json .Id}}':CID,'{{json .Image}}':API,'{{json .State.Running}}':true,
    '{{json .Config.User}}':`${uid}:${gid}`,
    '{{json .Mounts}}':[
     {Type:'bind',Source:path.join(stageRoot,'host-share'),Destination:'/app/.artifacts/rc2-ipc',RW:true},
     {Type:'bind',Source:path.join(stageRoot,'activation.secret'),Destination:'/app/.artifacts/rc2-activation.secret',RW:false}]};
   raw=JSON.stringify(dict[args[2]]);
  } else if(args[0]==='exec')raw=JSON.stringify({uid,gid,spoolOwnerUid:uid,spoolMode:0o700,secretOwnerUid:uid,secretMode:0o600,spoolAccessible:true,secretReadable:true});
  else throw Error('unexpected privileged operation');
  setImmediate(()=>cb(null,raw+'\n',''));
 };
 return {root,stageRoot,manifestPath,candidatePath,uid,gid,calls,execute,
  write,manifest,candidate,setFail:x=>failure=x,close:()=>fs.rm(root,{recursive:true,force:true})};
}
test('RED: actual operator stage verification runs only read-only inspect+API nonroot access proof',async()=>{
 const f=await stage();try{
  const r=await verifyProvisionedApiSpoolAccess({stageRoot:f.stageRoot,apiContainerId:CID,execFileImpl:f.execute,home:'/tmp'});
  assert.equal(r.code,'API_SPOOL_CROSS_UID_EVIDENCE_ONLY');assert.equal(r.productionChangeAuthorized,false);
  assert.equal(f.calls.filter(c=>c.args[0]==='exec').length,1);
  assert.ok(f.calls.every(c=>['exec','inspect'].includes(c.args[0])&&c.options.shell===false));
 }finally{await f.close();}
});
test('RED: missing provisioned worker pin rejects with no Docker operation',async()=>{const f=await stage();try{
 await fs.unlink(path.join(f.stageRoot,'worker.pin.json'));
 const r=await verifyProvisionedApiSpoolAccess({stageRoot:f.stageRoot,apiContainerId:CID,execFileImpl:f.execute,home:'/tmp'});
 assert.equal(r.code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('RED: stage candidate UID drift after provisioning denies before Docker',async()=>{const f=await stage();try{
 await f.write(f.candidatePath,{...f.candidate,apiUid:f.uid+1});
 const r=await verifyProvisionedApiSpoolAccess({stageRoot:f.stageRoot,apiContainerId:CID,execFileImpl:f.execute,home:'/tmp'});
 assert.equal(r.code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('RED: missing candidate private input denies without executing a Docker operation',async()=>{const f=await stage();try{
 await fs.unlink(f.candidatePath);
 const r=await verifyProvisionedApiSpoolAccess({stageRoot:f.stageRoot,apiContainerId:CID,execFileImpl:f.execute,home:'/tmp'});
 assert.equal(r.code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('RED: API failed read-only probe returns blocked with no secret bytes or private paths',async()=>{const f=await stage();try{
 f.setFail('unreachable');const r=await verifyProvisionedApiSpoolAccess({stageRoot:f.stageRoot,apiContainerId:CID,execFileImpl:f.execute,home:'/tmp'});
 assert.equal(r.code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(JSON.stringify(r).includes(f.root),false);
 }finally{await f.close();}
});
test('RED: incomplete API ID stops before pin parsing or Docker operation',async()=>{const f=await stage();try{
 const r=await verifyProvisionedApiSpoolAccess({stageRoot:f.stageRoot,apiContainerId:'dev-proxy-config-api',execFileImpl:f.execute,home:'/tmp'});
 assert.equal(r.code,'API_SPOOL_CROSS_UID_BLOCKED');assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
