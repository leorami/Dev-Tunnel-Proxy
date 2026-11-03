'use strict';
/**
 * Read-only documentation test: DEVPROXY_CONFIG_SET_V2 binds three named files,
 * while approved nginx sources use directory globs. A sibling unbound .conf must
 * leave the candidate digest unchanged — proving signature coverage is incomplete
 * for the effective include set. No live nginx, no deploy.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createCandidateManifest,CANDIDATE_PATHS,PROTOCOL}=
  require('../../utils/rc1-route-candidate-manifest.cjs');

const INCLUDE_GRAPH=Object.freeze({
  'config/nginx.production.conf':'http { include /etc/nginx/conf.d/*.conf; }\n',
  'config/default.production.conf':'server { include /etc/nginx/conf.d/sites-enabled/*.conf; }\n',
  'build/sites-enabled/apps.generated.conf':'# apps\n',
});

async function seed(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'dp-incl-gap-'));
  for(const [rel,body] of Object.entries(INCLUDE_GRAPH)){
    await fs.mkdir(path.join(root,path.dirname(rel)),{recursive:true});
    await fs.writeFile(path.join(root,rel),body,{mode:0o600});
  }
  return root;
}

test('candidate set is exactly the three named files',()=>{
  assert.deepEqual([...CANDIDATE_PATHS],[
    'build/sites-enabled/apps.generated.conf',
    'config/default.production.conf',
    'config/nginx.production.conf',
  ]);
  assert.equal(PROTOCOL,'DEVPROXY_CONFIG_SET_V2');
});

test('sites-enabled sibling unbound.conf does not change three-file digest',async()=>{
  const root=await seed();
  const before=await createCandidateManifest({approvedRoot:root});
  await fs.writeFile(path.join(root,'build/sites-enabled/unbound.conf'),'# not in CANDIDATE_PATHS\n',{mode:0o600});
  const after=await createCandidateManifest({approvedRoot:root});
  assert.equal(after.candidateSha256,before.candidateSha256);
  assert.equal(before.parts.length,3);
});

test('conf.d-shaped extra file outside the three paths is ignored by digest',async()=>{
  const root=await seed();
  const before=await createCandidateManifest({approvedRoot:root});
  // Mirrors a file that nginx would load via conf.d/*.conf if dropped beside default.conf
  await fs.writeFile(path.join(root,'config/unbound-conf-d-sibling.conf'),'# unbound\n',{mode:0o600});
  const after=await createCandidateManifest({approvedRoot:root});
  assert.equal(after.candidateSha256,before.candidateSha256);
});
