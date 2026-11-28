'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {applyRc2SignalOverlay,stripRc2SignalOverlay}=require('../../scripts/devproxy-v200-apply-rc2-signal-overlay.cjs');

const REPO=path.resolve(__dirname,'../..');
const FIXTURE=Buffer.from(`'use strict';
const marker = 'All clear \\0 route-byte ${'OWNER_ROUTE_MARKER_v200'}';
const {explainLocalCalliopeCapability}=require('./rc2-local-calliope-observe-explain.cjs');
const {createMinimalPublicCalliopeHealth}=require('./rc2-public-calliope-health-privacy.cjs');
function safeConfigPath(file){ return file; }
async function handle(req, res){
  // CORS for convenience (not strictly needed when proxied)
  if (req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  try{
    const authBoundary = true;
    if (authBoundary) {
      if (!req) return;
    }
    // RC2_V95_LOCAL_CHAT: existing Calliope Ask UI stays useful in secure
    return marker;
  }catch(e){ throw e; }
}
module.exports = { cosine: 1 };
`);

test('overlay keeps non-signal bytes and adds only the private mailbox',()=>{
  const staged=applyRc2SignalOverlay(FIXTURE,REPO);
  assert.equal(stripRc2SignalOverlay(staged).equals(FIXTURE),true);
  assert.equal(staged.includes(Buffer.from('OWNER_ROUTE_MARKER_v200')),true);
  assert.equal(staged.includes(Buffer.from('function handlePrivateSignalMailbox')),true);
  assert.equal(staged.includes(Buffer.from("error:'SIGNAL_PRIVATE_SERVICE_NOT_ENROLLED'")),true);
  assert.equal(staged.includes(Buffer.from('x-devproxy-signal-peer')),true);
  assert.equal(staged.indexOf('function safeConfigPath'),staged.lastIndexOf('function safeConfigPath'));
  const stripped=stripRc2SignalOverlay(staged);
  assert.equal(crypto.createHash('sha256').update(stripped).digest('hex'),
    crypto.createHash('sha256').update(FIXTURE).digest('hex'));
});

test('overlay result is JavaScript syntax and a second apply fails closed',()=>{
  const staged=applyRc2SignalOverlay(FIXTURE,REPO);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-v200-overlay-'));
  const file=path.join(dir,'proxyConfigAPI.js');
  fs.writeFileSync(file,staged);
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
  assert.throws(()=>applyRc2SignalOverlay(staged,REPO),/OVERLAY_ALREADY_APPLIED/);
  fs.rmSync(dir,{recursive:true,force:true});
});
