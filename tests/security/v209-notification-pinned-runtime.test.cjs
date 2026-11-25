'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'macos/dev-tunnel-proxy-notifications');
const node = fs.realpathSync(process.execPath);
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pin = {
  DEVPROXY_NOTIFICATION_NODE_EXECUTABLE: node,
  DEVPROXY_NOTIFICATION_NODE_SHA256: sha256(node),
  DEVPROXY_NOTIFICATION_NODE_VERSION: process.version
};
function fixture(run) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'devproxy-notif-pin-')));
  try {
    const wrapper = path.join(dir, 'dev-tunnel-proxy-notifications');
    fs.copyFileSync(source, wrapper);
    fs.writeFileSync(path.join(dir, 'notifications-engine.js'),
      "console.log(JSON.stringify({node:process.execPath,args:process.argv.slice(2),marker:process.env.PIN_TEST_MARKER||null}));\n");
    const invoke = (overrides = {}, args = []) => {
      const env = {...process.env, ...pin, ...overrides};
      delete env.PIN_TEST_MARKER;
      for (const [k,v] of Object.entries(env)) if (v === undefined) delete env[k];
      return spawnSync('/bin/bash', [wrapper, ...args], {cwd:dir, env, encoding:'utf8', timeout:15000});
    };
    run({dir, invoke});
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
}
function refused(result) {
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.trim(), '');
  assert.match(result.stderr, /NOTIFICATION_RUNTIME_PIN_REJECTED/);
}
test('pinned launcher executes the exact real Node and preserves engine arguments', () => fixture(({invoke}) => {
  const r = invoke({}, ['--fixture', 'argument with spaces']);
  assert.ifError(r.error); assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.equal(fs.realpathSync(parsed.node), node);
  assert.deepEqual(parsed.args, ['--fixture', 'argument with spaces']);
}));
test('explicit pin beats automatic discovery and preserves the wrapper entrypoint', () => fixture(({dir, invoke}) => {
  // A synthetic executable only, never an actual notification engine.
  const bin = path.join(dir, 'runtime with spaces');
  fs.mkdirSync(bin);
  const executable = path.join(bin, 'node');
  const quote = s => "'" + s.replace(/'/g, "'\\''") + "'";
  fs.writeFileSync(executable, '#!/bin/sh\nPIN_TEST_MARKER=explicit exec '+quote(node)+' "$@"\n', {mode:0o700});
  const r = invoke({DEVPROXY_NOTIFICATION_NODE_EXECUTABLE:executable,
    DEVPROXY_NOTIFICATION_NODE_SHA256:sha256(executable)});
  assert.ifError(r.error); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).marker, 'explicit');
}));
test('partial and empty explicit pins fail closed rather than falling back', () => fixture(({invoke}) => {
  for (const key of Object.keys(pin)) {
    refused(invoke({[key]:undefined}));
    refused(invoke({[key]:''}));
  }
}));
test('incorrect digest and version fail before engine execution', () => fixture(({invoke}) => {
  refused(invoke({DEVPROXY_NOTIFICATION_NODE_SHA256:'0'.repeat(64)}));
  refused(invoke({DEVPROXY_NOTIFICATION_NODE_VERSION:process.version==='v24.0.0'?'v24.0.1':'v24.0.0'}));
  refused(invoke({DEVPROXY_NOTIFICATION_NODE_VERSION:'v25.9.0'}));
}));
test('relative, noncanonical and symlink executable paths fail closed', () => fixture(({dir, invoke}) => {
  const alias = path.join(dir, 'node');
  fs.symlinkSync(node, alias);
  for (const p of ['node', path.join(path.dirname(node), '..', path.basename(path.dirname(node)), 'node'), alias]) {
    // path.join normalizes: explicitly preserve the noncanonical spelling below.
    if (p === node) continue;
    refused(invoke({DEVPROXY_NOTIFICATION_NODE_EXECUTABLE:p}));
  }
  refused(invoke({DEVPROXY_NOTIFICATION_NODE_EXECUTABLE:path.dirname(node)+'/../'+path.basename(path.dirname(node))+'/node'}));
}));
