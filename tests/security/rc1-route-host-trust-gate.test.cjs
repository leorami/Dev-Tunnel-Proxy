'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {evaluateRouteHostTrustGate} = require('../../utils/rc1-route-host-trust-gate.cjs');
const IMG='sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1';
const SHA='2a5769bd1105543692c7a21a51919e93f03d52d5';
const ID='a'.repeat(64), PROXY_ID='b'.repeat(64), TUNNEL_ID='c'.repeat(64);
function mount(target,rw,sourceKind='approved-data'){return {target,rw,sourceKind};}
const apiMounts=[mount('/app',false),mount('/app/.env',false),mount('/app/apps',true),mount('/app/overrides',true),mount('/app/config',true),mount('/app/build/sites-enabled',true),mount('/app/.artifacts',true)];
const runtimeEvidence=()=>({SOURCE_CURRENT:true,SINGLE_RUNTIME:true,NO_SHADOW_APPS:true,REAL_APP_VERIFIED:true,OWNER_WORK_PRESERVED:true});
function baseline(){return {sourceSha:SHA,approvedProxyImage:IMG,liveMutationAuthorized:false,
  containers:{proxy:{id:PROXY_ID,image:IMG,privileged:false,mounts:[]},
    api:{id:ID,privileged:false,mounts:structuredClone(apiMounts),published:[{container:3001,hostIp:'127.0.0.1'},{container:3002,hostIp:'127.0.0.1'}]},
    ngrok:{id:TUNNEL_ID,privileged:false,mounts:[]}},
  broker:{kind:'host-process',privateAuthenticatedTransport:true,containerIdentityAttested:true,contentBoundActivation:true,
    ownerAuthorityVerified:true,activeRouteObserved:true,hasDockerSocketMount:false,configEditEnabled:true,configEditsCryptographicallyAttested:true},
  originRuntime:runtimeEvidence(),ownerRoutesPreserved:17,
  hostTransportEvidence:'HOST_PROCESS_ACTUAL',
  deployed:false};}
const ev=(changes={})=>({...baseline(),...changes});
const code=r=>r.code;
test('RED first: evaluator missing until CTO implementation',()=>{assert.equal(typeof evaluateRouteHostTrustGate,'function');});
test('qualified host candidate is only PLAN_ONLY, never deploy authorization',()=>{
 const r=evaluateRouteHostTrustGate(baseline());
 assert.equal(r.code,'HOST_TRUST_PLAN_ONLY');assert.equal(r.productionChangeAuthorized,false);
 assert.equal(r.readyForOwnerUat,false);assert.equal(r.deployed,false);
});
test('hard-block the Mac disposable sidecar with host Docker socket for live promotion',()=>{
 const d=baseline();d.broker={...d.broker,kind:'sidecar',hasDockerSocketMount:true};
 assert.equal(code(evaluateRouteHostTrustGate(d)),'BROKER_DOCKER_PRIVILEGE_BLOCKED');
});
test('host Docker socket remains forbidden in API regardless of broker',()=>{
 const d=baseline();d.containers.api.mounts.push(mount('/var/run/docker.sock',true));
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_HOST_DOCKER_SOCKET_FORBIDDEN');
});
test('socket alias is also forbidden in API',()=>{
 const d=baseline();d.containers.api.mounts.push(mount('/docker-engine.sock',true));
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_UNEXPECTED_MOUNT');
});
test('API socket mounted under a harmless-looking alias is forbidden',()=>{const d=baseline();d.containers.api.mounts.push(mount('/tmp/shared.sock',false,'docker-socket'));
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_HOST_DOCKER_SOCKET_FORBIDDEN');});
test('proxy and ngrok may not hide the Docker socket in an alternate path',()=>{
 for(const who of ['proxy','ngrok']){const d=baseline();d.containers[who].mounts.push(mount('/dev/special',false,'docker-socket'));
 assert.equal(code(evaluateRouteHostTrustGate(d)),'SERVICE_HOST_DOCKER_SOCKET_FORBIDDEN');}
});
test('API application code must be RO',()=>{const d=baseline();d.containers.api.mounts[0].rw=true;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_SOURCE_MUTABLE');});
test('API owner dotenv must be RO',()=>{const d=baseline();d.containers.api.mounts[1].rw=true;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'OWNER_SECRET_MOUNT_WRITABLE');});
test('API route data must remain RW for functionality',()=>{const d=baseline();d.containers.api.mounts[2].rw=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_ROUTE_DATA_UNWRITABLE');});
test('unapproved proxy image never passes',()=>{const d=baseline();d.containers.proxy.image='sha256:'+'d'.repeat(64);
 assert.equal(code(evaluateRouteHostTrustGate(d)),'PROXY_IMAGE_NOT_APPROVED');});
test('missing Docker runtime attestation blocks',()=>{const d=baseline();d.containers.api.id='short';
 assert.equal(code(evaluateRouteHostTrustGate(d)),'INVALID_CONTAINER_IDENTITY');});
test('proxy privileged cannot pass',()=>{const d=baseline();d.containers.proxy.privileged=true;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'PRIVILEGED_SERVICE_BLOCKED');});
test('API privileged cannot pass',()=>{const d=baseline();d.containers.api.privileged=true;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'PRIVILEGED_SERVICE_BLOCKED');});
test('broker transport must be authenticated and operator controlled',()=>{const d=baseline();d.broker.privateAuthenticatedTransport=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'HOST_MEDIATOR_UNVERIFIED');});
test('host transport identity actually checked',()=>{const d=baseline();d.hostTransportEvidence='SIDE_CAR_ONLY';
 assert.equal(code(evaluateRouteHostTrustGate(d)),'HOST_TRANSPORT_NOT_VERIFIED');});
test('content-bound nginx activation required',()=>{const d=baseline();d.broker.contentBoundActivation=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'HOST_MEDIATOR_UNVERIFIED');});
test('config edits cannot be unlocked by a bare env flag',()=>{const d=baseline();d.broker.configEditsCryptographicallyAttested=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'CONFIG_EDIT_TRUST_NOT_PROVEN');});
test('route-preservation evidence must include all 17 actual owner routes',()=>{const d=baseline();d.ownerRoutesPreserved=16;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'OWNER_ROUTE_PRESERVATION_UNKNOWN');});
test('Origin five canonical running-app signals must independently pass',()=>{const d=baseline();d.originRuntime.REAL_APP_VERIFIED=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'CANONICAL_RUNTIME_UNVERIFIED');});
test('no duplicated application runtime',()=>{const d=baseline();d.originRuntime.NO_SHADOW_APPS=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'CANONICAL_RUNTIME_UNVERIFIED');});
test('no production changes are authorized through this classifier',()=>{const d=baseline();d.liveMutationAuthorized=true;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'ILLEGAL_IMPLIED_AUTHORIZATION');});
test('no forged deployed fact is accepted as readiness',()=>{const d=baseline();d.deployed=true;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'RUNTIME_ALREADY_MUTATED');});
test('duplicate API mount fails closed',()=>{const d=baseline();d.containers.api.mounts.push(mount('/app',false));
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_DUPLICATE_MOUNT');});
test('ports must be loopback-only',()=>{const d=baseline();d.containers.api.published[1].hostIp='0.0.0.0';
 assert.equal(code(evaluateRouteHostTrustGate(d)),'API_MANAGEMENT_PORT_EXPOSED');});
test('arbitrary extra input fields fail closed',()=>{const d=baseline();d.extra='injected';
 assert.equal(code(evaluateRouteHostTrustGate(d)),'INVALID_RELEASE_EVIDENCE');});
test('nonrecord/proxy getter prototypes fail closed',()=>{assert.equal(code(evaluateRouteHostTrustGate(null)),'INVALID_RELEASE_EVIDENCE');
 const d=baseline();Object.defineProperty(d,'deployed',{get(){throw Error('getter fired');}});
 assert.equal(code(evaluateRouteHostTrustGate(d)),'INVALID_RELEASE_EVIDENCE');});

test('actual PR59 Docker-socket broker proof cannot be repurposed as live GO',()=>{
 const d=baseline();
 d.broker={...d.broker,kind:'sidecar',hasDockerSocketMount:true,configEditsCryptographicallyAttested:false};
 d.hostTransportEvidence='SIDE_CAR_ONLY';
 assert.equal(code(evaluateRouteHostTrustGate(d)),'BROKER_DOCKER_PRIVILEGE_BLOCKED');
});
test('disabled config editing needs no fictitious config attestation',()=>{
 const d=baseline();d.broker.configEditEnabled=false;d.broker.configEditsCryptographicallyAttested=false;
 assert.equal(code(evaluateRouteHostTrustGate(d)),'HOST_TRUST_PLAN_ONLY');
});
