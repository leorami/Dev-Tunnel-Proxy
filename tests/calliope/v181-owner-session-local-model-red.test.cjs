'use strict';
/** RED until primary builds the authenticated owner-session local model adapter.
 * The model is an injected fake; no network, Shell, Docker or owner data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {createCalliopeOwnerSessionBrain} = require('../../utils/calliope-owner-session-brain.cjs');
const evidence=[{id:'obs:route-head-503',kind:'observation',summary:'Bounded trusted HEAD returned HTTP 503; cause not established.'}];
const aiReply=(txt='I observed 503, but need to check the upstream before knowing why.')=>JSON.stringify({answer:txt,evidenceIds:['obs:route-head-503'],hypotheses:['Upstream might be unhealthy.'],nextStep:'Offer an authenticated, read-only upstream observation.'});

test('actual local completion is called once and supplies honest read-only flags after a verified reply',async()=>{
  const calls=[];
  const brain=createCalliopeOwnerSessionBrain({complete:async req=>{calls.push(req);return aiReply();},getEvidence:async()=>evidence});
  const a=await brain.ask({authenticated:true,ownerSessionId:'owner-A',query:'Route returns 503. Why?'});
  assert.equal(calls.length,1);assert.equal(a.ok,true);
  assert.equal(a.usedAI,true);assert.equal(a.mode,'local_model_readonly');
  for(const k of ['healingPerformed','executionAuthorized','productionChangeAuthorized','liveAttested','networkTransferAuthorized']) assert.equal(a[k],false,k);
  assert.deepEqual(a.evidenceIds,['obs:route-head-503']);
});

test('server-owned session history supports natural repair follow-up, isolates other sessions',async()=>{
  const calls=[];
  const brain=createCalliopeOwnerSessionBrain({complete:async input=>{calls.push(input);return aiReply();},getEvidence:async()=>evidence});
  await brain.ask({authenticated:true,ownerSessionId:'owner-A',query:'This app returned 503.'});
  await brain.ask({authenticated:true,ownerSessionId:'owner-A',query:'Can you repair it?'});
  await brain.ask({authenticated:true,ownerSessionId:'owner-B',query:'Hi Calliope.'});
  const a=JSON.parse(calls[1].messages[1].content);
  const b=JSON.parse(calls[2].messages[1].content);
  assert.equal(a.history.length,2);assert.equal(a.question,'Can you repair it?');
  assert.equal(b.history.length,0);
});

test('no authenticated session = no model request, no data retrieval or tool authority',async()=>{
  let calls=0;
  const brain=createCalliopeOwnerSessionBrain({complete:async()=>{calls++;return aiReply();},getEvidence:async()=>{calls++;return evidence;}});
  for(const input of [{authenticated:false,ownerSessionId:'owner-A',query:'repair'},
    {authenticated:true,ownerSessionId:'',query:'repair'},
    {authenticated:true,ownerSessionId:'owner-A',query:'repair',providerUrl:'https://evil.example'}]){
    const x=await brain.ask(input);assert.equal(x.ok,false);
  }
  assert.equal(calls,0);
});

test('model unavailable or malicious completion never claims a heal or actual AI success',async()=>{
  const unavailable=createCalliopeOwnerSessionBrain({complete:async()=>{throw Error('offline');},getEvidence:async()=>evidence});
  const x=await unavailable.ask({authenticated:true,ownerSessionId:'A',query:'Please investigate.'});
  assert.equal(x.usedAI,false);assert.equal(x.healingPerformed,false);assert.equal(x.liveAttested,false);
  const malicious=createCalliopeOwnerSessionBrain({complete:async()=>JSON.stringify({answer:'I fixed the route.',evidenceIds:[],hypotheses:[],nextStep:'Done.',healingPerformed:true}),getEvidence:async()=>evidence});
  const y=await malicious.ask({authenticated:true,ownerSessionId:'A',query:'Did you heal?'});
  assert.equal(y.ok,false);assert.equal(y.healingPerformed,false);assert.equal(y.executionAuthorized,false);
});
