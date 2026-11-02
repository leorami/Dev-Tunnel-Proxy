import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const source = new URL('../../scripts/private-config-snapshot.mjs', import.meta.url).pathname;
function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'devproxy-recovery-fixture-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const home=path.join(base,'owner-home');
  const repo=path.join(base,'test-repo');
  fs.mkdirSync(home,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(repo,'scripts'),{recursive:true});
  fs.mkdirSync(path.join(repo,'config'),{recursive:true});
  fs.mkdirSync(path.join(repo,'build','sites-enabled'),{recursive:true});
  fs.writeFileSync(path.join(repo,'scripts','private-config-snapshot.mjs'),fs.readFileSync(source));
  fs.writeFileSync(path.join(repo,'docker-compose.yml'),'services:\n  proxy: {}\n');
  fs.writeFileSync(path.join(repo,'config','default.conf'),'server {}\n');
  fs.writeFileSync(path.join(repo,'build','sites-enabled','apps.generated.conf'),'location /example {}\n');
  fs.writeFileSync(path.join(repo,'.env'),'OWNER_SECRET_MARKER_TEST_999');
  fs.utimesSync(path.join(repo,'config','default.conf'),new Date('2023-01-02T03:04:05Z'),new Date('2023-01-02T03:04:05Z'));
  const output=path.join(home,'Library','Application Support','Dev Tunnel Proxy','private-rollbacks');
  const run=(args=[])=>spawnSync(process.execPath,[path.join(repo,'scripts','private-config-snapshot.mjs'),...args],{env:{...process.env,HOME:home},encoding:'utf8',timeout:12000});
  return {base,home,repo,output,run};
}
test('default is completely inert', t=>{const f=setup(t);const r=f.run();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/NO_CONFIG_SNAPSHOT/);assert.equal(fs.existsSync(f.output),false);});
test('explicit action without owner flag is rejected', t=>{const f=setup(t);const r=f.run(['--execute']);assert.equal(r.status,2);assert.match(r.stdout,/OWNER_APPROVAL_REQUIRED/);assert.equal(fs.existsSync(f.output),false);});
test('extra arguments and wrong order are rejected',t=>{const f=setup(t);for(const args of [['--execute','--owner-approved','--path=/tmp'],['--owner-approved','--execute'],['--execute','--wrong']])assert.equal(f.run(args).status,2);assert.equal(fs.existsSync(f.output),false);});
test('missing critical generated routes fail before writing archive',t=>{const f=setup(t);fs.rmSync(path.join(f.repo,'build','sites-enabled','apps.generated.conf'));const r=f.run(['--execute','--owner-approved']);assert.equal(r.status,2);assert.match(r.stdout,/REQUIRED_FILE_MISSING/);assert.equal(fs.existsSync(f.output),false);});
test('nested symlink to outside data is rejected, not followed',t=>{const f=setup(t);fs.symlinkSync('/etc/passwd',path.join(f.repo,'config','outside'));const r=f.run(['--execute','--owner-approved']);assert.equal(r.status,2);assert.match(r.stdout,/UNSAFE_SOURCE/);assert.equal(fs.existsSync(f.output),false);});
test('symlinked private destination ancestor is rejected',t=>{const f=setup(t);const outside=path.join(f.base,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.home,'Library'));const r=f.run(['--execute','--owner-approved']);assert.equal(r.status,2);assert.match(r.stdout,/UNSAFE_DESTINATION/);assert.equal(fs.readdirSync(outside).length,0);});
test('preexisting public-readable archive destination is rejected',t=>{const f=setup(t);fs.mkdirSync(f.output,{recursive:true});fs.chmodSync(f.output,0o755);const r=f.run(['--execute','--owner-approved']);assert.equal(r.status,2);assert.match(r.stdout,/UNSAFE_DESTINATION/);assert.equal(fs.readdirSync(f.output).length,0);});
test('approved fixture creates private archive, hashes, preserves mtimes and secret confinement',t=>{
  const f=setup(t);const r=f.run(['--execute','--owner-approved']);assert.equal(r.status,0,r.stderr+' '+r.stdout);assert.match(r.stdout,/PRIVATE_CONFIG_SNAPSHOT_CREATED/);assert.match(r.stdout,/NO_DEPLOY/);assert.doesNotMatch(r.stdout+r.stderr,/OWNER_SECRET_MARKER_TEST_999|\/tmp\/|\/private\/|\.env/);
  const dirs=fs.readdirSync(f.output);assert.equal(dirs.length,1);
  const dir=path.join(f.output,dirs[0]);const tar=path.join(dir,'config-state.tar');const manifestPath=path.join(dir,'manifest.private.json');const digestPath=path.join(dir,'SHA256SUMS.private');
  for(const d of [f.output,dir])assert.equal(fs.statSync(d).mode&0o077,0);
  for(const x of [tar,manifestPath,digestPath])assert.equal(fs.statSync(x).mode&0o077,0);
  const expected=crypto.createHash('sha256').update(fs.readFileSync(tar)).digest('hex');assert.match(fs.readFileSync(digestPath,'utf8'),new RegExp(expected));
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.ok(manifest.files.some(x=>x.path==='.env'));assert.ok(manifest.files.some(x=>x.path==='build/sites-enabled/apps.generated.conf'));
  const restored=path.join(f.base,'isolated-restore');fs.mkdirSync(restored);
  const result=spawnSync('tar',['-xf',tar,'-C',restored],{encoding:'utf8',timeout:9000});assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(path.join(restored,'.env'),'utf8'),'OWNER_SECRET_MARKER_TEST_999');
  assert.equal(fs.readFileSync(path.join(restored,'build','sites-enabled','apps.generated.conf'),'utf8'),'location /example {}\n');
  assert.equal(fs.statSync(path.join(restored,'config','default.conf')).mtime.toISOString(),'2023-01-02T03:04:05.000Z');
});
