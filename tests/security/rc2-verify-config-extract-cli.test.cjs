'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const CLI=path.resolve(__dirname,'../../scripts/rc2-verify-config-extract.cjs');
function sha(s){return crypto.createHash('sha256').update(s).digest('hex');}
function fixture(fn,dirty=true){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rc2-private-verify-cli-'));
 const parent=path.join(temp,'private-rollbacks'),stage=path.join(parent,'config-aaaa'),
  extract=path.join(temp,'extracted'),live=path.join(temp,'live');
 fs.mkdirSync(parent,{mode:0o700});fs.mkdirSync(stage,{mode:0o700});
 fs.mkdirSync(extract);fs.mkdirSync(live);
 const entries=[
  ['docker-compose.yml','services: {}\n',0o644],['config/default.conf','x\n',0o644],
  ['build/sites-enabled/apps.generated.conf','route\n',0o644],
  ['.artifacts/admin-session.json','{}\n',0o600],['.env','DUMMY=TRUE\n',0o600],
  ['apps/owner.conf','pass\n',0o644]
 ];
 const files=[];
 for(const [rel,body,mode] of entries){
  for(const root of [extract,live]){
   const dst=path.join(root,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});
   fs.writeFileSync(dst,body,{mode});fs.chmodSync(dst,mode);
  }
  files.push({path:rel,bytes:Buffer.byteLength(body),mode,mtimeMs:fs.statSync(path.join(extract,rel)).mtimeMs,sha256:sha(body)});
 }
 const manifest={version:2,sourceRoot:'/Users/owner/project',sourceHead:'a'.repeat(40),sourceDirty:dirty,
  composePresent:{yml:true,override:false,production:true},fileCount:files.length,
  bytes:files.reduce((s,f)=>s+f.bytes,0),files};
 const mfile=path.join(stage,'manifest.private.json');
 fs.writeFileSync(mfile,JSON.stringify(manifest),{mode:0o600});
 const tar=path.join(stage,'config-state.tar'),sum=path.join(stage,'SHA256SUMS.private');
 fs.writeFileSync(tar,Buffer.alloc(1024,0x42),{mode:0o600});
 fs.writeFileSync(sum,sha(fs.readFileSync(tar))+'  config-state.tar\n',{mode:0o600});
 try{return fn({parent,stage,extract,live,mfile,manifest,temp,tar,sum});}finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function run(args){return spawnSync(process.execPath,[CLI,...args],{encoding:'utf8',timeout:5000});}
test('RED: default CLI is inert and reveals no paths',()=>{
 const r=run([]);assert.equal(r.status,2);assert.match(r.stdout,/INVALID_OPERATOR_ARGS/);
 assert.equal(r.stdout.includes('/Users/'),false);
});
test('RED: protected private dirty manifest proves bytes but returns PARTIAL exit 3 (never release GO)',()=>fixture(({extract,live,mfile})=>{
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--live-root',live,'--expected-routes','1']);
 assert.equal(r.status,3,JSON.stringify(r));
 assert.match(r.stdout,/RESTORED_FILES_VERIFIED_DIRTY_SOURCE_UNACCOUNTED/);
 assert.match(r.stdout,/OWNER_WORK_UNKNOWN; NO_DEPLOY/);
 assert.equal(r.stdout.includes(mfile),false);
}));
test('RED: clean manifest and exact live content return evidence 0 but still explicitly NO_DEPLOY',()=>fixture(({extract,live,mfile})=>{
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--live-root',live,'--expected-routes','1']);
 assert.equal(r.status,0,r.stdout);assert.match(r.stdout,/RESTORED_FILES_VERIFIED_LIVE_INCLUDED_MATCH/);
 assert.match(r.stdout,/SOURCE_CURRENT_UNKNOWN; OWNER_WORK_UNKNOWN; NO_DEPLOY/);
},false));
test('RED: symlink private manifest is refused before file read',()=>fixture(({extract,mfile,stage})=>{
 const actual=path.join(stage,'actual.txt');fs.renameSync(mfile,actual);fs.symlinkSync(actual,mfile);
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1']);
 assert.equal(r.status,2);assert.match(r.stdout,/PRIVATE_MANIFEST_UNSAFE/);
}));
test('RED: permissive stage or manifest are refused without touching owner data',()=>fixture(({extract,mfile,stage})=>{
 fs.chmodSync(stage,0o755);
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1']);
 assert.equal(r.status,2);assert.match(r.stdout,/PRIVATE_MANIFEST_UNSAFE/);
 fs.chmodSync(stage,0o700);fs.chmodSync(mfile,0o644);
 const s=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1']);
 assert.equal(s.status,2);assert.match(s.stdout,/PRIVATE_MANIFEST_UNSAFE/);
}));
test('RED: binary garbage/private path and forbidden flags remain inert and redacted',()=>fixture(({extract,mfile,temp})=>{
 fs.writeFileSync(mfile,'private secret 🗝️ '.repeat(12));
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1']);
 assert.equal(r.status,2);assert.match(r.stdout,/PRIVATE_MANIFEST_UNSAFE/);
 assert.equal(r.stdout.includes('private secret'),false);
 assert.equal(r.stderr,'');
 const args=['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1','--execute'];
 const bad=run(args);assert.equal(bad.status,2);assert.match(bad.stdout,/INVALID_OPERATOR_ARGS/);
 assert.equal(bad.stdout.includes(temp),false);
}));

test('RED: mismatched original archive checksum cannot be called restored even if extracted contents match manifest',()=>fixture(({mfile,tar,extract,live})=>{
 fs.writeFileSync(tar,Buffer.alloc(1024,0x33));
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--live-root',live,'--expected-routes','1']);
 assert.equal(r.status,2,r.stdout);assert.match(r.stdout,/PRIVATE_ARCHIVE_UNVERIFIED/);
}));
test('RED: a replaced original archive symlink cannot be followed',()=>fixture(({mfile,tar,extract,stage})=>{
 const alt=path.join(stage,'payload');fs.renameSync(tar,alt);fs.symlinkSync(alt,tar);
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1']);
 assert.equal(r.status,2);assert.match(r.stdout,/PRIVATE_ARCHIVE_UNVERIFIED/);
}));
test('RED: checksum file changed or missing is a hard FAIL regardless of restored contents',()=>fixture(({mfile,sum,extract})=>{
 fs.writeFileSync(sum,'0'.repeat(64)+'  config-state.tar\n');
 const r=run(['--inspect','--manifest',mfile,'--extract-root',extract,'--expected-routes','1']);
 assert.equal(r.status,2);assert.match(r.stdout,/PRIVATE_ARCHIVE_UNVERIFIED/);
}));
