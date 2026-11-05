'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createOwnerHealProposalTicketService}=require('../../utils/rc2-owner-heal-proposal-ticket.cjs');
const BEFORE='a'.repeat(64),AFTER='b'.repeat(64);
const S1='c'.repeat(64),S2='d'.repeat(64);
const spec={sessionBinding:S1,appName:'lyra.conf',route:'lyra',beforeSha256:BEFORE,afterSha256:AFTER};
function setup(opts={}){let time=100000;let count=0;const service=createOwnerHealProposalTicketService({now:()=>time,randomBytes:()=>Buffer.alloc(32,++count),...opts});return {service,advance:n=>{time+=n}};}

test('RED: issuing a proposal ticket is not approval, permission or an executable capability',()=>{
 const {service}=setup();const r=service.issue(spec);
 assert.equal(r.ok,true);assert.match(r.ticket,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(r.ownerApprovalGranted,false);assert.equal(r.executionAuthorized,false);
 assert.equal(r.healingPerformed,false);assert.equal(r.liveAttested,false);
 assert.equal(JSON.stringify(r).includes(S1),false);
});
test('same-session exact route+before/after may consume a once-only ticket',()=>{
 const {service}=setup();const i=service.issue(spec);
 const a=service.consume({...spec,ticket:i.ticket});
 assert.equal(a.ok,true);assert.equal(a.status,'PROPOSAL_TICKET_CONSUMED');
 assert.equal(a.ownerApprovalGranted,false);assert.equal(a.executionAuthorized,false);
 assert.equal(service.consume({...spec,ticket:i.ticket}).ok,false);
});
test('ticket cannot cross sessions, even with identical patch hashes',()=>{
 const {service}=setup();const i=service.issue(spec);
 assert.equal(service.consume({...spec,sessionBinding:S2,ticket:i.ticket}).ok,false);
 assert.equal(service.consume({...spec,ticket:i.ticket}).ok,true);
});
test('ticket cannot transfer to another route, file or sha and mismatch does not consume valid original',()=>{
 const {service}=setup();const i=service.issue(spec);
 for(const change of [{route:'other'},{appName:'other.conf'},{beforeSha256:'d'.repeat(64)},{afterSha256:'e'.repeat(64)}]){
  assert.equal(service.consume({...spec,...change,ticket:i.ticket}).ok,false);
 }
 assert.equal(service.consume({...spec,ticket:i.ticket}).ok,true);
});
test('unissued, malformed and fabricated tokens are denied without throwing',()=>{
 const {service}=setup();
 for(const ticket of ['','1234','a'.repeat(43),'='.repeat(44),null,{},true,'x'.repeat(400)]){
  assert.equal(service.consume({...spec,ticket}).ok,false);
 }
});
test('tickets expire and never revive after clock rollback',()=>{
 const {service,advance}=setup({ttlMs:3000});const t=service.issue(spec).ticket;
 advance(3001);assert.equal(service.consume({...spec,ticket:t}).ok,false);
 const t2=service.issue(spec).ticket;advance(-4000);
 assert.equal(service.consume({...spec,ticket:t2}).ok,false);
});
test('at cap service rejects new ticket, does not evict an in-use pending owner review',()=>{
 const {service}=setup({maxPending:2});const a=service.issue(spec);const b=service.issue({...spec,route:'other'});
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(service.issue(spec).ok,false);
 assert.equal(service.consume({...spec,ticket:a.ticket}).ok,true);
 assert.equal(service.issue(spec).ok,true);
});
test('revocation after logout invalidates all outstanding proposal tickets',()=>{
 const {service}=setup();const t=service.issue(spec).ticket;
 service.revokeAll();assert.equal(service.consume({...spec,ticket:t}).ok,false);
});
test('invalid session, file, route, hashes or poisoned objects are denied without side effects',()=>{
 const {service}=setup();
 for(const changes of [{sessionBinding:''},{sessionBinding:'leaked-cookie'},{route:'../lyra'},{appName:'../lyra.conf'},{appName:'lyra.ini'},{beforeSha256:'X'.repeat(64)},{afterSha256:'x'},{extra:'please-run-shell'}]){
  assert.equal(service.issue({...spec,...changes}).ok,false);
 }
 assert.equal(service.issue(Object.assign(Object.create(null),spec)).ok,false);
 const poison={...spec};Object.defineProperty(poison,'route',{get(){throw Error('getter executed');},enumerable:true});
 assert.equal(service.issue(poison).ok,false);
});
test('clock and RNG failures fail closed; duplicate random tokens cannot replace live ones',()=>{
 const z=setup({randomBytes:()=>Buffer.alloc(32,1)});
 const a=z.service.issue(spec);assert.equal(a.ok,true);
 const b=z.service.issue({...spec,route:'other'});assert.equal(b.ok,false);
 assert.equal(z.service.consume({...spec,ticket:a.ticket}).ok,true);
 assert.equal(createOwnerHealProposalTicketService({now:()=>NaN}).issue(spec).ok,false);
 assert.equal(createOwnerHealProposalTicketService({randomBytes:()=>Buffer.alloc(5)}).issue(spec).ok,false);
});
test('malicious caller-supplied approved=true fields cannot authorize a ticket',()=>{
 const {service}=setup();
 for(const key of ['approved','ownerApprovalGranted','executionAuthorized','healingPerformed','liveAttested']){
  const z={...spec,[key]:true};assert.equal(service.issue(z).ok,false);
 }
});
test('tickets are per-process; a restart loses all unredeemed proposals',()=>{
 const s=setup();const t=s.service.issue(spec).ticket;
 const second=setup();assert.equal(second.service.consume({...spec,ticket:t}).ok,false);
});
