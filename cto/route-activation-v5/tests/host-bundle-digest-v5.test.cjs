'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createHostBundleDigestVerifier}=require('../utils/host-bundle-digest-verifier.cjs');
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-v5-host-bundle-'));
 const dir=path.join(root,'build','sites-enabled');await fs.mkdir(dir,{recursive:true});t.after(async()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(dir,'apps.generated.conf');await fs.writeFile(file,'location ^~ /project/ { return 200; }\n');
 const sha=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
 return {root,dir,file,sha};}
test('host verifier accepts exact digest of canonical regular generated file',async t=>{
 const f=await setup(t);const verify=createHostBundleDigestVerifier({approvedRoot:f.root});
 assert.equal(await verify(null,f.sha),true);assert.equal(await verify(null,'0'.repeat(64)),false);
});
test('host verifier denies symlinked bundle without following outside file',async t=>{
 const f=await setup(t);await fs.rename(f.file,f.file+'.target');await fs.symlink(f.file+'.target',f.file);
 assert.equal(await createHostBundleDigestVerifier({approvedRoot:f.root})(null,f.sha),false);
});
test('host verifier denies symlinked parent directory and disallowed route data trees',async t=>{
 const f=await setup(t);const other=path.join(f.root,'else');await fs.rename(f.dir,other);
 await fs.symlink(other,f.dir);
 assert.equal(await createHostBundleDigestVerifier({approvedRoot:f.root})(null,f.sha),false);
 assert.throws(()=>createHostBundleDigestVerifier({approvedRoot:f.root,relativeBundle:'etc/passwd'}),/INVALID_/);
});
test('host verifier denies hardlinked source and invalid supplied digest',async t=>{
 const f=await setup(t);await fs.link(f.file,f.file+'.copy');const verify=createHostBundleDigestVerifier({approvedRoot:f.root});
 assert.equal(await verify(null,f.sha),false);assert.equal(await verify(null,'not-a-digest'),false);
});
test('host verifier respects abort and missing bundle without reading secrets',async t=>{
 const f=await setup(t);const c=new AbortController();c.abort();const verify=createHostBundleDigestVerifier({approvedRoot:f.root});
 assert.equal(await verify(c.signal,f.sha),false);await fs.unlink(f.file);assert.equal(await verify(null,f.sha),false);
});
