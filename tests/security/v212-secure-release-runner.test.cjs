'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const build=fs.readFileSync(path.join(root,'smart-build.sh'),'utf8');
function section(name,next){
 const from=build.indexOf(name+'() {');
 const to=build.indexOf(next+'() {',from+name.length);
 assert.ok(from>=0&&to>from,'missing runner section '+name);
 return build.slice(from,to);
}
test('owner-host source unit runner never starts the native nginx fixture',()=>{
 const unit=section('cmd_test_unit','cmd_test_all');
 assert.doesNotMatch(unit,/v171-four-auth-prefix-nginx/);
});
test('full secure release candidate requires isolated hosted CI and explicitly runs all three lanes',()=>{
 const full=section('cmd_test_all','usage');
 assert.match(full,/require_isolated_release_ci\s*\|\|\s*return/);
 for(const name of ['cmd_test_unit','cmd_test_nginx_fixture','cmd_test_secure_contract'])assert.match(full,new RegExp(name+'\\s*\\|\\|\\s*failed=1'));
 assert.doesNotMatch(full,/cmd_test_thoughts|cmd_test_calliope/);
});
test('nginx fixture must have the image and run real cases, never silently skip',()=>{
 const fixture=section('cmd_test_nginx_fixture','cmd_test_secure_contract');
 assert.match(fixture,/require_isolated_release_ci/);
 assert.match(fixture,/docker image inspect nginx:1\.26\.3-alpine/);
 assert.match(fixture,/v171-four-auth-prefix-nginx\.test\.cjs/);
 assert.match(fixture,/strict_test_counts/);
});
test('historical localhost/network commands are not ordinary test entrypoints',()=>{
 for(const [name,next] of [['cmd_test_thoughts','cmd_test_calliope'],['cmd_test_calliope','cmd_test_auditor'],['cmd_test_auditor','cmd_test_browser'],['cmd_test_browser','cmd_test_mixed_content'],['cmd_test_mixed_content','cmd_test_unit']]){
  const body=section(name,next);
  assert.doesNotMatch(body,/calliope-simple-test|test-incremental-thoughts|site-auditor-test|browser-console-test|mixed-content-test/);
 }
 for(const name of ['test/calliope-simple-test.js','test/test-incremental-thoughts.sh','test/site-auditor-test.js'])assert.ok(fs.existsSync(path.join(root,name)),name);
});
test('release candidate includes real handler and retained secure capability contracts',()=>{
 const secure=section('cmd_test_secure_contract','cmd_test_thoughts');
 for(const file of ['v212-secure-release-api.test.cjs','rc2-local-calliope-api-contract.test.cjs','rc2-local-calliope-evidence.test.cjs','rc2-local-calliope-observe-explain.test.cjs','rc2-secure-http-audit.test.cjs','rc2-readonly-app-http-scan.test.cjs','rc2-app-http-scan-api-contract.test.cjs'])assert.ok(secure.includes(file),file);
 assert.match(secure,/strict_test_counts/);
});

test('strict evidence rejects omitted, skipped, cancelled, todo and failing summaries',()=>{
 const {spawnSync}=require('node:child_process');
 const fn=section('strict_test_counts','cmd_test_nginx_fixture');
 const run=(summary,exitCode=0)=>{
  const script=fn+'\nstrict_test_counts "$1"\n';
  const command="printf '%s\\n' "+summary.map(x=>"'"+x+"'").join(' ')+"; (exit "+exitCode+")";
  const r=spawnSync('/bin/bash',['-c',script,'fixture',command],{encoding:'utf8',timeout:5000});
  assert.ifError(r.error);
  return r.status;
 };
 const good=['# tests 2','# pass 2','# fail 0','# cancelled 0','# skipped 0','# todo 0'];
 assert.equal(run(good),0);
 assert.equal(run(good.map(x=>x.replace(/^#/,'ℹ'))),0);
 assert.notEqual(run(good,1),0);
 for(const index of [0,1,2,3,4,5]){
  assert.notEqual(run(good.filter((_,i)=>i!==index)),0,'missing summary field '+index);
 }
 for(const field of ['fail','cancelled','skipped','todo']){
  assert.notEqual(run(good.map(x=>x==='# '+field+' 0'?'# '+field+' 1':x)),0,field);
 }
 assert.notEqual(run(good.map(x=>x==='# pass 2'?'# pass 1':x)),0);
});
test('hosted CI guard rejects ordinary host before any fixture starts',()=>{
 const {spawnSync}=require('node:child_process');
 const guard=build.slice(build.indexOf('require_isolated_release_ci() {'),build.indexOf('# Require actual Node test summaries'));
 const r=spawnSync('/bin/bash',['-c',guard+'\nrequire_isolated_release_ci'],{
  env:{PATH:process.env.PATH||'/usr/bin:/bin',ROOT_DIR:root},encoding:'utf8',timeout:5000});
 assert.ifError(r.error);
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/RELEASE_FIXTURE_REQUIRES_ISOLATED_HOSTED_CI/);
});
