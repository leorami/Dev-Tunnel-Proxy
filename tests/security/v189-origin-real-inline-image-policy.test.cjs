'use strict';
/**
 * V189 Dev Proxy consumer contract for the ONE editable Origin policy in
 * leorami/project-template. This does NOT fork that master or grant browser /
 * owner credentials. RED first: existing AGENTS.md does not yet require an
 * actual Code Mode image-bearing output, only Markdown-looking links.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');

test('Origin consumer: Engineer must capture source-matched original rendered desktop/mobile pixels before CTO UI acceptance',()=>{
  assert.match(agents,/ENGINEER_CAPTURE_ORIGINAL_PIXELS/);
  assert.match(agents,/actual canonical owner app/);
  assert.match(agents,/full (?:40-character )?source SHA/);
  assert.match(agents,/viewport, theme, state, timestamp, and SHA-256/);
  assert.match(agents,/ENGINEER-EXECUTED OWNER UAT VERDICT: PASS/);
});
test('Origin consumer: CTO personally reviews real bytes and emits actual image-bearing content in this ChatGPT thread',()=>{
  assert.match(agents,/CTO_ACTUALLY_INSPECTED_PIXEL_BYTES/);
  assert.match(agents,/INLINE_CHAT_RENDERED/);
  assert.match(agents,/functions\.exec/);
  assert.match(agents,/image\("data:image\/png;base64,"/);
  assert.match(agents,/not merely Markdown syntax/);
});
test('Origin consumer: private owner screenshots never travel to public GitHub; missing bytes block UAT',()=>{
  assert.match(agents,/PRIVATE_OWNER_PIXELS_NOT_FOR_PUBLIC_GITHUB/);
  assert.match(agents,/BLOCKED_VISUAL_EVIDENCE_TRANSPORT/);
  assert.match(agents,/BLOCKED_CTO_VISUAL_REVIEW/);
  assert.match(agents,/do not invite owner UAT/);
});
test('Origin consumer: historical public login PNG exists but cannot be mistaken for current authenticated Calliope UAT',()=>{
  const p=path.join(root,'docs/receipts/staging-browser/01-login.png');
  const png=fs.readFileSync(p);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16)>0&&png.readUInt32BE(20)>0);
  assert.match(agents,/HISTORICAL_PUBLIC_LOGIN_NOT_CURRENT_CALLOPE/);
  assert.match(agents,/owner-authenticated Calliope/);
});
test('documented visual pack contract gives exact refusal and privately retrievable source bytes, not a UI bypass',()=>{
  const s=fs.readFileSync(path.join(root,'docs/architecture/DEVPROXY_V189_ORIGIN_SCREENSHOT_DELIVERY.md'),'utf8');
  for(const item of ['leorami/project-template','CORE_COLLABORATION_PROTOCOL.md','real original PNG bytes',
    'existing authorized private','no new observer privileges','NO LIVE DEPLOYMENT','BLOCKED_VISUAL_EVIDENCE_TRANSPORT']){
    assert.ok(s.includes(item),item);
  }
});
