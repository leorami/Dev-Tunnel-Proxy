/** DEVPROXY-003B RED-first: login redirect may not leave same origin. No live runtime. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { safeLoginRedirect }=require('../../status/assets/login-redirect-policy.js');

test('preserves normal local application destinations and query strings',()=>{
 for(const [raw,want] of [
  ['/status','/status'],
  ['/status?tab=routes','/status?tab=routes'],
  ['/dashboard/','/dashboard/'],
  ['/reports?page=2#latest','/reports?page=2#latest'],
  ['/?route=my-app','/?route=my-app'],
  ['/status?reference=https%3A%2F%2Fexample.test','/status?reference=https%3A%2F%2Fexample.test'],
 ])assert.equal(safeLoginRedirect(raw),want,raw);
});

test('rejects external, protocol, protocol-relative and malformed login redirects',()=>{
 for(const input of [
  '',undefined,null,[],{},false,
  'https://evil.example/collect',
  'http://evil.example',
  '//evil.example/path',
  '/\\evil.example/path',
  'javascript:alert(1)',
  'data:text/html,hello',
  ' https://evil.example',
  '\nhttps://evil.example',
  '/status\n//evil.example',
  '/%2f%2fevil.example',
  '/%5cevil.example',
  '/%0d%0aheader',
  '/status\rset-cookie:fake',
  '/status\u0000',
  '/'.repeat(3000),
 ])assert.equal(safeLoginRedirect(input),'/status',String(input).slice(0,60));
});

test('login page cannot navigate using raw redirect query parameter',()=>{
 const page=fs.readFileSync(new URL('../../status/login.html',import.meta.url),'utf8');
 assert.match(page,/<script\s+src="\/assets\/login-redirect-policy\.js"><\/script>/);
 assert.match(page,/DevProxyRedirectPolicy\.safeLoginRedirect\(urlParams\.get\('redirect'\)\)/);
 assert.doesNotMatch(page,/const redirectUrl = urlParams\.get\('redirect'\) \|\| '\/status'/);
});
