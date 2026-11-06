'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWorkerLaunchAgentCandidate}=require('../../utils/rc2-macos-worker-launchagent-candidate.cjs');
const base=()=>({
 nodeExecutable:'/opt/homebrew/bin/node',
 productRoot:'/Users/owner/reviewed-devproxy',
 privatePinFile:'/Users/owner/.private-devproxy/worker.pin.json',
 privateLogDirectory:'/Users/owner/.private-devproxy/logs'
});
const candidate=()=>createWorkerLaunchAgentCandidate(base());
test('RED: user LaunchAgent starts at login but never auto-restarts after quarantined crash',()=>{
 const r=candidate();
 assert.equal(r.code,'RC2_LAUNCHAGENT_SOURCE_ONLY');
 assert.match(r.plistXml,/<key>RunAtLoad<\/key>\s*<true\/>/);
 assert.match(r.plistXml,/<key>KeepAlive<\/key>\s*<false\/>/);
 assert.doesNotMatch(r.plistXml,/<key>(?:StartInterval|WatchPaths|QueueDirectories|StartCalendarInterval)<\/key>/);
 assert.equal(r.installed,false);assert.equal(r.productionChangeAuthorized,false);
});
test('RED: ProgramArguments is exactly node, audited script, --serve, owner-private pin (no shell)',()=>{
 const r=candidate(),xml=r.plistXml;
 assert.match(xml,/<key>ProgramArguments<\/key>\s*<array>/);
 assert.ok(xml.indexOf('/opt/homebrew/bin/node')<xml.indexOf('/Users/owner/reviewed-devproxy/scripts/rc2-supervised-mac-host-worker.cjs'));
 assert.ok(xml.indexOf('/scripts/rc2-supervised-mac-host-worker.cjs')<xml.indexOf('<string>--serve<\/string>'));
 assert.ok(xml.indexOf('<string>--serve<\/string>')<xml.indexOf('/Users/owner/.private-devproxy/worker.pin.json'));
 assert.doesNotMatch(xml,/<string>(?:sh|bash|zsh|sudo)<\/string>/);
});
test('RED: plist label is fixed, no root, Docker, custom service or user impersonation keys',()=>{
 const xml=candidate().plistXml;
 assert.match(xml,/<string>org\.devproxy\.rc2\.mac-host-worker<\/string>/);
 assert.doesNotMatch(xml,/<key>(?:UserName|GroupName|Sockets|MachServices|StartOnMount|KeepAliveTrue|RootDirectory)<\/key>/);
 assert.doesNotMatch(xml,/docker\.sock|launchctl|ngrok/i);
});
test('RED: executable and private path values are XML-escaped, never spliced as markup',()=>{
 const r=base();r.productRoot='/Users/owner/reviewed & <private> source';
 const xml=createWorkerLaunchAgentCandidate(r).plistXml;
 assert.match(xml,/reviewed &amp; &lt;private&gt; source/);
 assert.doesNotMatch(xml,/reviewed & <private> source/);
});
test('RED: reject relative, noncanonical, transient or control-character paths',()=>{
 for(const key of Object.keys(base())){
  for(const value of ['relative','/tmp/temporary','/private/tmp/test','/var/folders/tmp','/Users/u/a/../b','/Users/u/a\nb','/']){
   const r=base();r[key]=value;
   assert.throws(()=>createWorkerLaunchAgentCandidate(r),/INVALID_RC2_LAUNCHAGENT_CANDIDATE/,key+' '+value);
  }
 }
});
test('RED: node executable cannot be a shell, a Docker socket or untrusted project script',()=>{
 for(const nodeExecutable of ['/bin/sh','/usr/local/bin/bash','/var/run/docker.sock','/Users/owner/reviewed-devproxy/node']){
  const r=base();r.nodeExecutable=nodeExecutable;
  assert.throws(()=>createWorkerLaunchAgentCandidate(r),/INVALID_RC2_LAUNCHAGENT_CANDIDATE/);
 }
});
test('RED: private pin and private logs cannot be exposed by project source tree',()=>{
 for(const [key,value] of [['privatePinFile','/Users/owner/reviewed-devproxy/worker.pin.json'],
  ['privateLogDirectory','/Users/owner/reviewed-devproxy/logs']]){
  const r=base();r[key]=value;
  assert.throws(()=>createWorkerLaunchAgentCandidate(r),/INVALID_RC2_LAUNCHAGENT_CANDIDATE/);
 }
});
test('RED: private stdout and stderr routes stay under caller-verified log root',()=>{
 const r=candidate();
 assert.match(r.plistXml,/<key>StandardOutPath<\/key>\s*<string>\/Users\/owner\/\.private-devproxy\/logs\/host-worker\.out\.log<\/string>/);
 assert.match(r.plistXml,/<key>StandardErrorPath<\/key>\s*<string>\/Users\/owner\/\.private-devproxy\/logs\/host-worker\.err\.log<\/string>/);
});
test('RED: template never self-certifies Mac state, install, production or owner authority',()=>{
 const r=candidate();
 for(const key of ['installed','macTested','ownerApprovedInstall','productionChangeAuthorized'])assert.equal(r[key],false);
 assert.equal(r.installInstructionsIncluded,false);
 assert.equal(r.requiresNewOwnerGrant,true);
});
test('RED: no extraneous or hidden input properties, accessors or live options',()=>{
 const input=base();input.installNow=true;
 assert.throws(()=>createWorkerLaunchAgentCandidate(input),/INVALID_RC2_LAUNCHAGENT_CANDIDATE/);
 const accessor=base();Object.defineProperty(accessor,'productRoot',{get(){throw Error('getter executed')}});
 assert.throws(()=>createWorkerLaunchAgentCandidate(accessor),/INVALID_RC2_LAUNCHAGENT_CANDIDATE/);
});
