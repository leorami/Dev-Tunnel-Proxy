'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const nginxAvailable=spawnSync('nginx',['-v'],{encoding:'utf8',timeout:3000}).status===0;
async function fixture(t,upstream){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'devproxy-api-upstream-'));
  await fs.chmod(root,0o700);
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'logs'));
  await fs.writeFile(path.join(root,'nginx.conf'),
    `events {}\nhttp { upstream config_api_upstream { server ${upstream}; keepalive 8; }\n`+
    `server { listen 127.0.0.1:18397; location /api { proxy_pass http://config_api_upstream; } } }\n`,
    {mode:0o600});
  return root;
}
function check(root){return spawnSync('nginx',['-t','-p',root+'/','-c','nginx.conf'],{encoding:'utf8',timeout:10000});}
test('source-backed API DNS hypothesis: unresolvable static config API upstream blocks nginx validation',
  {skip:!nginxAvailable},async t=>{
    const root=await fixture(t,'missing-config-api-devproxy-probe.invalid:3001');
    const run=check(root);
    assert.notEqual(run.status,0);
    assert.match(run.stderr,/host not found in upstream/i);
  });
test('API process not listening on a resolvable address does not block nginx -t',
  {skip:!nginxAvailable},async t=>{
    const root=await fixture(t,'127.0.0.1:65534');
    assert.equal(check(root).status,0);
  });
test('unsupported or malformed upstream config still fails closed',
  {skip:!nginxAvailable},async t=>{
    const root=await fixture(t,'bad-hostname\\;invalid');
    assert.notEqual(check(root).status,0);
  });
