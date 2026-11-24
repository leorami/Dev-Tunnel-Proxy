'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Origin source pin distinguishes published master, pending candidates and consumer verification',()=>{
 const lock=JSON.parse(read('CORE_PROTOCOL_LOCK.json'));
 assert.equal(lock.master_repository,'leorami/project-template');
 assert.match(lock.master_commit_sha,/^[a-f0-9]{40}$/);
 assert.match(lock.master_blob_sha,/^[a-f0-9]{40}$/);
 assert.equal(lock.integration_status,'public-consumer-reference-only');
 assert.equal(lock.registration_status,'PENDING_ORIGIN_REGISTRY');
 assert.equal(lock.verification_status,'NOT_VERIFIED_FULL_ADOPTION');
});
test('local operating contract preserves privacy, owner authority and original evidence',()=>{
 const a=read('AGENTS.md');
 for(const marker of ['STARTED','RETURNED','STOPPED','full 40-character SHA','one primary','BLOCKED_VISIBLE_PIXEL_TRANSPORT','15 minutes','24 hours','48 hours','ZERO_IN_SCOPE_TEST_FAILURES','FINAL ChatGPT reply','no private Origin material'])assert.ok(a.includes(marker),marker);
 assert.match(a,/no new public listener/i);
});
test('visual canon specifies current source and real pixel delivery',()=>{
 const v=read('docs/architecture/DEVPROXY_ORIGIN_VISUAL_EVIDENCE.md');
 for(const marker of ['testedSourceSha','servedSha','SHA-256','synthetic_no_owner_data','owner-private','sandbox:/mnt/data/','Ubuntu','INLINE_RENDER_UNVERIFIED','private authenticated transport'])assert.ok(v.includes(marker),marker);
});
