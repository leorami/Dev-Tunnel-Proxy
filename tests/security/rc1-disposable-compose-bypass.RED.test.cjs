'use strict';
// CTO RED contract based on Engineer-I P0 tip 240f692b4174c8d84541b4c068dd811016730242.
// Fixture-only tests: never launch Docker, read private paths, or contact live services.
const test=require('node:test');
const assert=require('node:assert/strict');
const {runPremutationGuard}=require('../../utils/rc1-release-drift-attest.cjs');

const base={DEVPROXY_DISPOSABLE_STACK:'1',COMPOSE_PROJECT_NAME:'devproxy-test-123'};
async function denied(action,env){
  const actual=await runPremutationGuard(action,{
    env,liveContainersPresent:false,
    live:{
      attested:false,liveSource:'unknown',proxyImage:'unknown',
      publicHealth:'unknown',anonymousRoutes:'unknown',
      managementPorts:'unknown',apiDockerSocket:'unknown',
      privateConfigPreserved:false,routeFingerprintPreserved:false
    },
    candidate:{
      sourceSha:'0000000000000000000000000000000000000000',
      exactPrivateMounts:false,sharedConfigDigest:false,
      trustedOriginsPreserved:false,rollbackReady:false,verifiedDisposable:false
    }
  });
  assert.equal(actual.productionChangeAuthorized,false);
  assert.equal(actual.mutationAllowed,false,action+': env-only flag bypassed fail-closed policy');
  assert.notEqual(actual.code,'DISPOSABLE_STACK_ALLOWED');
}

test('RED: no running production names does NOT make default Compose safe',async()=>{
  for(const action of ['up','restart','apply','down'])await denied(action,base);
});
test('RED: COMPOSE_FILE may name owner/default config even with disposable prefix',async()=>{
  await denied('up',{...base,COMPOSE_FILE:'docker-compose.yml:docker-compose.override.yml'});
  await denied('apply',{...base,COMPOSE_FILE:'docker-compose.production.yml'});
});
test('RED: arbitrary Docker context cannot be certified by a project prefix',async()=>{
  await denied('restart',{...base,DOCKER_HOST:'ssh://untrusted.example'});
});
test('RED: owner bind and fixed container_name are not isolated by project name',async()=>{
  await denied('up',{...base,COMPOSE_PROJECT_NAME:'rc1-fixture',DEVPROXY_OWNER_ROOT:'/private/example'});
});
test('RED: disposable flag alone never authorizes host mutation',async()=>{
  await denied('down',{...base,COMPOSE_PROJECT_NAME:'tmp-cleanroom',COMPOSE_PROFILES:'dashboard'});
});
