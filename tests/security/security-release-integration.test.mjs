/** RC1 RED-first integration: source-only, no sockets, services or credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const root=new URL('../../',import.meta.url);
const src=(path)=>readFileSync(new URL(path,root),'utf8');

test('the combined proposal contains every required security boundary',()=>{
 for(const file of [
  'utils/managementAuthPolicy.cjs',
  'utils/admin-session-security.cjs',
  'macos/notifications-bridge-auth.cjs',
  'status/assets/login-redirect-policy.js',
  'tests/security/management-perimeter.test.mjs',
  'tests/security/admin-session-foundation.test.mjs',
  'tests/security/notification-bridge-authorization.test.mjs',
  'tests/security/login-redirect-same-origin.test.mjs',
 ])assert.equal(existsSync(new URL(file,root)),true,file);
});

test('all four security suites are connected exactly once to canonical unit testing',()=>{
 const build=src('smart-build.sh');
 for(const name of [
  'management-perimeter.test.mjs','admin-session-foundation.test.mjs',
  'notification-bridge-authorization.test.mjs','login-redirect-same-origin.test.mjs'
 ])assert.equal(build.split(name).length-1,1,name);
});

test('login UI uses one validated same-origin redirect for both already-signed-in and new login',()=>{
 const html=src('status/login.html');
 assert.match(html,/<script\s+src="\/assets\/login-redirect-policy\.js"><\/script>/);
 assert.match(html,/DevProxyRedirectPolicy\.safeLoginRedirect\(urlParams\.get\('redirect'\)\)/);
 assert.equal(html.split('window.location.href = redirectUrl;').length-1,2);
 const {safeLoginRedirect}=require('../../status/assets/login-redirect-policy.js');
 assert.equal(safeLoginRedirect('/reports?tab=live'),'/reports?tab=live');
 for(const hostile of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','javascript:alert(1)']){
  assert.equal(safeLoginRedirect(hostile),'/status');
 }
});

test('macOS Messages and LaunchAgent effects are behind a local explicit capability check',()=>{
 const code=src('macos/notifications-bridge.js');
 const guard=code.indexOf('const decision=authorizeBridgeRequest(req');
 const install=code.indexOf("req.url === '/service/install'");
 const uninstall=code.indexOf("req.url === '/service/uninstall'");
 const send=code.indexOf("req.url === '/test'");
 assert.ok(guard>=0 && install>guard && uninstall>guard && send>guard,'the guard precedes all action endpoints');
 assert.doesNotMatch(code,/['"]Access-Control-Allow-Origin['"]:\s*['"]\*['"]/);
 const page=src('status/status.html');
 assert.match(page,/NOTIF_BRIDGE_PAIR_KEY/);
 assert.match(page,/sessionStorage\.setItem\(NOTIF_BRIDGE_PAIR_KEY/);
 assert.doesNotMatch(page,/localStorage\.setItem\(NOTIF_BRIDGE_PAIR_KEY/);
 assert.doesNotMatch(page,/fetch\(NOTIF_SERVICE_(?:INSTALL|UNINSTALL|STATUS)_ENDPOINT/);
});

test('node management secrets and public ingress are private across dev and production',()=>{
 const api=src('utils/proxyConfigAPI.js');
 assert.match(api,/safeAdminPasswordMatches\(password,ADMIN_PASSWORD\)/);
 assert.match(api,/classifyManagementRequest\(req.method,u.pathname,PROXY_API_BASE_PATH\)|classifyManagementRequest\(req.method, u.pathname, PROXY_API_BASE_PATH\)/);
 assert.doesNotMatch(api,/u\.pathname\s*===\s*['"]\/admin\/show-password['"]/);
 for(const conf of ['config/default.conf','config/default.production.conf']){
  const nginx=src(conf);
  assert.match(nginx,/location \^~ \/\.artifacts\/ \{\s*return 404;/);
  assert.match(nginx,/location = \/admin\/show-password \{\s*return 404;/);
  assert.match(nginx,/location = \/devproxy\/api\/notifications \{\s*auth_request \/admin\/check;/);
 }
 for(const file of ['docker-compose.yml','docker-compose.production.yml']){
  const compose=src(file);
  assert.match(compose,/127\.0\.0\.1:3001:3001/);
  assert.match(compose,/127\.0\.0\.1:3002:3002/);
 }
});
