'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=()=>fs.readFileSync(path.resolve(__dirname,'../../utils/proxyConfigAPI.js'),'utf8');
test('GET apps diagnostics and active use existing read-only artifact; no implicit route mutation',()=>{
 const source=api();
 const start=source.indexOf("if (req.method === 'GET' && u.pathname === apiPath('apps/diagnostics'))");
 const end=source.indexOf("if (req.method === 'POST' && u.pathname === apiPath('apps/regenerate'))",start);
 assert.ok(start>0&&end>start,'both GET handlers precede existing explicit transaction');
 const handlers=source.slice(start,end);
 assert.equal((handlers.match(/readExistingBundleDiagnostics\(/g)||[]).length,2);
 assert.doesNotMatch(handlers,/generateAppsBundle|spawnSync|execSync|writeFileSync|unlinkSync|mkdirSync/);
 assert.match(handlers,/BUNDLE_DIAGNOSTICS_OK/);
 assert.match(handlers,/return send\(res,503,\{ok:false,error:r\.code\}\)/);
 assert.match(source,/require\('\.\/rc2-readonly-bundle-diagnostics\.cjs'\)/);
});
