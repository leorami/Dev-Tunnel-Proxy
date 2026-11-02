/** RED first. Safe reload tests use disposable files and fake node/docker binaries only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const source=fs.readFileSync(new URL('../../scripts/reload.sh',import.meta.url),'utf8');

function fixture(t,{original='OLD_GOOD_CONF',genExit='0',nginxValid='1',reloadSuccess='1'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'devproxy-rc1-reload-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const scripts=path.join(root,'scripts'),bin=path.join(root,'bin'),generated=path.join(root,'build','sites-enabled','apps.generated.conf');
 fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(bin,{recursive:true});
 fs.mkdirSync(path.dirname(generated),{recursive:true});
 if(original!==null)fs.writeFileSync(generated,original);
 const script=path.join(scripts,'reload.sh');
 fs.writeFileSync(script,source,{mode:0o700});
 const fakeNode=path.join(bin,'node');
 fs.writeFileSync(fakeNode,`#!/bin/sh
printf 'NEW_UNVERIFIED_CONF' > "$FAKE_BUNDLE_PATH"
exit "$FAKE_GENERATOR_EXIT"
`,{mode:0o700});
 const fakeDocker=path.join(bin,'docker');
 fs.writeFileSync(fakeDocker,`#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  'exec dev-proxy nginx -t') [ "$FAKE_NGINX_VALID" = "1" ] ;;
  'exec dev-proxy nginx -s reload') [ "$FAKE_RELOAD_SUCCESS" = "1" ] ;;
  *) exit 97 ;;
esac
`,{mode:0o700});
 const log=path.join(root,'docker-commands.log');
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,
  FAKE_BUNDLE_PATH:generated,FAKE_DOCKER_LOG:log,
  FAKE_GENERATOR_EXIT:genExit,FAKE_NGINX_VALID:nginxValid,
  FAKE_RELOAD_SUCCESS:reloadSuccess};
 const run=()=>spawnSync('bash',[script],{env,encoding:'utf8',timeout:15000});
 const commands=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean):[];
 return {root,run,commands,generated};
}

test('refuse to reload on generator failure and restore last-known-good bundle',t=>{
 const f=fixture(t,{genExit:'3'});const r=f.run();
 assert.notEqual(r.status,0,r.stderr);
 assert.deepEqual(f.commands(),[],'must not contact Docker after failed generation');
 assert.equal(fs.readFileSync(f.generated,'utf8'),'OLD_GOOD_CONF');
});

test('failed nginx -t must never attempt nginx -s reload and restores prior file',t=>{
 const f=fixture(t,{nginxValid:'0'});const r=f.run();
 assert.notEqual(r.status,0);
 assert.deepEqual(f.commands(),['exec dev-proxy nginx -t']);
 assert.equal(fs.readFileSync(f.generated,'utf8'),'OLD_GOOD_CONF');
});

test('successful validation reloads exactly once, preserving newly validated bundle',t=>{
 const f=fixture(t);const r=f.run();
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(f.commands(),['exec dev-proxy nginx -t','exec dev-proxy nginx -s reload']);
 assert.equal(fs.readFileSync(f.generated,'utf8'),'NEW_UNVERIFIED_CONF');
});

test('no prior bundle: failed validation removes generated file and never reloads',t=>{
 const f=fixture(t,{original:null,nginxValid:'0'});const r=f.run();
 assert.notEqual(r.status,0);
 assert.equal(fs.existsSync(f.generated),false);
 assert.deepEqual(f.commands(),['exec dev-proxy nginx -t']);
});

test('failed reload exits nonzero, restores prior bundle and does not claim success',t=>{
 const f=fixture(t,{reloadSuccess:'0'});const r=f.run();
 assert.notEqual(r.status,0);
 assert.equal(fs.readFileSync(f.generated,'utf8'),'OLD_GOOD_CONF');
 assert.deepEqual(f.commands(),['exec dev-proxy nginx -t','exec dev-proxy nginx -s reload']);
 assert.doesNotMatch(r.stdout,/nginx reloaded \(config test passed\)/);
});
