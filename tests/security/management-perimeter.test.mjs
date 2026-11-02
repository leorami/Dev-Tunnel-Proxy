/** DEVPROXY-002 RED-first security contracts. No servers or live system mutations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('management API defaults to authentication; only exact read-only health is anonymous', () => {
  const { classifyManagementRequest } = require('../../utils/managementAuthPolicy.cjs');
  const cases = [
    ['GET','/devproxy/api/ai/health',true,false],
    ['POST','/devproxy/api/ai/health',false,true],
    ['POST','/devproxy/api/ai/reindex',false,true],
    ['POST','/devproxy/api/ai/ask',false,true],
    ['GET','/devproxy/api/ai/chat-history',false,true],
    ['POST','/devproxy/api/ai/cancel',false,true],
    ['GET','/devproxy/api/ai/thoughts',false,true],
    ['POST','/devproxy/api/settings/auto-scan',false,true],
    ['GET','/devproxy/api/settings/auto-scan',false,true],
    ['POST','/devproxy/api/promotions',false,true],
    ['GET','/devproxy/api/promotions',false,true],
    ['GET','/devproxy/api/overrides/conflicts',false,true],
    ['GET','/devproxy/api/reports/list',false,true],
    ['POST','/devproxy/api/apps/install',false,true],
    ['GET','/devproxy/api',false,true],
    ['GET','/api/config/existing.conf',false,true],
    ['POST','/api/config/existing.conf',false,true],
    ['GET','/api/config',false,true],
    ['GET','/devproxy/apiX/ai/health',false,false],
    ['GET','/config',false,false],
  ];
  for (const [method, path, isPublic, requiresAuth] of cases) {
    const actual=classifyManagementRequest(method,path);
    assert.equal(actual.isPublic,isPublic,method+' '+path);
    assert.equal(actual.requiresAuth,requiresAuth,method+' '+path);
  }
  assert.equal(classifyManagementRequest('GET','/custom/api/ai/health','/custom/api').isPublic,true);
  assert.equal(classifyManagementRequest('GET','/custom/api/ai/chat-history','/custom/api').requiresAuth,true);
});

for (const config of ['config/default.conf','config/default.production.conf']) {
  test(config+' denies raw artifacts, exposing only authenticated explicit legacy fallback files', () => {
    const source=read(config);
    assert.match(source,/location\s+\^~\s+\/\.artifacts\/\s*\{\s*return\s+404;/);
    assert.doesNotMatch(source,/autoindex\s+on\s*;/);
    assert.match(source,/location\s+=\s+\/\.artifacts\/reports\/health-latest\.json\s*\{\s*auth_request\s+\/admin\/check;/);
    assert.match(source,/location\s+=\s+\/\.artifacts\/calliope\/healing-log\.json\s*\{\s*auth_request\s+\/admin\/check;/);
    assert.doesNotMatch(source,/location\s+\/admin\/show-password\s*\{/);
    assert.match(source,/location\s+=\s+\/admin\/show-password\s*\{\s*return\s+404;/);
    assert.match(source,/location\s+=\s+\/devproxy\/api\/notifications\s*\{\s*auth_request\s+\/admin\/check;/);
  });
}

test('direct password disclosure API handler is removed, including crafted Host and forwarded-IP routes', () => {
  const source=read('utils/proxyConfigAPI.js');
  assert.doesNotMatch(source,/u\.pathname\s*===\s*['"]\/admin\/show-password['"]/);
});

for (const compose of ['docker-compose.yml','docker-compose.production.yml']) {
  test(compose+' exposes the privileged APIs only to host loopback', () => {
    const s=read(compose);
    assert.match(s,/127\.0\.0\.1:3001:3001/);
    assert.match(s,/127\.0\.0\.1:3002:3002/);
    assert.doesNotMatch(s,/^\s*-\s*["']300[12]:300[12]["']/m);
  });
}


for (const config of ['config/default.conf','config/default.production.conf']) {
  test(config+' keeps route inventory and nginx diagnostics away from anonymous tunnel clients', () => {
    const source=read(config);
    for (const marker of [
      'location = /routes {',
      'location = /routes.json {',
      'location = /status.json {',
      'location /dashboard {',
    ]) {
      const index=source.indexOf(marker);
      assert.notEqual(index,-1,marker);
      assert.match(source.slice(index,index+250),/auth_request\s+\/admin\/check;/,marker);
    }
    const monitor=source.indexOf('location /nginx_status {');
    assert.notEqual(monitor,-1);
    const tail=source.slice(monitor,monitor+460);
    assert.match(tail,/allow\s+127\.0\.0\.1;/);
    assert.match(tail,/deny\s+all;/);
    assert.doesNotMatch(tail,/allow\s+(?:172\.|192\.168\.|10\.)/);
  });
}
