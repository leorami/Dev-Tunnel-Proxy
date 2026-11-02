/** DEVPROXY-004A RED-first. All files are disposable fixtures. No Docker, tunnel or API. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const root=new URL('../../',import.meta.url);
const { authorizeHostSnapshot, safeSnapshotName }=require('../../utils/snapshotSecurity.cjs');
const { copySourceTree, shouldCopySourceFile }=require('../../utils/snapshot-copy.js');
// macOS: os.tmpdir() is often under /var/folders (symlink alias of /private/var).
// authorizeHostSnapshot rejects resolve!==realpath; fixtures must live on a realpath-stable base.
const fixtureTmp=()=>fs.realpathSync(os.tmpdir());

test('source copy is OFF by default and requires both explicit enable and approved project root',t=>{
 const dir=fs.mkdtempSync(path.join(fixtureTmp(),'devproxy-snapshot-policy-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const project=path.join(dir,'my-project');fs.mkdirSync(project);
 assert.equal(authorizeHostSnapshot(project,undefined,{}).allowed,false);
 assert.equal(authorizeHostSnapshot(project,undefined,{CALLIOPE_CODE_SNAPSHOT_ENABLED:'1'}).allowed,false);
 assert.equal(authorizeHostSnapshot(project,undefined,{CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS:dir}).allowed,false);
 const approved={CALLIOPE_CODE_SNAPSHOT_ENABLED:'1',CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS:project};
 const result=authorizeHostSnapshot(project,'safe-snapshot',approved);
 assert.equal(result.allowed,true,result.reason);
 assert.equal(result.source,fs.realpathSync(project));
 assert.equal(result.name,'safe-snapshot');
 assert.equal(authorizeHostSnapshot(dir,'safe-snapshot',approved).allowed,false,'no parent traversal');
 const nested=path.join(project,'nested');fs.mkdirSync(nested);
 assert.equal(authorizeHostSnapshot(nested,'safe-snapshot',approved).allowed,false,'no implicit subtree grants');
 for(const dirname of ['.private','.artifacts','.ssh','node_modules']){
   const blocked=path.join(project,dirname);fs.mkdirSync(blocked);
   assert.equal(authorizeHostSnapshot(blocked,'safe-snapshot',{...approved,CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS:blocked}).allowed,false,dirname);
 }
 assert.equal(authorizeHostSnapshot('/',undefined,{...approved,CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS:'/'}).allowed,false,'never a whole-root snapshot');
});

test('root boundary and output name cannot escape the approved workspace',t=>{
 const dir=fs.mkdtempSync(path.join(fixtureTmp(),'devproxy-snapshot-escape-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const good=path.join(dir,'project'),bad=path.join(dir,'project-evil');fs.mkdirSync(good);fs.mkdirSync(bad);
 const env={CALLIOPE_CODE_SNAPSHOT_ENABLED:'1',CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS:good};
 for(const outside of [bad,os.homedir(),'/etc','/tmp'])assert.equal(authorizeHostSnapshot(outside,'valid-name',env).allowed,false,outside);
 for(const name of ['../escape','/tmp/escape','a/b','..','foo..bar','a;touch','a`uname`','a$(echo x)','a"b',' a','']){
  assert.equal(safeSnapshotName(name),null,String(name));
  if(name)assert.equal(authorizeHostSnapshot(good,name,env).allowed,false,String(name));
 }
 const colon=path.join(dir,'repo:alternate');fs.mkdirSync(colon);
 assert.equal(authorizeHostSnapshot(colon,'valid-name',{
  CALLIOPE_CODE_SNAPSHOT_ENABLED:'1',CALLIOPE_CODE_SNAPSHOT_APPROVED_ROOTS:dir
 }).allowed,false,'Docker mount separator cannot appear in approved source');
 const link=path.join(dir,'link');fs.symlinkSync(good,link);
 assert.equal(authorizeHostSnapshot(link,'valid-name',env).allowed,false,'reject symlink source');
 assert.equal(authorizeHostSnapshot(good,'good_snapshot.2026',env).allowed,true);
});

test('private source copy omits secrets, dotfolders, links and large files but retains normal code',async t=>{
 const dir=fs.mkdtempSync(path.join(fixtureTmp(),'devproxy-snapshot-copy-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const src=path.join(dir,'src'),out=path.join(dir,'out');fs.mkdirSync(src);fs.mkdirSync(out);
 const add=(name,value)=>{const full=path.join(src,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,value)};
 add('src/app.ts','export const ok = true;');
 add('src/visible.json','{"public":true}');
 add('README.md','# Readme');
 add('src/.env','PRIVATE_MARKER_DO_NOT_COPY');
 add('src/.env.production','PRIVATE_MARKER_DO_NOT_COPY');
 add('src/service-account.json','PRIVATE_MARKER_DO_NOT_COPY');
 add('src/credentials.yaml','PRIVATE_MARKER_DO_NOT_COPY');
 add('src/auth-token.ts','PRIVATE_MARKER_DO_NOT_COPY');
 add('src/private.key','PRIVATE_MARKER_DO_NOT_COPY');
 add('.npmrc','PRIVATE_MARKER_DO_NOT_COPY');
 add('.ssh/id_rsa','PRIVATE_MARKER_DO_NOT_COPY');
 add('.aws/credentials','PRIVATE_MARKER_DO_NOT_COPY');
 add('.artifacts/calliope/resources/secret.json','PRIVATE_MARKER_DO_NOT_COPY');
 add('.git/config','PRIVATE_MARKER_DO_NOT_COPY');
 add('node_modules/pkg/index.js','PRIVATE_MARKER_DO_NOT_COPY');
 add('src/oversized.ts','x'.repeat(300000));
 fs.symlinkSync(path.join(src,'src','.env'),path.join(src,'src','link.json'));
 const summary=await copySourceTree(src,out);
 assert.equal(summary.copied,3);
 assert.equal(fs.readFileSync(path.join(out,'src/app.ts'),'utf8'),'export const ok = true;');
 assert.equal(fs.existsSync(path.join(out,'src/.env')),false);
 assert.equal(fs.existsSync(path.join(out,'src/link.json')),false);
 assert.equal(fs.existsSync(path.join(out,'src/oversized.ts')),false);
 const files=[];
 const walk=d=>{for(const x of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,x.name);if(x.isDirectory())walk(p);else files.push(fs.readFileSync(p,'utf8'))}};
 walk(out);
 assert.equal(files.some(x=>x.includes('PRIVATE_MARKER_DO_NOT_COPY')),false);
 assert.equal(shouldCopySourceFile('src/nested/.env.example',100),false);
 assert.equal(shouldCopySourceFile('src/components/widget.tsx',100),true);
});

test('snapshot source has no untrusted shell command and container tar is disabled until hardened',()=>{
 const code=fs.readFileSync(new URL('../../utils/calliopeHealing.js',import.meta.url),'utf8');
 const host=code.split('async function snapshotProjectToResources(')[1]?.split('async function analyzeSnapshotForProxyCompatibility(')[0]||'';
 const container=code.split('async function snapshotContainerProject(')[1]?.split('async function backupAndAnalyzeContainerProject(')[0]||'';
 assert.ok(host && container);
 assert.doesNotMatch(host,/execSync\(cmd/);
 assert.match(host,/execFileSync\('docker'/);
 assert.match(host,/PRIVATE_SNAPSHOTS_DIR/);
 assert.match(host,/fs\.realpathSync\(PRIVATE_SNAPSHOTS_DIR\)/,'a symlinked private-store parent must fail closed');
 assert.doesNotMatch(host,/resources\/<stamp>|\.artifacts\/calliope\/resources/);
 assert.doesNotMatch(container,/execSync\(cmd|tar -C|docker exec \$\{/);
 assert.match(container,/CONTAINER_SNAPSHOT_DISABLED/);
 assert.match(code,/authorizeHostSnapshot\(/);
 const copier=fs.readFileSync(new URL('../../utils/snapshot-copy.js',import.meta.url),'utf8');
 assert.match(copier,/O_NOFOLLOW/,'source reads must reject symlinks swapped after readdir');
 assert.match(copier,/flag:'wx'/,'source copies must not overwrite preexisting output files');
});
