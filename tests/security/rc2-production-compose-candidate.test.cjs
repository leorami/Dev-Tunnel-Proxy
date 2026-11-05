'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProductionComposeCandidate}=require('../../utils/rc2-production-compose-candidate.cjs');
const H='a'.repeat(64);
const base=()=>({
 proxyImage:'registry.example.invalid/devproxy-proxy@sha256:'+H,
 apiImage:'registry.example.invalid/devproxy-api@sha256:'+'b'.repeat(64),
 apiUid:10001,apiGid:10001,
 paths:{
  sourceRoot:'/private/devproxy/rc2/source',
  ownerEnvFile:'/private/devproxy/rc2/private/owner.env',
  secretHostFile:'/private/devproxy/rc2/private/activation.secret',
  spoolHostDir:'/private/devproxy/rc2/private/spool',
  appsDir:'/private/devproxy/rc2/data/apps',
  overridesDir:'/private/devproxy/rc2/data/overrides',
  sitesDir:'/private/devproxy/rc2/data/sites-enabled',
  artifactsDir:'/private/devproxy/rc2/data/artifacts',
  nginxConf:'/private/devproxy/rc2/source/config/nginx.production.conf',
  defaultConf:'/private/devproxy/rc2/source/config/default.production.conf',
  nginxEntrypoint:'/private/devproxy/rc2/source/scripts/nginx-entrypoint.sh',
  certsDir:'/private/devproxy/rc2/data/certs',
  statusDir:'/private/devproxy/rc2/data/status',
  dashboardDir:'/private/devproxy/rc2/source/dashboard/public'
 }
});
function volumes(service){return new Map(service.volumes.map(v=>[v.target,v]));}
const p=()=>createProductionComposeCandidate(base());
test('RED: compile an exact two-service standalone Compose candidate without Docker access',()=>{
 const c=p();assert.equal(c.code,'RC2_SOURCE_ONLY_COMPOSE_CANDIDATE');
 assert.deepEqual(Object.keys(c.compose.services),['proxy','proxy-config-api']);
 assert.deepEqual(Object.keys(c.compose.networks),['devproxy']);
 assert.equal(c.compose.networks.devproxy.external,true);
 assert.equal(c.productionChangeAuthorized,false);assert.equal(c.deployed,false);
 assert.equal(c.ownerMacVerified,false);assert.equal(c.runtimeAttested,false);
 assert.equal(candidateHasNoRuntimeActions(c.compose),true);
});
function candidateHasNoRuntimeActions(c){return !('docker' in c)&&!('ngrok' in c.services)&&
  !('dashboard-dev' in c.services)&&typeof c.services.proxy.image==='string';}
test('RED: restrict both services to exact approved immutable image references',()=>{
 const c=p().compose;assert.match(c.services.proxy.image,/^registry\.example\.invalid\/devproxy-proxy@sha256:[a-f0-9]{64}$/);
 assert.match(c.services['proxy-config-api'].image,/^registry\.example\.invalid\/devproxy-api@sha256:[a-f0-9]{64}$/);
 assert.equal('build' in c.services.proxy,false);
 assert.equal('build' in c.services['proxy-config-api'],false);
});
test('RED: api is unprivileged, root filesystem read-only, has no container Docker socket',()=>{
 const api=p().compose.services['proxy-config-api'];
 assert.equal(api.user,'10001:10001');assert.equal(api.privileged,false);
 assert.equal(api.read_only,true);assert.deepEqual(api.cap_drop,['ALL']);
 assert.deepEqual(api.security_opt,['no-new-privileges:true']);
 assert.equal(api.working_dir,'/app');
 assert.ok(api.tmpfs.includes('/tmp:rw,nosuid,nodev,size=64m'));
 const v=volumes(api);
 assert.equal(v.get('/app').read_only,true);
 assert.equal(v.get('/app/.env').read_only,true);
 assert.equal([...v.values()].some(x=>/docker\.sock/.test(x.source)||/docker\.sock/.test(x.target)),false);
 assert.equal(JSON.stringify(api.command).includes('docker'),false);
 assert.equal(JSON.stringify(api.command).includes('apk add'),false);
});
test('RED: app data and generated routes are writable, but code and .env are immutable',()=>{
 const a=volumes(p().compose.services['proxy-config-api']);
 for(const t of ['/app/apps','/app/overrides','/app/build/sites-enabled','/app/.artifacts','/app/.artifacts/rc2-ipc'])
  assert.equal(a.get(t).read_only,false,t);
 for(const t of ['/app','/app/.env','/app/.artifacts/rc2-activation.secret'])
  assert.equal(a.get(t).read_only,true,t);
});
test('RED: API private spool and secret are not inherited by proxy artifacts',()=>{
 const c=p().compose;const a=volumes(c.services['proxy-config-api']);
 const n=volumes(c.services.proxy);
 assert.equal(a.get('/app/.artifacts/rc2-ipc').source,base().paths.spoolHostDir);
 assert.equal(a.get('/app/.artifacts/rc2-ipc').read_only,false);
 assert.equal(a.get('/app/.artifacts/rc2-activation.secret').source,base().paths.secretHostFile);
 assert.equal(n.get('/usr/share/nginx/html/.artifacts').source,base().paths.artifactsDir);
 for(const v of n.values()) assert.ok(!v.source.startsWith('/private/devproxy/rc2/private/'));
});
test('RED: neither service exposes publicly reachable host ports',()=>{
 const c=p().compose;
 assert.deepEqual(c.services.proxy.ports,['127.0.0.1:8080:80','127.0.0.1:443:443']);
 assert.deepEqual(c.services['proxy-config-api'].ports,['127.0.0.1:3001:3001','127.0.0.1:3002:3002']);
 assert.ok(c.services.proxy.networks.includes('devproxy'));
 assert.ok(c.services['proxy-config-api'].networks.includes('devproxy'));
});
test('RED: proxy preserves Brotli-enabled nginx, sites, TLS, status, entrypoint',()=>{
 const n=p().compose.services.proxy;const v=volumes(n);
 for(const t of ['/etc/nginx/nginx.conf','/etc/nginx/conf.d/default.conf','/etc/nginx/conf.d/sites-enabled',
  '/entrypoint.sh','/etc/nginx/certs','/usr/share/nginx/html/status',
  '/usr/share/nginx/html/dashboard'])assert.equal(v.get(t).read_only,true,t);
 assert.equal(v.get('/usr/share/nginx/html/.artifacts').read_only,false);
 assert.deepEqual(n.command,['sh','/entrypoint.sh']);
});
test('RED: API preserves notifications and primary server, never packages Docker CLI',()=>{
 const a=p().compose.services['proxy-config-api'];
 assert.equal(a.environment.NODE_ENV,'production');
 assert.equal(a.environment.DEVPROXY_DENY_INLINE_DOCKER,'1');
 assert.equal(a.environment.DEVPROXY_ACTIVATION_SPOOL_DIR,'/app/.artifacts/rc2-ipc/spool');
 assert.equal(a.environment.DEVPROXY_ACTIVATION_SECRET_FILE,'/app/.artifacts/rc2-activation.secret');
 assert.deepEqual(a.env_file,[base().paths.ownerEnvFile]);
 const command=JSON.stringify(a.command);
 assert.match(command,/notificationsAPI\.js/);assert.match(command,/proxyConfigAPI\.js/);
 assert.equal(command.includes('docker'),false);assert.equal(command.includes('apk'),false);
});
test('RED: original ngrok remains outside candidate ownership and no worker service is started',()=>{
 const c=p().compose;
 assert.equal(Object.keys(c.services).length,2);
 assert.equal(c.services.proxy.container_name,'dev-proxy');
 assert.equal(c.services['proxy-config-api'].container_name,'dev-proxy-config-api');
 assert.equal(JSON.stringify(c).includes('DEVPROXY_HOST_WORKER_PIN'),false);
});
test('RED: generated Compose JSON is deterministic and does not embed secrets',()=>{
 const a=p(),b=p();assert.equal(a.json,b.json);
 assert.deepEqual(JSON.parse(a.json),a.compose);
 assert.equal(a.json.includes('ADMIN_PASSWORD='),false);
 assert.equal(a.json.includes('NGROK_AUTHTOKEN'),false);
 assert.equal(a.json.includes('secretContent'),false);
});
test('RED: deny root and invalid user namespace',()=>{
 for(const [uid,gid] of [[0,10001],[10001,0],[-1,2],[1.5,1],[null,1],['10001',10001]]){
  const a=base();a.apiUid=uid;a.apiGid=gid;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/,String(uid));
 }
});
test('RED: deny mutable image tags, docker aliases or unpinned image digest',()=>{
 for(const bad of ['node:18-alpine','nginx:latest','sha256:'+H,'docker.io/proxy@sha256:short',
  'registry.example.invalid/devproxy:latest@sha256:'+H,'a\n@sha256:'+H]){
  const a=base();a.apiImage=bad;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/,bad);
 }
});
test('RED: deny docker socket in any private mount source, even as a nested directory',()=>{
 for(const evil of ['/var/run/docker.sock','/private/run/docker.sock/data']){
  const a=base();a.paths.spoolHostDir=evil;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/);
 }
});
test('RED: deny path traversal, relative, NUL, newline and root paths',()=>{
 for(const evil of ['/private/devproxy/../etc','/','./relative','/private/src\nattack','/private/src\0attack','/private/devproxy/']){
  const a=base();a.paths.sourceRoot=evil;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/);
 }
});
test('RED: cannot embed worker private secret/spool inside source tree or shared proxy data',()=>{
 for(const evil of [base().paths.sourceRoot+'/secret',base().paths.artifactsDir+'/secret',base().paths.appsDir+'/secret']){
  const a=base();a.paths.secretHostFile=evil;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/);
 }
});
test('RED: cannot share spool subtree with source tree, route-data or artifacts',()=>{
 for(const evil of [base().paths.artifactsDir+'/spool',base().paths.sourceRoot+'/spool',base().paths.overridesDir]){
  const a=base();a.paths.spoolHostDir=evil;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/);
 }
});
test('RED: no optional object keys or accessor getters',()=>{
 const a=base();a.authorized=true;assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/);
 const b=base();Object.defineProperty(b.paths,'spoolHostDir',{get(){throw Error('poison');}});
 assert.throws(()=>createProductionComposeCandidate(b),/INVALID_RC2_CANDIDATE/);
});
test('RED: missing input fields fail before a Compose candidate is produced',()=>{
 const a=base();delete a.paths.ownerEnvFile;
 assert.throws(()=>createProductionComposeCandidate(a),/INVALID_RC2_CANDIDATE/);
});

test('RED: preserve verified Mac candidate nonroot UID 504 / group 20 without rejecting valid ownership',()=>{
 const a=base();a.apiUid=504;a.apiGid=20;
 const c=createProductionComposeCandidate(a);assert.equal(c.compose.services['proxy-config-api'].user,'504:20');
});
