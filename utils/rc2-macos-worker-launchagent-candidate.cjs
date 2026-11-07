'use strict';
/**
 * Source-only, least-privilege per-user launchd property list CANDIDATE.
 * No filesystem access, install, launchctl call, worker restart or live action.
 * The owner must separately authorize installing/enabling a LaunchAgent.
 */
const path=require('node:path');
const ROOTS=Object.freeze(['/tmp','/private/tmp','/var/tmp','/private/var/tmp',
 '/var/folders','/private/var/folders','/dev/shm','/run/user']);
const FIELDS=Object.freeze(['nodeExecutable','productRoot','privatePinFile','privateLogDirectory']);
const LABEL='org.devproxy.rc2.mac-host-worker';
const SCRIPT='scripts/rc2-supervised-mac-host-worker.cjs';
function ownPlain(obj){
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||
  Object.getPrototypeOf(obj)!==Object.prototype)return false;
 const keys=Reflect.ownKeys(obj);
 return keys.length===FIELDS.length&&FIELDS.every(key=>{
  const d=Object.getOwnPropertyDescriptor(obj,key);
  return d&&Object.hasOwn(d,'value');
 });
}
function safePath(p){
 return typeof p==='string'&&p.length>1&&p.length<=1024&&
  p.startsWith('/')&&p!=='/'&&!p.endsWith('/')&&
  path.posix.normalize(p)===p&&!/[\x00-\x1f\x7f]/.test(p)&&
  !ROOTS.some(root=>p.toLowerCase()===root||p.toLowerCase().startsWith(root+'/'))&&
  !p.includes('docker.sock');
}
function inside(a,b){return a===b||a.startsWith(b+'/');}
function escapeXml(s){return s.replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
})[c]);}
function xmlStr(s){return '<string>'+escapeXml(s)+'</string>';}
function createWorkerLaunchAgentCandidate(input){
 if(!ownPlain(input)||FIELDS.some(k=>!safePath(input[k])))throw Error('INVALID_RC2_LAUNCHAGENT_CANDIDATE');
 const {nodeExecutable,productRoot,privatePinFile,privateLogDirectory}=input;
 if(path.posix.basename(nodeExecutable)!=='node'||inside(nodeExecutable,productRoot)||
  inside(productRoot,nodeExecutable)||inside(privatePinFile,productRoot)||
  inside(productRoot,privatePinFile)||inside(privateLogDirectory,productRoot)||
  inside(productRoot,privateLogDirectory)||inside(privatePinFile,privateLogDirectory)||
  inside(privateLogDirectory,privatePinFile))
  throw Error('INVALID_RC2_LAUNCHAGENT_CANDIDATE');
 const workerScript=path.posix.join(productRoot,SCRIPT);
 const out=path.posix.join(privateLogDirectory,'host-worker.out.log');
 const err=path.posix.join(privateLogDirectory,'host-worker.err.log');
 const lines=[
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">','<dict>',
  '  <key>Label</key>','  '+xmlStr(LABEL),
  '  <key>ProgramArguments</key>','  <array>',
  ...[nodeExecutable,workerScript,'--serve',privatePinFile].map(x=>'    '+xmlStr(x)),
  '  </array>',
  '  <key>WorkingDirectory</key>','  '+xmlStr(productRoot),
  '  <key>RunAtLoad</key>','  <true/>',
  // KeepAlive=false: crash quarantine MUST NOT become a reboot/restart loop.
  '  <key>KeepAlive</key>','  <false/>',
  '  <key>StandardOutPath</key>','  '+xmlStr(out),
  '  <key>StandardErrorPath</key>','  '+xmlStr(err),
  '</dict>','</plist>',''
 ];
 return Object.freeze({code:'RC2_LAUNCHAGENT_SOURCE_ONLY',
  plistFileName:LABEL+'.plist',plistXml:lines.join('\n'),
  installed:false,macTested:false,ownerApprovedInstall:false,
  productionChangeAuthorized:false,installInstructionsIncluded:false,
  requiresNewOwnerGrant:true});
}
module.exports={createWorkerLaunchAgentCandidate};
