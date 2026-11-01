import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAppCommand, fingerprintAppCommand } from '../../packages/dev-proxy-mcp/app-policy.mjs';

const resource='https://dev.example.test/photos/mcp';
const read={
  name:'photos.gallery.reason_state',appId:'photos',kind:'read',
  scope:'photos.gallery.read',roles:['OWNER','ADMIN'],environments:['development'],
  argumentSchema:{type:'object',additionalProperties:false,required:['candidateId'],properties:{
    candidateId:{type:'string',minLength:8,maxLength:8},
  }},
};
const write={
  ...read,name:'photos.gallery.set_reason_flag',kind:'reversible_write',
  scope:'photos.gallery.write',
  argumentSchema:{type:'object',additionalProperties:false,required:['candidateId','enabled'],properties:{
    candidateId:{type:'string',minLength:8,maxLength:8},enabled:{type:'boolean'},
  }},
};
const request={name:read.name,arguments:{candidateId:'CHI-0002'},requestId:'c3b2572b-fbb6-4142-9f12-b2fd67901d42'};
const mutation={
  name:write.name,arguments:{candidateId:'CHI-0002',enabled:true},
  requestId:'7e830f6c-7b5c-4ca8-af16-704ba1a87db8',
  expectedVersion:61,idempotencyKey:'d1953398-aa90-4ad1-b799-912f2f2a3eac',
};
const context={
  appId:'photos',environment:'development',resource,
  actor:{id:'owner-1',role:'OWNER',scopes:['photos.gallery.read','photos.gallery.write'],tokenAudience:resource},
  grant:null,
};
const withGrant=(override={})=>({...context,grant:{
  actorId:context.actor.id,appId:context.appId,environment:context.environment,
  commandName:write.name,intentHash:fingerprintAppCommand(mutation),
  expiresAtMs:2000000000000,verifiedByServer:true,ownerApproval:false,...override,
}});
const now=1900000000000;

test('read requires exact app, role, OAuth scope and resource audience',()=>{
  assert.equal(authorizeAppCommand(request,[read],context).allowed,true);
  const cases=[
    {...context,actor:{...context.actor,tokenAudience:'https://other.invalid/mcp'}},
    {...context,appId:'otherapp'},
    {...context,environment:'production'},
    {...context,actor:{...context.actor,role:'VIEWER'}},
    {...context,actor:{...context.actor,scopes:['photos.research_candidates']}},
  ];
  for(const invalid of cases) assert.equal(authorizeAppCommand(request,[read],invalid).allowed,false);
});

test('unregistered shell, unknown keys and invalid or schema-extra arguments deny',()=>{
  assert.equal(authorizeAppCommand({...request,name:'shell.exec'},[read],context).allowed,false);
  assert.equal(authorizeAppCommand({...request,command:'rm -rf /'},[read],context).allowed,false);
  assert.equal(authorizeAppCommand({...request,arguments:{candidateId:'CHI-0002',command:'rm -rf /'}},[read],context).allowed,false);
  assert.equal(authorizeAppCommand({...request,arguments:{candidateId:23}},[read],context).allowed,false);
  assert.equal(authorizeAppCommand({...request,requestId:'not-a-uuid'},[read],context).allowed,false);
});

test('mutations require specific server attestation and optimistic-concurrency inputs',()=>{
  assert.equal(authorizeAppCommand(mutation,[write],context).allowed,false);
  assert.equal(authorizeAppCommand({...mutation,expectedVersion:undefined},[write],withGrant()).allowed,false);
  assert.equal(authorizeAppCommand({...mutation,idempotencyKey:undefined},[write],withGrant()).allowed,false);
  assert.equal(authorizeAppCommand(mutation,[write],withGrant(),now).allowed,true);
  assert.equal(authorizeAppCommand({...mutation,arguments:{...mutation.arguments,enabled:false}},[write],withGrant(),now).allowed,false);
  assert.equal(authorizeAppCommand(mutation,[write],withGrant({actorId:'attacker'}),now).allowed,false);
  assert.equal(authorizeAppCommand(mutation,[write],withGrant({expiresAtMs:10}),now).allowed,false);
});

test('privileged commands require separate owner approval, not ordinary scoped write grant',()=>{
  const privileged={...write,kind:'privileged'};
  assert.equal(authorizeAppCommand(mutation,[privileged],withGrant(),now).allowed,false);
  assert.equal(authorizeAppCommand(mutation,[privileged],withGrant({ownerApproval:true}),now).allowed,true);
});

test('intent fingerprint is deterministic independent of input key order',()=>{
  assert.equal(fingerprintAppCommand(request),fingerprintAppCommand({
    requestId:request.requestId,arguments:{candidateId:'CHI-0002'},name:read.name,
  }));
  assert.notEqual(fingerprintAppCommand(mutation),fingerprintAppCommand({...mutation,expectedVersion:62}));
});

test('pure grant evaluator is not an idempotency service or permission mint',()=>{
  const a=authorizeAppCommand(mutation,[write],withGrant(),now);
  const b=authorizeAppCommand(mutation,[write],withGrant(),now);
  assert.equal(a.allowed,true);
  assert.equal(b.allowed,true);
  // Callers MUST atomically consume/replay-proof exact grant and record durable receipts.
});
