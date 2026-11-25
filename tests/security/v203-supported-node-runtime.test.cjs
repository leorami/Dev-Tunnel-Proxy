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
test('historical recovery image binding retains its original digest/tag; it is not the new runtime image',()=>{
 const {COMPOSE_BINDINGS}=require('../../utils/recovery-image-binding.cjs');
 const api=COMPOSE_BINDINGS.find(x=>x.container==='dev-proxy-config-api');
 assert.equal(api.composeRef,'node:18-alpine');
 assert.equal(api.originalId,'sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e');
});
