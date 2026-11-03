'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createCandidateManifest,verifyCandidateManifest,CANDIDATE_PATHS}=require('../../utils/rc1-route-candidate-manifest.cjs');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-attest-'));
 await fs.mkdir(path.join(root,'config'));
 await fs.mkdir(path.join(root,'build','sites-enabled'),{recursive:true});
 await fs.writeFile(path.join(root,'config','nginx.production.conf'),'events {}\nhttp {}\n');
 await fs.writeFile(path.join(root,'config','default.production.conf'),'location /devproxy { proxy_pass http://test; }\n');
 await fs.writeFile(path.join(root,'build','sites-enabled','apps.generated.conf'),'location /alpha { proxy_pass http://alpha; }\n');
 return {root,cleanup:()=>fs.rm(root,{recursive:true,force:true})};
}
test('candidate identity incorporates exactly three approved absolute-path-rooted files',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const m=await createCandidateManifest({approvedRoot:f.root});
 assert.deepEqual(Object.keys(m),['protocol','candidateSha256','parts']);
 assert.equal(m.protocol,'DEVPROXY_CONFIG_SET_V2');
 assert.match(m.candidateSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(m.parts.map(x=>x.path),CANDIDATE_PATHS);
 assert.ok(m.parts.every(x=>x.bytes>0 && /^[a-f0-9]{64}$/.test(x.sha256)));
 assert.ok(!(JSON.stringify(m)).includes('proxy_pass'));
 assert.equal((await verifyCandidateManifest({approvedRoot:f.root,expectedCandidateSha256:m.candidateSha256})).ok,true);
});
test('changing security-sensitive default nginx config invalidates whole-candidate proof',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const old=await createCandidateManifest({approvedRoot:f.root});
 await fs.writeFile(path.join(f.root,'config','default.production.conf'),'location /admin { allow all; }\n');
 const next=await createCandidateManifest({approvedRoot:f.root});
 assert.notEqual(next.candidateSha256,old.candidateSha256);
 assert.deepEqual((await verifyCandidateManifest({approvedRoot:f.root,expectedCandidateSha256:old.candidateSha256})).ok,false);
});
test('changing top-level nginx security config invalidates whole-candidate proof',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const old=await createCandidateManifest({approvedRoot:f.root});
 await fs.writeFile(path.join(f.root,'config','nginx.production.conf'),'events {}\nhttp { autoindex on; }');
 assert.equal((await verifyCandidateManifest({approvedRoot:f.root,expectedCandidateSha256:old.candidateSha256})).ok,false);
});
test('generated route bundle change invalidates whole-candidate proof',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const old=await createCandidateManifest({approvedRoot:f.root});
 await fs.writeFile(path.join(f.root,'build','sites-enabled','apps.generated.conf'),'location /beta { proxy_pass http://beta; }\n');
 assert.equal((await verifyCandidateManifest({approvedRoot:f.root,expectedCandidateSha256:old.candidateSha256})).ok,false);
});
test('rejects symlink leaf instead of reading target',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const p=path.join(f.root,'config','default.production.conf');
 await fs.rename(p,p+'.orig');await fs.symlink(p+'.orig',p);
 await assert.rejects(createCandidateManifest({approvedRoot:f.root}),/UNSAFE_CANDIDATE_FILE/);
});
test('rejects symlink intermediate directory',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const p=path.join(f.root,'build','sites-enabled');
 await fs.rename(p,p+'.real');await fs.symlink(p+'.real',p);
 await assert.rejects(createCandidateManifest({approvedRoot:f.root}),/UNSAFE_CANDIDATE_DIRECTORY/);
});
test('rejects shared-inode hardlinked config file',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const p=path.join(f.root,'config','default.production.conf');
 await fs.link(p,path.join(f.root,'config','other-link.conf'));
 await assert.rejects(createCandidateManifest({approvedRoot:f.root}),/UNSAFE_CANDIDATE_FILE/);
});
test('rejects missing required file (never silently proves partial set)',async t=>{
 const f=await fixture();t.after(f.cleanup);
 await fs.rm(path.join(f.root,'config','nginx.production.conf'));
 await assert.rejects(createCandidateManifest({approvedRoot:f.root}),/CANDIDATE_UNAVAILABLE/);
});
test('rejects oversized configuration contents',async t=>{
 const f=await fixture();t.after(f.cleanup);
 await fs.writeFile(path.join(f.root,'config','default.production.conf'),Buffer.alloc(1048577,65));
 await assert.rejects(createCandidateManifest({approvedRoot:f.root}),/UNSAFE_CANDIDATE_FILE/);
});
test('requires absolute normalized approved root and never accepts user paths',async t=>{
 const f=await fixture();t.after(f.cleanup);
 await assert.rejects(createCandidateManifest({approvedRoot:'.'}),/INVALID_APPROVED_CANDIDATE_ROOT/);
 await assert.rejects(createCandidateManifest({approvedRoot:'/'}),/INVALID_APPROVED_CANDIDATE_ROOT/);
 await assert.rejects(createCandidateManifest({approvedRoot:f.root+'/..'}),/INVALID_APPROVED_CANDIDATE_ROOT/);
 assert.equal(Object.hasOwn(CANDIDATE_PATHS,'push'),false);
});
test('rejects malformed expected digest and only emits redacted classifications',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const invalid=await verifyCandidateManifest({approvedRoot:f.root,expectedCandidateSha256:'bad'});
 assert.deepEqual(invalid,{ok:false,code:'INVALID_EXPECTED_CONFIG_SET_DIGEST'});
 const m=await createCandidateManifest({approvedRoot:f.root});
 const mismatch=await verifyCandidateManifest({approvedRoot:f.root,expectedCandidateSha256:crypto.randomBytes(32).toString('hex')});
 assert.deepEqual(mismatch,{ok:false,code:'CONFIG_SET_DIGEST_MISMATCH'});
 assert.notEqual(m.candidateSha256,'');
});
test('does not modify any candidate file or write recovery metadata',async t=>{
 const f=await fixture();t.after(f.cleanup);
 const files=CANDIDATE_PATHS.map(x=>path.join(f.root,x));
 const prior=await Promise.all(files.map(x=>fs.stat(x)));
 await createCandidateManifest({approvedRoot:f.root});
 const after=await Promise.all(files.map(x=>fs.stat(x)));
 for(let i=0;i<files.length;i++)assert.equal(after[i].mtimeMs,prior[i].mtimeMs);
 assert.deepEqual((await fs.readdir(f.root)).sort(),['build','config']);
});
