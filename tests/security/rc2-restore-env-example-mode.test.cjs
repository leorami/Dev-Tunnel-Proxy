'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyRestoredConfigContents}=require('../../utils/rc2-restore-content-attestation.cjs');
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
test('RED: public .env.example at 0644 must not invalidate an otherwise private archive',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-envex-'));
 const extract=path.join(root,'extract');fs.mkdirSync(extract);
 const epoch=Math.floor(Date.now()/100000)*100000;
 const source=[
  ['docker-compose.yml','services: {}\n',0o644],['config/default.conf','server {}\n',0o644],
  ['build/sites-enabled/apps.generated.conf','include /apps;\n',0o644],
  ['.artifacts/admin-session.json','{"token":"fixture-only"}\n',0o600],
  ['.env','SECRET=1\n',0o600],['.env.example','SECRET=\n',0o644],
  ...Array.from({length:17},(_,i)=>['apps/app-'+i+'.conf','route '+i+'\n',0o644]),
 ];
 const files=[];
 for(let i=0;i<source.length;i++){
  const [rel,text,mode]=source[i];const mtimeMs=epoch+i*1000;
  const file=path.join(extract,rel);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,text,{mode});fs.chmodSync(file,mode);
  fs.utimesSync(file,new Date(mtimeMs),new Date(mtimeMs));
  files.push({path:rel,bytes:Buffer.byteLength(text),mode,mtimeMs,sha256:digest(text)});
 }
 const manifest={version:2,sourceRoot:'/Users/owner/devproxy',sourceHead:'b'.repeat(40),
  sourceDirty:true,composePresent:{yml:true,override:false,production:false},
  fileCount:files.length,bytes:files.reduce((n,x)=>n+x.bytes,0),files};
 try{
  const r=verifyRestoredConfigContents({extractRoot:extract,manifest,expectedRoutes:17});
  assert.equal(r.code,'RESTORED_FILES_VERIFIED_DIRTY_SOURCE_UNACCOUNTED');
  assert.equal(r.restoredFilesVerified,true);
  assert.equal(r.deployed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
