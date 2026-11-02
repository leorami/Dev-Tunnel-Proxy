/** RED-first RC1 regression: trusted-origin CSRF requires Compose runtime injection.
 * Fixture-only/source-only: no Docker, networks, credentials or live operations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const name of ['docker-compose.yml', 'docker-compose.production.yml']) {
  test(name + ' injects mandatory trusted origins into proxy-config-api', () => {
    const source = fs.readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
    const api = source.split(/^  proxy-config-api:\s*$/m)[1];
    assert.ok(api, 'proxy-config-api must be present');
    const env = api.split(/^    environment:\s*$/m)[1]?.split(/^    (?:networks|ports|depends_on):\s*$/m)[0] || '';
    assert.match(env, /^\s*- DEVPROXY_TRUSTED_ORIGINS=\$\{DEVPROXY_TRUSTED_ORIGINS:\?[^}\n]+\}$/m,
      'missing env must fail Compose rendering before any service change, rather than silently deny all owner logins');
  });
}

test('API exact-Origin policy reads explicit process env only', () => {
  // proxyConfigAPI.js historically embeds NULs; read as latin1 so the bootstrap line is searchable.
  const api = fs.readFileSync(new URL('../../utils/proxyConfigAPI.js', import.meta.url), 'latin1');
  // Returned staging bootstrap uses `|| ''`; still must be process.env only — never Host-derived.
  assert.match(api, /normalizeTrustedOrigins\(process\.env\.DEVPROXY_TRUSTED_ORIGINS(?:\s*\|\|\s*'')?\)/);
  assert.doesNotMatch(api, /normalizeTrustedOrigins\(req\.headers\.host\)/);
});
