/** RED-first: read-only sites-enabled must fail closed, not pretend apps were disabled. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const source = fs.readFileSync(new URL('../../scripts/nginx-entrypoint.sh', import.meta.url), 'utf8');

function fixture(t, {nginxPassesOnRetry = false, readOnlyBundle = true} = {}) {
  const root = fs.mkdtempSync(path.join('/private/tmp', 'devproxy-nginx-ro-'));
  const bin = path.join(root, 'bin');
  const sites = path.join(root, 'sites-enabled');
  t.after(() => {
    try { fs.chmodSync(sites, 0o700); } catch {}
    fs.rmSync(root, {recursive: true, force: true});
  });
  fs.mkdirSync(bin, {mode: 0o700});
  fs.mkdirSync(sites, {recursive: true});
  const bundle = path.join(sites, 'apps.generated.conf');
  fs.writeFileSync(bundle, 'location /bad { syntax error\n');
  if (readOnlyBundle) fs.chmodSync(sites, 0o555);
  const log = path.join(root, 'nginx-t.log');
  let calls = 0;
  fs.writeFileSync(path.join(bin, 'nginx'), `#!/bin/sh
echo "$*" >> "$NGINX_LOG"
if [ "$1" = "-t" ]; then
  calls_file="$NGINX_CALLS"
  n=\`cat "$calls_file" 2>/dev/null || echo 0\`
  n=\`expr "$n" + 1\`
  echo "$n" > "$calls_file"
  if [ "$n" -eq 1 ]; then exit 1; fi
  if [ "$NGINX_RETRY_OK" = "1" ]; then exit 0; fi
  exit 1
fi
exit 0
`, {mode: 0o700});
  fs.writeFileSync(path.join(root, 'calls'), '0');
  const script = path.join(root, 'entrypoint.sh');
  // Point the entrypoint at the fixture sites-enabled path.
  const adapted = source
    .replaceAll('/etc/nginx/conf.d/sites-enabled/apps.generated.conf.disabled', path.join(sites, 'apps.generated.conf.disabled'))
    .replaceAll('/etc/nginx/conf.d/sites-enabled/apps.generated.conf', bundle);
  fs.writeFileSync(script, adapted, {mode: 0o700});
  const env = {
    ...process.env,
    PATH: bin + path.delimiter + '/usr/bin:/bin',
    NGINX_LOG: log,
    NGINX_CALLS: path.join(root, 'calls'),
    NGINX_RETRY_OK: nginxPassesOnRetry ? '1' : '0',
  };
  const run = () => spawnSync('sh', [script], {env, encoding: 'utf8', timeout: 10000});
  return {root, bundle, sites, run, log, callsFile: path.join(root, 'calls')};
}

test('read-only mount: failed nginx -t exits nonzero and leaves the bundle in place', (t) => {
  const f = fixture(t, {readOnlyBundle: true, nginxPassesOnRetry: true});
  const r = f.run();
  assert.notEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /read-only|Refusing to start/i);
  assert.equal(fs.existsSync(f.bundle), true);
  assert.equal(fs.existsSync(path.join(f.sites, 'apps.generated.conf.disabled')), false);
  assert.doesNotMatch(r.stderr + r.stdout, /App routes are disabled/);
  assert.equal(fs.readFileSync(f.callsFile, 'utf8').trim(), '1');
});

test('writable mount: successful disable may retry nginx -t once', (t) => {
  const f = fixture(t, {readOnlyBundle: false, nginxPassesOnRetry: true});
  const r = f.run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fs.existsSync(f.bundle), false);
  assert.equal(fs.existsSync(path.join(f.sites, 'apps.generated.conf.disabled')), true);
  assert.match(r.stderr + r.stdout, /App routes are disabled/);
  assert.equal(fs.readFileSync(f.callsFile, 'utf8').trim(), '2');
});
