'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createProductionComposeCandidate}=require('../../utils/rc2-production-compose-candidate.cjs');
function fixture(){return {proxyImage:'secure/proxy@sha256:'+'a'.repeat(64),apiImage:'secure/api@sha256:'+'b'.repeat(64),apiUid:504,apiGid:20,
 paths:{sourceRoot:'/private/stage/source',ownerEnvFile:'/private/pins/env',secretHostFile:'/private/pins/activation.secret',
 spoolHostDir:'/private/pins/host-share',appsDir:'/private/data/apps',overridesDir:'/private/data/overrides',
 sitesDir:'/private/data/sites',artifactsDir:'/private/data/artifacts',nginxConf:'/private/stage/source/config/nginx.production.conf',
 defaultConf:'/private/stage/source/config/default.production.conf',nginxEntrypoint:'/private/stage/source/scripts/nginx-entrypoint.sh',
 certsDir:'/private/data/certs',statusDir:'/private/data/status',dashboardDir:'/private/stage/source/dashboard/public'}}}
test('RED: mount private IPC PARENT only; spool is API-created child, never Docker bind root',()=>{
 const c=createProductionComposeCandidate(fixture()).compose.services['proxy-config-api'];
 const vol=new Map(c.volumes.map(x=>[x.target,x]));
 assert.ok(vol.has('/app/.artifacts/rc2-ipc'));
 assert.equal(vol.get('/app/.artifacts/rc2-ipc').read_only,false);
 assert.equal(vol.get('/app/.artifacts/rc2-ipc').source,fixture().paths.spoolHostDir);
 assert.equal(vol.has('/app/.artifacts/rc2-ipc/spool'),false);
 assert.equal(vol.has('/app/.artifacts/rc2-spool'),false);
 assert.equal(c.environment.DEVPROXY_ACTIVATION_SPOOL_DIR,'/app/.artifacts/rc2-ipc/spool');
});
test('RED: API spool initializer executes BEFORE notifications and API on every container start',()=>{
 const c=createProductionComposeCandidate(fixture()).compose.services['proxy-config-api'];
 const body=c.command.at(-1);
 const start=body.indexOf('rc2-create-api-spool.cjs'),notifications=body.indexOf('notificationsAPI.js'),api=body.indexOf('proxyConfigAPI.js');
 assert.ok(start>=0&&start<notifications&&notifications<api);
 assert.ok(!body.includes('docker')&&!body.includes('apk'));
 assert.equal(c.user,'504:20');assert.equal(c.read_only,true);
});
