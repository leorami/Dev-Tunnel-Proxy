'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {inspectPrivateConfigArchive}=require('../../utils/rc2-readonly-config-archive.cjs');
function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-config-evidence-'));
 const parent=path.join(root,'private-rollbacks'),stage=path.join(parent,'config-example');
 fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(stage,{mode:0o700});
 const mk=(name,mode=0o644)=>({path:name,bytes:12,mode,mtimeMs:12345.75,sha256:'a'.repeat(64)});
 const files=[mk('docker-compose.yml'),mk('config/default.conf'),mk('build/sites-enabled/apps.generated.conf'),
  mk('.env',0o600),mk('.artifacts/admin-session.json',0o600),...Array.from({length:17},(_,i)=>mk('apps/app-'+i+'.conf'))];
 const manifest={version:2,sourceRoot:'/Users/owner/devproxy',sourceHead:'b'.repeat(40),sourceDirty:false,
  composePresent:{yml:true,override:false,production:true},fileCount:files.length,
  bytes:files.reduce((s,x)=>s+x.bytes,0),files};
 const body=Buffer.alloc(1024,0x45),digest=crypto.createHash('sha256').update(body).digest('hex');
 const tar=path.join(stage,'config-state.tar'),sum=path.join(stage,'SHA256SUMS.private'),mfile=path.join(stage,'manifest.private.json');
 fs.writeFileSync(tar,body,{mode:0o600});fs.writeFileSync(sum,digest+'  config-state.tar\n',{mode:0o600});
 fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n',{mode:0o600});
 try{return fn({root,parent,stage,tar,sum,mfile,manifest});}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('RED: verify private config archive, session 0600 and original 17 route sources',()=>fixture(({stage})=>{
 const r=inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17});
 assert.equal(r.code,'RC2_CONFIG_ARCHIVE_CHECKSUM_MATCHES_RESTORE_NOT_VERIFIED');
 assert.equal(r.archiveHashMatches,true);assert.equal(r.sessionModePrivate,true);
 assert.equal(r.routeFilesRecorded,17);assert.equal(r.restoreVerified,false);
 assert.equal(r.sourceCurrent,'UNKNOWN');assert.equal(r.ownerWorkPreserved,'UNKNOWN');
}));
test('RED: incomplete route manifest cannot masquerade as preserved 17 owner routes',()=>fixture(({stage,mfile,manifest})=>{
 manifest.files=manifest.files.filter(f=>f.path!=='apps/app-0.conf');manifest.fileCount=manifest.files.length;
 manifest.bytes=manifest.files.reduce((s,x)=>s+x.bytes,0);
 fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 const r=inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17});
 assert.equal(r.code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
}));
test('RED: permissive saved owner session must block recovery evidence',()=>fixture(({stage,mfile,manifest})=>{
 manifest.files.find(x=>x.path==='.artifacts/admin-session.json').mode=0o644;
 fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
}));
test('RED: source dirty, unknown SHA or unsafe .env mode cannot become PASS',()=>fixture(({stage,mfile,manifest})=>{
 manifest.sourceDirty=true;fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
 manifest.sourceDirty=false;manifest.sourceHead='UNKNOWN';fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
 manifest.sourceHead='b'.repeat(40);manifest.files.find(x=>x.path==='.env').mode=0o644;
 fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
}));
test('RED: traversal and duplicate source manifest paths fail',()=>fixture(({stage,mfile,manifest})=>{
 manifest.files[0].path='../.env';fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
 manifest.files[0].path=manifest.files[1].path;fs.writeFileSync(mfile,JSON.stringify(manifest)+'\n');
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).code,'RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED');
}));
test('RED: modified config tar fails SHA check',()=>fixture(({stage,tar})=>{
 fs.writeFileSync(tar,Buffer.alloc(1024,0x46));
 assert.equal(inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17}).archiveHashMatches,false);
}));
test('RED: no file writes or Docker commands by read-only inspector',()=>fixture(({stage})=>{
 const before=fs.readdirSync(stage).map(n=>({n,mtimeMs:fs.statSync(path.join(stage,n)).mtimeMs}));
 inspectPrivateConfigArchive({stageRoot:stage,expectedRouteCount:17});
 const after=fs.readdirSync(stage).map(n=>({n,mtimeMs:fs.statSync(path.join(stage,n)).mtimeMs}));
 assert.deepEqual(after,before);
}));
