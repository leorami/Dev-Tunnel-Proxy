'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const GENERATOR=path.resolve(__dirname,'../../utils/generateAppsBundle.js');
async function fixture(t,{apps={},overrides={}}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-p2-bundle-'));
 await fs.chmod(root,0o700);
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const name of ['utils','apps','overrides','build','build/sites-enabled']){
  await fs.mkdir(path.join(root,name),{mode:0o700});
 }
 await fs.copyFile(GENERATOR,path.join(root,'utils/generateAppsBundle.js'));
 for(const [name,text] of Object.entries(apps)){
  await fs.writeFile(path.join(root,'apps',name),text,{mode:0o600});
 }
 for(const [name,text] of Object.entries(overrides)){
  await fs.writeFile(path.join(root,'overrides',name),text,{mode:0o600});
 }
 const run=spawnSync(process.execPath,['utils/generateAppsBundle.js'],{
  cwd:root,encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH||'/usr/bin'}
 });
 assert.equal(run.status,0,'disposable app bundle generator must succeed');
 const bundle=await fs.readFile(path.join(root,'build/sites-enabled/apps.generated.conf'),'utf8');
 return {root,bundle};
}
test('RED: generated offline app uses runtime name resolution and isolated 503, never static startup DNS',async t=>{
 const {bundle}=await fixture(t,{apps:{
  'offline.conf':'location /offline/ {\n  proxy_pass http://offline-app.invalid:7300/prefix/;\n}\n'
 }});
 assert.match(bundle,/location \/offline\//);
 assert.match(bundle,/resolver 127\.0\.0\.11 ipv6=off;/);
 assert.match(bundle,/set \$up_offline_app_invalid_7300_1 offline-app\.invalid:7300;/);
 assert.match(bundle,/proxy_pass http:\/\/\$up_offline_app_invalid_7300_1\/prefix\//);
 assert.doesNotMatch(bundle,/proxy_pass http:\/\/offline-app\.invalid:7300/);
 assert.match(bundle,/location @upstream_unavailable/);
 assert.match(bundle,/error_page 502 503 504 = @upstream_unavailable/);
});
test('RED: owner override wins over duplicate app route; unrelated app stays in generated bundle',async t=>{
 const {bundle}=await fixture(t,{
  overrides:{'primary.conf':'location /shared/ {\n  proxy_pass http://override-host.invalid:7301/;\n}\n'},
  apps:{
   'secondary.conf':'location /shared/ {\n  proxy_pass http://overridden-host.invalid:7302/;\n}\n',
   'healthy.conf':'location /healthy/ {\n  proxy_pass http://healthy-host.invalid:7303/;\n}\n'
  }
 });
 assert.match(bundle,/override-host\.invalid:7301/);
 assert.match(bundle,/healthy-host\.invalid:7303/);
 assert.doesNotMatch(bundle,/overridden-host\.invalid:7302/);
 assert.match(bundle,/location \/shared\//);
 assert.match(bundle,/location \/healthy\//);
 assert.doesNotMatch(bundle,/proxy_pass http:\/\/(?:override-host|healthy-host)\.invalid:\d+/);
});
