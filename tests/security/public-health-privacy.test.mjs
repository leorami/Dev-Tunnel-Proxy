/** RED-first contract: detailed health reports are private, Docker stays fail-closed.
 * Exact Nginx source checks. No Docker daemon or live network access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function exactLocation(conf, route) {
  const escaped=route.replace(/[.*+?^\$\{\}()|[\]\\]/g,'\\$&');
  const found=conf.match(new RegExp('^  location = '+escaped+' \\{([\\s\\S]*?)^  \\}', 'm'));
  assert.ok(found, 'missing exact '+route+' location');
  return found[1];
}
for (const filename of ['config/default.conf','config/default.production.conf']) {
  test(filename+' does not serve detailed reports at anonymous /health.json',()=>{
    const source=readFileSync(new URL('../../'+filename,import.meta.url),'utf8');
    const health=exactLocation(source,'/health.json');
    assert.doesNotMatch(health,/\b(?:alias|proxy_pass|root)\s/, 'public health must never read/send a private report body');
    assert.match(health,/default_type\s+application\/json\s*;/);
    assert.match(health,/if\s*\(!-f\s+\/usr\/share\/nginx\/html\/\.artifacts\/reports\/health-latest\.json\)/);
    assert.match(health,/return\s+503\s+'\{"status":"unavailable"\}'\s*;/);
    assert.match(health,/return\s+200\s+'\{"status":"ok"\}'\s*;/);
    assert.match(health,/Cache-Control\s+"no-store"\s+always\s*;/);
    const detailed=exactLocation(source,'/status.json');
    assert.match(detailed,/auth_request\s+\/admin\/check\s*;/);
    assert.match(detailed,/alias\s+\/usr\/share\/nginx\/html\/\.artifacts\/reports\/health-latest\.json\s*;/);
  });
}
test('both Compose healthchecks still call only public /health.json',()=>{
  for(const filename of ['docker-compose.yml','docker-compose.production.yml']){
    const source=readFileSync(new URL('../../'+filename,import.meta.url),'utf8');
    assert.match(source,/wget.*127\.0\.0\.1\/health\.json/);
  }
});
