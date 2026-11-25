'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('supported LTS floor: ordinary Dev Proxy compose and executable helpers select qualified Node 24',()=>{
 for(const file of ['docker-compose.yml','docker-compose.production.yml','smart-build.sh','utils/calliopeHealing.js','utils/proxyConfigAPI.js']){
  const text=read(file);
  const refs=[...text.matchAll(/\bnode:(\d+)(?=[.-])/g)].map(m=>Number(m[1]));
  assert.ok(refs.length>0,file+' missing runtime references');
  assert.ok(refs.every(n=>n===24),file+' references '+refs.join(','));
 }
});
test('developer Node contract is explicit, default 24 and supported major lines only',()=>{
 const p=JSON.parse(read('package.json'));
 assert.equal(p.engines?.node,'22.x || 24.x || 26.x');
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(lock.packages[''].engines?.node,p.engines.node);
 assert.equal(read('.nvmrc').trim(),'24');
});
test('ordinary launchers, developer templates, and active CI stay on supported Node lines',()=>{
 const launchers=['test/run-calliope-visual-tests.sh','test/manual-calliope-validation.md','examples/next/docker-compose.overlay.yml','examples/next/README.md','INTEGRATION_GUIDE.md'];
 for(const file of launchers){
  const refs=[...read(file).matchAll(/\bnode:(\d+)(?=[.-])/g)].map(m=>Number(m[1]));
  assert.ok(refs.length>0,file+' missing runtime references');
  assert.ok(refs.every(n=>n===24),file+' references '+refs.join(','));
 }
 const workflows=fs.readdirSync(path.join(root,'.github/workflows')).filter(name=>name.endsWith('.yml'));
 for(const name of workflows){
  const text=read(path.join('.github/workflows',name));
  if(!text.includes('actions/setup-node@')) continue;
  assert.match(text,/check-latest:\s*true/,name+' must take the current patch');
  const pinned=[...text.matchAll(/node-version:\s*'([^']+)'/g)].map(m=>m[1]);
  for(const version of pinned){
   assert.match(version,/^(22|24|26)(\.x)?$/,name+' node-version '+version);
  }
 }
});
test('historical recovery image binding retains its original digest/tag; it is not the new runtime image',()=>{
 const {COMPOSE_BINDINGS}=require('../../utils/recovery-image-binding.cjs');
 const api=COMPOSE_BINDINGS.find(x=>x.container==='dev-proxy-config-api');
 assert.equal(api.composeRef,'node:18-alpine');
 assert.equal(api.originalId,'sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e');
});
