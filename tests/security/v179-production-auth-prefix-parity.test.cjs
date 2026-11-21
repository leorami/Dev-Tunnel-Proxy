'use strict';
/**
 * CTO source-exact protection: a clean install from protected main MUST
 * preserve V172's four live ^~ Nginx authentication prefixes in BOTH
 * the default and production overlay, before any deployment/reload.
 *
 * RED on main@d79cee370f739c48bb9e18da13d4d6407b9df925:
 * config/default.production.conf still has ordinary prefixes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const sources = ['default.conf', 'default.production.conf'];
const prefixes = ['/status','/reports','/health','/dashboard'];

function source(name) {
  return fs.readFileSync(path.join(root, 'config', name), 'utf8');
}
function block(config, name) {
  const needle = 'location ^~ ' + name + ' {';
  const at = config.indexOf(needle);
  if (at < 0) return null;
  const start = config.indexOf('{', at);
  let depth = 1;
  for (let i = start + 1; i < config.length; i++) {
    if (config[i] === '{') depth++;
    if (config[i] === '}' && --depth === 0) return config.slice(at, i + 1);
  }
  return null;
}

test('V172 four ^~ private UI prefixes survive BOTH clean-install Nginx configs', () => {
  for (const file of sources) {
    const config = source(file);
    for (const prefix of prefixes) {
      const location = block(config, prefix);
      assert.ok(location, file + ' is missing ^~ protection for ' + prefix);
      assert.match(location, /auth_request\s+\/admin\/check\s*;/,
        file + ' must retain authentication at ' + prefix);
      assert.doesNotMatch(config, new RegExp('location\\s+'+prefix+'\\s*\\{'),
        file + ' must not retain a shadow ordinary prefix '+prefix);
    }
  }
});

test('exact public health + exact protected JSON remain intentionally distinct', () => {
  for (const file of sources) {
    const config = source(file);
    assert.match(config, /location\s*=\s*\/health\.json\s*\{/,
      file + ' must keep intentional public health');
    for (const name of ['/status.json','/routes.json']) {
      const exact = config.indexOf('location = ' + name + ' {');
      assert.ok(exact >= 0, file + ' missing exact '+name);
      const tail = config.slice(exact, exact + 500);
      assert.match(tail, /auth_request\s+\/admin\/check\s*;/,
        file + ' exact protected JSON cannot become public');
    }
    assert.match(config, /location\s+~\*\s+\\\.\(json\)\$/,
      file + ' has a generic regex whose precedence ^~ must defeat');
  }
});
