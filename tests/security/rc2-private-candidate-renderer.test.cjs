'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {renderPrivateRc2Candidate}=require('../../scripts/rc2-render-private-compose-candidate.cjs');
async function fixture(fn){
 const stage=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'rc2-stage-owned-')));
 await fs.chmod(stage,0o700);
 const manifestPath=path.join(stage,'rc2-candidate-pins.json');
 const outPath=path.join(stage,'rc2-compose-candidate.json');
 const input={proxyImage:'registry.example.invalid/p@sha256:'+'a'.repeat(64),
 apiImage:'registry.example.invalid/api@sha256:'+'b'.repeat(64),apiUid:504,apiGid:20,
 paths:{sourceRoot:stage+'/source',ownerEnvFile:stage+'/private/owner.env',
 secretHostFile:stage+'/private/activation.secret',spoolHostDir:stage+'/private/spool',
 appsDir:stage+'/data/apps',overridesDir:stage+'/data/overrides',
 sitesDir:stage+'/data/sites-enabled',artifactsDir:stage+'/data/artifacts',
 nginxConf:stage+'/source/config/nginx.production.conf',
 defaultConf:stage+'/source/config/default.production.conf',
 nginxEntrypoint:stage+'/source/scripts/nginx-entrypoint.sh',
 certsDir:stage+'/data/certs',statusDir:stage+'/data/status',
 dashboardDir:stage+'/source/dashboard/public'}};
 try{
  await fs.writeFile(manifestPath,JSON.stringify(input)+'\n',{mode:0o600});
  return await fn({stage,manifestPath,outPath,input});
 }finally{await fs.rm(stage,{recursive:true,force:true});}
}
test('RED: render an exact two-service candidate from owner-private manifest without Docker operations',()=>fixture(async({stage,outPath})=>{
 const r=await renderPrivateRc2Candidate({stageRoot:stage});
 assert.equal(r.code,'RC2_PRIVATE_CANDIDATE_RENDERED');
 assert.equal(r.productionChangeAuthorized,false);assert.equal(r.deployed,false);
 assert.equal('outputPath' in r,false);
 const st=await fs.lstat(outPath);assert.equal(st.isFile(),true);assert.equal(st.nlink,1);
 assert.equal(st.mode&0o777,0o600);
 const body=JSON.parse(await fs.readFile(outPath,'utf8'));
 assert.deepEqual(Object.keys(body.services),['proxy','proxy-config-api']);
 assert.equal(body.services['proxy-config-api'].user,'504:20');
 assert.equal(body.services['proxy-config-api'].read_only,true);
 assert.equal(body.services.proxy.networks[0],'devproxy');
}));
test('RED: never overwrite an already-rendered private candidate',()=>fixture(async({stage,outPath})=>{
 await renderPrivateRc2Candidate({stageRoot:stage});
 const before=await fs.readFile(outPath);
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:stage}),/RC2_CANDIDATE_EXISTS/);
 assert.deepEqual(await fs.readFile(outPath),before);
}));
test('RED: refuse public-stage directory before opening owner manifest',()=>fixture(async({stage,outPath})=>{
 await fs.chmod(stage,0o755);
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:stage}),/RC2_PRIVATE_STAGE_UNSAFE/);
 await assert.rejects(()=>fs.readFile(outPath),/ENOENT/);
}));
test('RED: refuse symlink staging directory',()=>fixture(async({stage})=>{
 const alias=stage+'-alias';await fs.symlink(stage,alias);
 try{await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:alias}),/RC2_PRIVATE_STAGE_UNSAFE/);}
 finally{await fs.unlink(alias);}
}));
test('RED: refuse public 0644 owner-pins file and never write output',()=>fixture(async({stage,manifestPath,outPath})=>{
 await fs.chmod(manifestPath,0o644);
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:stage}),/RC2_PRIVATE_MANIFEST_UNSAFE/);
 await assert.rejects(()=>fs.readFile(outPath),/ENOENT/);
}));
test('RED: refuse symlink pins, no following into an untrusted inode',()=>fixture(async({stage,manifestPath,outPath})=>{
 const backup=manifestPath+'.backup';await fs.rename(manifestPath,backup);
 await fs.symlink(backup,manifestPath);
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:stage}),/RC2_PRIVATE_MANIFEST_UNSAFE/);
 await assert.rejects(()=>fs.readFile(outPath),/ENOENT/);
}));
test('RED: refuse hardlinked owner pins',()=>fixture(async({stage,manifestPath,outPath})=>{
 await fs.link(manifestPath,manifestPath+'.extra');
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:stage}),/RC2_PRIVATE_MANIFEST_UNSAFE/);
 await assert.rejects(()=>fs.readFile(outPath),/ENOENT/);
}));
test('RED: invalid manifest does not write output and redacts private content',()=>fixture(async({stage,manifestPath,outPath,input})=>{
 input.apiUid=0;await fs.writeFile(manifestPath,JSON.stringify(input)+'\n');
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:stage}),/RC2_PRIVATE_MANIFEST_UNSAFE/);
 await assert.rejects(()=>fs.readFile(outPath),/ENOENT/);
}));
test('RED: unknown stageRoot options and accessor objects fail before filesystem work',async()=>{
 await assert.rejects(()=>renderPrivateRc2Candidate({stageRoot:'/tmp',deploy:true}),/RC2_PRIVATE_STAGE_UNSAFE/);
 const o={};Object.defineProperty(o,'stageRoot',{get(){throw Error('poison');}});
 await assert.rejects(()=>renderPrivateRc2Candidate(o),/RC2_PRIVATE_STAGE_UNSAFE/);
});
test('RED: no dangerous IO action depends on git, sudo, Docker, or network',()=>fixture(async({stage,outPath})=>{
 const r=await renderPrivateRc2Candidate({stageRoot:stage});
 assert.equal(r.productionChangeAuthorized,false);assert.equal(r.deployed,false);
 const text=await fs.readFile(outPath,'utf8');
 assert.equal(text.includes('docker.sock'),false);assert.equal(text.includes('ngrok:'),false);
 assert.equal(text.includes('sudo'),false);assert.equal(text.includes('git clone'),false);
}));
