'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyRestoredConfigContents}=require('../../utils/rc2-restore-content-attestation.cjs');
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function fixture(fn,{dirty=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-restored-config-'));
 const extract=path.join(root,'extract'),live=path.join(root,'live');
 fs.mkdirSync(extract);fs.mkdirSync(live);
 const source=[
  ['docker-compose.yml','services: {}\n',0o644],['config/default.conf','server {}\n',0o644],
  ['build/sites-enabled/apps.generated.conf','include /apps;\n',0o644],
  ['.artifacts/admin-session.json','{"token":"fixture-only"}\n',0o600],
  ['.env','FIXTURE=1\n',0o600],
  ...Array.from({length:17},(_,i)=>['apps/app-'+i+'.conf','route '+i+'\n',0o644]),
 ];
 const epoch=Math.floor(Date.now()/100000)*100000;
 const files=[];
 for(let i=0;i<source.length;i++){
  const [rel,text,mode]=source[i];
  const mtimeMs=epoch+i*1000;
  for(const dir of [extract,live]){
   const file=path.join(dir,rel);fs.mkdirSync(path.dirname(file),{recursive:true});
   fs.writeFileSync(file,text,{mode});fs.chmodSync(file,mode);
   fs.utimesSync(file,new Date(mtimeMs),new Date(mtimeMs));
  }
  files.push({path:rel,bytes:Buffer.byteLength(text),mode,mtimeMs,sha256:digest(text)});
 }
 const manifest={version:2,sourceRoot:'/Users/owner/devproxy',sourceHead:'a'.repeat(40),
  sourceDirty:dirty,composePresent:{yml:true,override:false,production:false},
  fileCount:files.length,bytes:files.reduce((n,x)=>n+x.bytes,0),files};
 try{return fn({root,extract,live,manifest,files});}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('RED: dirty source still permits independently proving every restored byte and mtime without false preservation PASS',()=>fixture(({extract,live,manifest})=>{
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.code,'RESTORED_FILES_VERIFIED_DIRTY_SOURCE_UNACCOUNTED');
 assert.equal(r.restoredFilesVerified,true);assert.equal(r.liveIncludedFilesMatch,true);
 assert.equal(r.filesVerified,22);assert.equal(r.routesVerified,17);
 assert.equal(r.sourceCurrent,'UNKNOWN');assert.equal(r.ownerWorkPreserved,'UNKNOWN');
 assert.equal(r.releaseAuthorized,false);assert.equal(r.deployed,false);
}));
test('RED: clean source still never proves complete owner-work or live cutover',()=>fixture(({extract,live,manifest})=>{
 manifest.sourceDirty=false;
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.code,'RESTORED_FILES_VERIFIED_LIVE_INCLUDED_MATCH');
 assert.equal(r.restoredFilesVerified,true);assert.equal(r.ownerWorkPreserved,'UNKNOWN');
 assert.equal(r.productionChangeAuthorized,false);assert.equal(r.ownerUatApproved,false);
}));
test('RED: stale/live-modified owner config is detectable without reading its content into reports',()=>fixture(({extract,live,manifest})=>{
 fs.writeFileSync(path.join(live,'apps','app-6.conf'),'LOCAL CHANGES NOT IN ARCHIVE');
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.code,'LIVE_INCLUDED_FILES_DIFFER_FROM_SNAPSHOT');
 assert.equal(r.restoredFilesVerified,true);assert.equal(r.liveIncludedFilesMatch,false);
 assert.equal(JSON.stringify(r).includes('LOCAL CHANGES'),false);
}));
test('RED: restoring wrong byte under one original route must reject even if names/count are identical',()=>fixture(({extract,manifest})=>{
 fs.writeFileSync(path.join(extract,'apps','app-4.conf'),'tamper');
 const r=verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17});
 assert.equal(r.code,'RESTORED_CONTENT_MISMATCH');assert.equal(r.restoredFilesVerified,false);
}));
test('RED: missing app route and unexpected file must not become parity PASS',()=>fixture(({extract,manifest})=>{
 fs.unlinkSync(path.join(extract,'apps','app-0.conf'));
 assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17}).restoredFilesVerified,false);
 fs.writeFileSync(path.join(extract,'apps','app-0.conf'),'route 0\n');
 fs.writeFileSync(path.join(extract,'apps','unlisted.conf'),'surprise');
 const r=verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17});
 assert.equal(r.code,'RESTORED_UNLISTED_NODE');
}));
test('RED: symlink, hardlink, FIFO/special node and parent symlink never escape root',()=>fixture(({root,extract,manifest})=>{
 const victim=path.join(root,'victim');fs.writeFileSync(victim,'secret');
 const route=path.join(extract,'apps','app-0.conf');fs.unlinkSync(route);fs.symlinkSync(victim,route);
 assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17}).restoredFilesVerified,false);
 fs.unlinkSync(route);fs.linkSync(victim,route);
 assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17}).restoredFilesVerified,false);
 fs.unlinkSync(route);fs.writeFileSync(route,'route 0\n');
 fs.rmSync(path.join(extract,'apps'),{recursive:true});fs.symlinkSync(root,path.join(extract,'apps'));
 assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17}).restoredFilesVerified,false);
 assert.equal(fs.readFileSync(victim,'utf8'),'secret');
}));
test('RED: source metadata input path traversal, duplicates, mixed modes and deceptive route count fail closed',()=>fixture(({extract,manifest})=>{
 const ref=structuredClone(manifest);
 ref.files[0].path='../.env';assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest:ref,expectedRoutes:17}).restoredFilesVerified,false);
 ref.files[0].path=ref.files[1].path;assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest:ref,expectedRoutes:17}).restoredFilesVerified,false);
 ref.files[0].path=manifest.files[0].path;ref.files.find(x=>x.path==='.artifacts/admin-session.json').mode=0o644;
 assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest:ref,expectedRoutes:17}).restoredFilesVerified,false);
 assert.equal(verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:18}).restoredFilesVerified,false);
}));
test('RED: restored exact route precedence mtime is not optional',()=>fixture(({extract,manifest})=>{
 const f=path.join(extract,'apps','app-2.conf');fs.utimesSync(f,new Date(1000000),new Date(1000000));
 const r=verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17});
 assert.equal(r.code,'RESTORED_MTIME_PRECEDENCE_UNVERIFIED');assert.equal(r.restoredFilesVerified,false);
}));
test('RED: evidence operation is read-only (no files touched)',()=>fixture(({extract,live,manifest})=>{
 const get=dir=>fs.statSync(path.join(dir,'apps','app-1.conf')).mtimeMs;
 const first=[get(extract),get(live)];
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.restoredFilesVerified,true);
 assert.deepEqual([get(extract),get(live)],first);
}));

test('RED: unarchived live app route is not treated as complete preserved owner work',()=>fixture(({extract,live,manifest})=>{
 fs.writeFileSync(path.join(live,'apps','owner-new.conf'),'unarchived');
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.code,'LIVE_OWNER_DATA_NOT_IN_SNAPSHOT');assert.equal(r.liveIncludedFilesMatch,false);
 assert.equal(r.ownerWorkPreserved,'UNKNOWN');
}));
test('RED: extra live override file is preserved as an open owner-work risk',()=>fixture(({extract,live,manifest})=>{
 fs.mkdirSync(path.join(live,'overrides'));fs.writeFileSync(path.join(live,'overrides','owner.conf'),'new');
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.code,'LIVE_OWNER_DATA_NOT_IN_SNAPSHOT');
}));
test('RED: inspected live config cannot be a symlink to another owner tree',()=>fixture(({root,extract,live,manifest})=>{
 const outside=path.join(root,'different');fs.mkdirSync(outside);fs.renameSync(path.join(live,'config'),path.join(outside,'config'));
 fs.symlinkSync(path.join(outside,'config'),path.join(live,'config'));
 const r=verifyRestoredConfigContents({extractRoot:extract,liveRoot:live,manifest,expectedRoutes:17});
 assert.equal(r.restoredFilesVerified,true);assert.equal(r.liveIncludedFilesMatch,false);
}));
