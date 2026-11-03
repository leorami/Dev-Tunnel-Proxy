'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {transformApprovedApi,approvedBlobSha,gitBlobSha}=require('../tools/approved-api-route-activation-codemod.cjs');
const fixture=`const calliopeHealing = require('./calliopeHealing');
const ROUTE_PROMOTIONS_FILE = path.join(ARTIFACTS_DIR, 'route-promotions.json');
function safeConfigPath(file){return path.join(ROOT,file);}
function normalizeBasePath(basePath){return basePath;}
async function installAppConfigFile(name, content){fs.writeFileSync('old-app',content);}
function nginxTestAndMaybeReload(){return {ok:true};}
function loadResolutions(){return {};}
async function handle(req,res){
const u={pathname:'/devproxy/api/config/x.conf'};const seg=[];
    // POST /api/apps/regenerate { reload?: boolean }
    if (req.method === 'POST' && u.pathname === apiPath('apps/regenerate')){fs.writeFileSync('old-bundle','x');}
    // POST /api/apps/cleanup { dryRun?: true }
        const dryRun = (body && typeof body.dryRun === 'boolean') ? body.dryRun : true;
    // Promote app config into overrides (replace override with apps version)
    // POST /api/overrides/promote { filename }
    if (req.method === 'POST' && u.pathname === apiPath('overrides/promote')){fs.writeFileSync('old-override','x');}
    // POST /api/apps/create-route
    // GET /api/config/:file
    if (req.method === 'GET' && seg[0] === 'api' && seg[1] === 'config' && seg[2]){fs.readFileSync('old-config-get');}
    // POST /api/config/:file  { content }
    if (req.method === 'POST' && seg[0] === 'api' && seg[1] === 'config' && seg[2]){fs.writeFileSync('old-config','x');}
    // POST /api/resolve-conflict { route, winner }
    // POST /api/rename-route { oldRoute, newRoute, configFile }
    if (req.method === 'POST' && u.pathname === apiPath('rename-route')){fs.writeFileSync('old-rename','x');}
    // ======== AI Assistant (optional) ========
}`;
test('verified approved API blob is the only target',()=>{
 assert.equal(approvedBlobSha,'2eb02328ab892add8a07648890c0047daafa3fc2');
 assert.equal(gitBlobSha('abc'),'f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f');
});
test('codemod rewires all recognized unsafe mutation paths, preserving GET routes',()=>{
 const out=transformApprovedApi(fixture,{verifyBlob:false});
 assert.match(out,/getRouteMutationService/);assert.match(out,/manager\.install/);
 assert.match(out,/manager\.promote/);assert.match(out,/editApp/);
 assert.match(out,/BLOCKED_UNSAFE_CONFIG_ROUTE/);assert.match(out,/manager\.regenerate/);assert.doesNotMatch(out,/transactional_regenerate_not_integrated/);
 assert.doesNotMatch(out,/fs\.writeFileSync\('old-/);
 assert.match(out,/function normalizeBasePath\(basePath\)/);
 assert.match(out,/u\.pathname\.startsWith\(apiPath\('config\/'\)\)/);
 assert.doesNotMatch(out,/seg\[0\] === 'api' && seg\[1\] === 'config'/);
 assert.match(out,/route-mutation-locks/);
 assert.match(out,/mode:0o700/);
});
test('source-exact check rejects unrelated baseline without changing bytes',()=>{
 assert.throws(()=>transformApprovedApi(fixture),/BASELINE_SHA_MISMATCH/);
});
test('all required structural anchors fail closed on mismatch',()=>{
 const broken=fixture.replace('async function installAppConfigFile(name, content){','async function changedInstall(name, content){');
 assert.throws(()=>transformApprovedApi(broken,{verifyBlob:false}),/ANCHOR_/);
});
test('transformed approved-source-shaped code parses as JavaScript before any source edit',()=>{
 const vm=require('node:vm');
 const preview=transformApprovedApi(fixture,{verifyBlob:false});
 assert.doesNotThrow(()=>new vm.Script(preview,{filename:'proxyConfigAPI.cto-preview.js'}));
});
