'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {exportPinnedCurrentImages}=require('../../utils/rc2-pinned-current-image-export.cjs');
const IDS={proxy:'a'.repeat(64),api:'b'.repeat(64)};
const IMAGES={proxy:'sha256:'+'c'.repeat(64),api:'sha256:'+'d'.repeat(64)};
const DAEMON='DAEMON:EXAMPLE:SAFE:2026';
function fixture(callback){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-recovery-'));
 const parent=path.join(root,'private-rollbacks');
 const stage=path.join(parent,'rc2-images-unique');
 fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(stage,{mode:0o700});
 const pin={protocol:'DEVPROXY_RC2_PRIVATE_IMAGE_EXPORT_V1',dockerBinary:'/usr/local/bin/docker',dockerDaemonId:DAEMON,
  containers:[{role:'proxy',containerId:IDS.proxy,imageId:IMAGES.proxy},{role:'api',containerId:IDS.api,imageId:IMAGES.api}],ownerExportAuthorized:true};
 const pinPath=path.join(stage,'rc2-current-images.private.json');
 fs.writeFileSync(pinPath,JSON.stringify(pin)+'\n',{mode:0o600});
 try{return callback({root,parent,stage,pin,pinPath});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function dockerMock({driftDaemon=false,driftImage=false,failSave=false,mutateImageDuringSave=false}={}){
 const calls=[];let afterSave=false;
 function invoke(bin,args,opts){
  assert.equal(bin,'/usr/local/bin/docker');
  assert.equal(opts.shell,false);
  assert.deepEqual(Object.keys(opts.env).sort(),['HOME','PATH']);
  calls.push(args.join(' '));
  let value;
  if(args[0]==='info')value=driftDaemon&&afterSave?'DIFFERENT:DAEMON':DAEMON;
  else if(args[0]==='container'&&args[1]==='inspect'){
   const id=args[4];const role=Object.keys(IDS).find(k=>IDS[k]===id);
   assert.ok(role,'unexpected container');
   if(args[3]==='{{json .Id}}')value=IDS[role];
   else if(args[3]==='{{json .Image}}')value=(driftImage||mutateImageDuringSave&&afterSave)&&role==='api'?'sha256:'+'f'.repeat(64):IMAGES[role];
   else if(args[3]==='{{json .State.Running}}')value=true;
   else throw Error('bad container inspect format '+args[3]);
  }else if(args[0]==='image'&&args[1]==='inspect'){
   const imageId=args[4];value=imageId;
  }else if(args[0]==='image'&&args[1]==='save'){
   assert.deepEqual(args.slice(2),[IMAGES.proxy,IMAGES.api]);
   const fd=opts.stdio[1];assert.ok(Number.isInteger(fd));
   fs.writeSync(fd,Buffer.alloc(1024,0x42));afterSave=true;
   return failSave?{status:1,stderr:'error; secret content suppressed'}:{status:0,stderr:''};
  }else throw Error('unexpected Docker command: '+args.join(' '));
  return {status:0,stdout:JSON.stringify(value)+'\n',stderr:''};
 }
 return {invoke,calls};
}
test('RED: explicit exact two-image export to private 0600 archive is source-executable',()=>fixture(({stage})=>{
 const m=dockerMock();const r=exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'});
 assert.equal(r.code,'RC2_PRIVATE_IMAGE_EXPORT_CREATED_RESTORE_NOT_VERIFIED');
 assert.equal(r.deployed,false);assert.equal(r.restoreVerified,false);assert.equal(r.productionChangeAuthorized,false);
 const tar=path.join(stage,'rollback-images.tar'),sha=path.join(stage,'SHA256SUMS.private');
 assert.equal(fs.statSync(tar).mode&0o777,0o600);assert.equal(fs.statSync(sha).mode&0o777,0o600);
 assert.equal(fs.statSync(tar).size,1024);assert.match(fs.readFileSync(sha,'utf8'),/^[0-9a-f]{64}  rollback-images\.tar\n$/);
 assert.ok(m.calls.some(x=>x.startsWith('image save ')));
 assert.equal(m.calls.filter(x=>x.startsWith('info ')).length,2,'pin the daemon before and after');
}));
test('RED: no execution flag makes zero Docker calls or artifacts',()=>fixture(({stage})=>{
 const m=dockerMock();assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:false,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_OWNER_EXECUTION_REQUIRED/);
 assert.deepEqual(m.calls,[]);assert.deepEqual(fs.readdirSync(stage),['rc2-current-images.private.json']);
}));
test('RED: source-pinned image drift fails before archive creation',()=>fixture(({stage})=>{
 const m=dockerMock({driftImage:true});assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_IMAGE_IDENTITY_MISMATCH/);
 assert.deepEqual(fs.readdirSync(stage),['rc2-current-images.private.json']);
}));
test('RED: daemon context switch during export is rejected, never called verified',()=>fixture(({stage})=>{
 const m=dockerMock({driftDaemon:true});assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_IMAGE_IDENTITY_MISMATCH/);
 assert.ok(fs.existsSync(path.join(stage,'rollback-images.tar')));
 assert.equal(fs.existsSync(path.join(stage,'SHA256SUMS.private')),false);
}));
test('RED: image changes during export is rejected, no checksum receipt',()=>fixture(({stage})=>{
 const m=dockerMock({mutateImageDuringSave:true});assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_IMAGE_IDENTITY_MISMATCH/);
 assert.equal(fs.existsSync(path.join(stage,'SHA256SUMS.private')),false);
}));
test('RED: failing save leaves incomplete output quarantined, never self-clears',()=>fixture(({stage})=>{
 const m=dockerMock({failSave:true});assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_IMAGE_EXPORT_FAILED/);
 assert.ok(fs.existsSync(path.join(stage,'rollback-images.tar')));
 assert.equal(fs.existsSync(path.join(stage,'SHA256SUMS.private')),false);
}));
test('RED: prevent second export overwriting prior receipt, no Docker calls',()=>fixture(({stage})=>{
 exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:dockerMock().invoke,home:'/private/owner'});
 const m=dockerMock();assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_EXPORT_STAGE_NOT_EMPTY/);
 assert.deepEqual(m.calls,[]);
}));
test('RED: owner-private pin cannot be world-readable, symlinked, or hardlinked',()=>fixture(({stage,pinPath})=>{
 const cases=[()=>fs.chmodSync(pinPath,0o644),()=>{const orig=pinPath+'.backup';fs.renameSync(pinPath,orig);fs.symlinkSync(orig,pinPath);},()=>fs.linkSync(pinPath,pinPath+'.hardlink')];
 for(const change of cases){
  const m=dockerMock();change();assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_PRIVATE_PIN_UNSAFE/);
  assert.deepEqual(m.calls,[]);
  // rebuild clean state for next subcase
  for(const n of fs.readdirSync(stage))fs.rmSync(path.join(stage,n),{force:true});
  const pin={protocol:'DEVPROXY_RC2_PRIVATE_IMAGE_EXPORT_V1',dockerBinary:'/usr/local/bin/docker',dockerDaemonId:DAEMON,
   containers:[{role:'proxy',containerId:IDS.proxy,imageId:IMAGES.proxy},{role:'api',containerId:IDS.api,imageId:IMAGES.api}],ownerExportAuthorized:true};
  fs.writeFileSync(pinPath,JSON.stringify(pin)+'\n',{mode:0o600});
 }
}));
test('RED: unsafe stage mode and unrelated stage contents fail without Docker',()=>fixture(({stage})=>{
 fs.chmodSync(stage,0o755);let m=dockerMock();assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_PRIVATE_STAGE_UNSAFE/);
 fs.chmodSync(stage,0o700);fs.writeFileSync(path.join(stage,'unexpected'),'x',{mode:0o600});m=dockerMock();assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_EXPORT_STAGE_NOT_EMPTY/);
 assert.deepEqual(m.calls,[]);
}));
test('RED: refuse stale historical image tag or non-digest image reference',()=>fixture(({stage,pin,pinPath})=>{
 pin.containers[0].imageId='dev-tunnel-proxy-proxy:latest';fs.writeFileSync(pinPath,JSON.stringify(pin)+'\n');
 const m=dockerMock();assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:m.invoke,home:'/private/owner'}),/RC2_PRIVATE_PIN_UNSAFE/);
 assert.deepEqual(m.calls,[]);
}));
test('RED: default CLI is inert without flags',()=>{
 const p=path.join(__dirname,'../../scripts/rc2-export-private-images.cjs');
 const r=spawnSync(process.execPath,[p],{encoding:'utf8',timeout:2000});
 assert.equal(r.status,2);assert.match(r.stdout+r.stderr,/OWNER_EXECUTION_REQUIRED|INVALID_INVOCATION/);
});
test('RED: pin file changed during image save invalidates evidence even if bytes restored',()=>fixture(({stage,pinPath})=>{
 const m=dockerMock();let changed=false;
 const original=fs.readFileSync(pinPath);
 const wrapped=(bin,args,opts)=>{
  const r=m.invoke(bin,args,opts);
  if(args[0]==='image'&&args[1]==='save'){
   fs.writeFileSync(pinPath,original);changed=true;
  }
  return r;
 };
 assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:wrapped,home:'/private/owner'}),/RC2_IMAGE_IDENTITY_MISMATCH/);
 assert.equal(changed,true);
 assert.equal(fs.existsSync(path.join(stage,'SHA256SUMS.private')),false);
}));
test('RED: pin replacement during image save invalidates evidence before checksum',()=>fixture(({stage,pinPath})=>{
 const m=dockerMock();const original=fs.readFileSync(pinPath);
 const wrapped=(bin,args,opts)=>{
  const r=m.invoke(bin,args,opts);
  if(args[0]==='image'&&args[1]==='save'){
   fs.renameSync(pinPath,pinPath+'.old');fs.writeFileSync(pinPath,original,{mode:0o600});
  }
  return r;
 };
 assert.throws(()=>exportPinnedCurrentImages({stageRoot:stage,execute:true,spawnSyncImpl:wrapped,home:'/private/owner'}),/RC2_IMAGE_IDENTITY_MISMATCH/);
 assert.equal(fs.existsSync(path.join(stage,'SHA256SUMS.private')),false);
}));
