'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectEffectiveCompose } = require('../../utils/p0-effective-compose-guard.cjs');
function port(host_ip,target,published){return {host_ip,target,published,protocol:'tcp'};}
function bind(source,target,read_only){return {type:'bind',source,target,read_only};}
function candidate(){return {
  services:{
    proxy:{container_name:'dev-proxy',ports:[port('0.0.0.0',80,8080),port('0.0.0.0',443,443)],
      volumes:[bind('/private/release/default.conf','/etc/nginx/conf.d/default.conf',true)]},
    'proxy-config-api':{container_name:'dev-proxy-config-api',
      environment:{DEVPROXY_TRUSTED_ORIGINS:'https://example.test http://127.0.0.1:8080',NODE_ENV:'production'},
      ports:[port('127.0.0.1',3001,3001),port('127.0.0.1',3002,3002)],
      volumes:[bind('/candidate/source','/app',true),bind('/private/release/default.conf','/app/config/default.production.conf',true),
      bind('/owner/.env','/app/.env',true),bind('/owner/.artifacts','/app/.artifacts',false)],
    }
  }
};}
const run=o=>inspectEffectiveCompose(o);
test('complete synthetic candidate is PLAN_ONLY, never authorized/deployed',()=>{
  const r=run(candidate());assert.equal(r.code,'EFFECTIVE_COMPOSE_PLAN_ONLY');
  assert.equal(r.productionChangeAuthorized,false);assert.equal(r.performedActions,false);
  assert.deepEqual(r.blockers,[]);
});
test('explicit ADMIN_PASSWORD in API env blocks regardless of value',()=>{
  for(const secret of ['SYNTHETIC_FIXTURE_NOT_REAL','',null]){
    const c=candidate();c.services['proxy-config-api'].environment.ADMIN_PASSWORD=secret;
    assert.equal(run(c).code,'API_AUTH_OVERRIDE');
    assert.doesNotMatch(JSON.stringify(run(c)),/SYNTHETIC_FIXTURE_NOT_REAL/);
  }
});
test('API env_file interpolation bypass is blocked unless owner separately attests contents',()=>{
  for(const values of [['/private/fixture.env'],[{path:'/private/fixture.env',required:true}]]){
    const c=candidate();c.services['proxy-config-api'].env_file=values;
    assert.equal(run(c).code,'API_AUTH_OVERRIDE');
  }
});
test('missing or empty trusted origins always blocks',()=>{
  for(const value of [undefined,'',null]){
    const c=candidate();if(value===undefined)delete c.services['proxy-config-api'].environment.DEVPROXY_TRUSTED_ORIGINS;
    else c.services['proxy-config-api'].environment.DEVPROXY_TRUSTED_ORIGINS=value;
    assert.equal(run(c).code,'MISSING_TRUSTED_ORIGINS');
  }
});
test('admin API ports must be precisely loopback, never unspecified or all-host',()=>{
  for(const host of ['','0.0.0.0','::','192.0.2.6',undefined]){
    const c=candidate();c.services['proxy-config-api'].ports[0].host_ip=host;
    assert.equal(run(c).code,'API_PUBLISHED_OUTSIDE_LOOPBACK',String(host));
  }
});
test('host target ports 3001/3002 are required, no additional API host publishes',()=>{
  for(const mutator of [c=>c.services['proxy-config-api'].ports.pop(),c=>c.services['proxy-config-api'].ports.push(port('127.0.0.1',5000,5000)),
    c=>c.services['proxy-config-api'].ports[0].published=4444]){
    const c=candidate();mutator(c);assert.equal(run(c).code,'API_PORT_SURFACE_MISMATCH');
  }
});
test('source and owner private .env must remain RO, owner .artifacts RW',()=>{
  for(const target of ['/app','/app/.env','/app/.artifacts']){
    const c=candidate();const m=c.services['proxy-config-api'].volumes.find(x=>x.target===target);
    m.read_only=!m.read_only;assert.equal(run(c).code,'MOUNT_CONTINUITY_MISMATCH',target);
  }
});
test('actual nginx config and API-visible config must use same host source',()=>{
  const c=candidate();c.services['proxy-config-api'].volumes.find(x=>x.target==='/app/config/default.production.conf').source='/wrong/release.conf';
  assert.equal(run(c).code,'NGINX_API_CONFIG_SPLIT');
});
test('proxy public ingress must remain only HTTP 8080 and HTTPS 443',()=>{
  for(const edit of [
    c=>c.services.proxy.ports.pop(),
    c=>c.services.proxy.ports.push(port('0.0.0.0',3001,3001)),
    c=>c.services.proxy.ports[0].published=8123,
  ]){
    const c=candidate();edit(c);
    assert.equal(run(c).code,'PROXY_PORT_SURFACE_MISMATCH');
  }
});
test('owner .env and session store must share original private root',()=>{
  const c=candidate();c.services['proxy-config-api'].volumes.find(x=>x.target==='/app/.artifacts').source='/other/.artifacts';
  assert.equal(run(c).code,'MOUNT_CONTINUITY_MISMATCH');
});
test('extra live service is rejected, including ngrok',()=>{
  const c=candidate();c.services.ngrok={image:'ngrok:latest'};assert.equal(run(c).code,'SERVICE_SCOPE_MISMATCH');
});
test('unknown/raw secret top-level data is rejected without echoing it',()=>{
  const c=candidate();c.rawSecret='PRIVATE_FIXTURE_SHOULD_NOT_ECHO';
  const r=run(c);assert.equal(r.code,'INVALID_EVIDENCE');assert.doesNotMatch(JSON.stringify(r),/PRIVATE_FIXTURE_SHOULD_NOT_ECHO/);
});
test('getters, arrays, malformed objects and prototypes fail without effects',()=>{
  for(const c of [null,{},[],Object.create(candidate())])assert.equal(run(c).code,'INVALID_EVIDENCE');
  const c=candidate();Object.defineProperty(c.services['proxy-config-api'],'environment',{get(){throw Error('DONT_READ');}});
  assert.equal(run(c).code,'INVALID_EVIDENCE');
});
test('fixed result is immutable and always denies authorization',()=>{
  const r=run(candidate());assert.equal(Object.isFrozen(r),true);
  assert.throws(()=>{r.productionChangeAuthorized=true;},TypeError);
});
test('RED: exact owner config from Engineer report uses read-only .env and must remain valid plan-only',()=>{
  const c=candidate();c.services['proxy-config-api'].volumes.find(x=>x.target==='/app/.env').read_only=true;
  assert.equal(run(c).code,'EFFECTIVE_COMPOSE_PLAN_ONLY');
});
test('RED: any writable owner .env mount fails strict private-credential immutability',()=>{
  const c=candidate();c.services['proxy-config-api'].volumes.find(x=>x.target==='/app/.env').read_only=false;
  assert.equal(run(c).code,'MOUNT_CONTINUITY_MISMATCH');
});
test('RED: nested extra binding at session file cannot shadow owner session mount',()=>{
  const c=candidate();c.services['proxy-config-api'].volumes.push(bind('/scratch/pretend-token-file','/app/.artifacts/admin-session.json',false));
  assert.equal(run(c).code,'UNREVIEWED_SHADOW_MOUNT');
});
