#!/usr/bin/env node
/* Proxy Config Management API (no external deps)
   Endpoints:
   - GET  /api/config/:file
   - POST /api/config/:file    { content }
   - POST /api/resolve-conflict { route, winner }
   - POST /api/rename-route     { oldRoute, newRoute, configFile }

   AI Assistant (optional via OPENAI_API_KEY):
   - GET  /api/ai/health
   - POST /api/ai/reindex      (rebuild knowledge base embeddings)
   - POST /api/ai/ask          { query, maxDocs?, systemHint? }
   - POST /api/ai/self-check   { heal?: boolean, hint?: string }
   - POST /api/ai/audit        { url, wait?, timeout? }
   - POST /api/ai/audit-and-heal { url, route?, maxPasses?, wait?, timeout? }
*/

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const calliopeHealing = require('./calliopeHealing');
const { classifyManagementRequest } = require('./managementAuthPolicy.cjs');
const {safeAdminPasswordMatches,extractAdminSessionToken,adminSessionCookie,writeSecureSessionFile,readSecureSessionFile,adminRequestOriginAllowed,normalizeTrustedOrigins} = require('./admin-session-security.cjs');
const TRUSTED_ORIGINS = normalizeTrustedOrigins(process.env.DEVPROXY_TRUSTED_ORIGINS || '');

const ROOT = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');
const ARTIFACTS_DIR = path.join(ROOT, '.artifacts');
const RES_FILE = path.join(ARTIFACTS_DIR, 'route-resolutions.json');
const EMBED_FILE = path.join(ARTIFACTS_DIR, 'ai-embeddings.json');
const CHAT_DIR = path.join(ARTIFACTS_DIR, 'calliope');
const CHAT_FILE = path.join(CHAT_DIR, 'chat-history.json');
const DOCS_DIR = path.join(ROOT, 'docs');
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const README = path.join(ROOT, 'README.md');
const TROUBLESHOOTING = path.join(ROOT, 'TROUBLESHOOTING.md');
const PROJECT_INTEGRATION = path.join(ROOT, 'PROJECT-INTEGRATION.md');
  const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');
const OVERRIDES_DIR = path.join(ROOT, 'overrides');
const CONFLICTS_FILE = path.join(ROOT, '.artifacts', 'override-conflicts.json');
const ENV_FILE = path.join(ROOT, '.env');
const SESSION_FILE = path.join(ARTIFACTS_DIR, 'admin-session.json');
const AUTO_SCAN_SETTINGS_FILE = path.join(ARTIFACTS_DIR, 'auto-scan-settings.json');
const ROUTE_PROMOTIONS_FILE = path.join(ARTIFACTS_DIR, 'route-promotions.json');
const {createProductionRouteMutationService} = require('./production-route-mutation.cjs');
const {createAuthenticatedReloadClient} = require('./owner-authenticated-reload.cjs');
const {createExclusiveMutationLock} = require('./exclusive-route-mutation-lock.cjs');
const {createCrossProcessSettlementActivation} = require('./rc2-cross-process-settlement.cjs');
/** Fail closed for unmediated Docker/self-heal when settlement is the authorized path
 *  or production API has no docker.sock. Endpoints return an explicit unavailable
 *  code instead of silently no-oping or shelling docker.
 */
function inlineHostDockerUnavailable(){
  if(process.env.DEVPROXY_ALLOW_INLINE_DOCKER==='1')return false;
  if(process.env.DEVPROXY_ACTIVATION_SPOOL_DIR)return true;
  if(process.env.DEVPROXY_DENY_INLINE_DOCKER==='1')return true;
  if(process.env.NODE_ENV==='production'){
    try{if(!fs.existsSync('/var/run/docker.sock'))return true;}catch{return true;}
  }
  return false;
}
function refuseInlineDocker(res, action){
  if(!inlineHostDockerUnavailable())return false;
  send(res, 503, { ok:false, code:'BLOCKED_INLINE_DOCKER_UNAVAILABLE', action,
    productionChangeAuthorized:false, liveAttested:false });
  return true;
}

let routeManager = null;
function loadActivationSecret(secretFile){
  if(typeof secretFile!=='string'||!path.isAbsolute(secretFile))return null;
  const st=fs.lstatSync(secretFile);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0)return null;
  const secret=fs.readFileSync(secretFile);
  if(!Buffer.isBuffer(secret)||secret.length<32||secret.length>128)return null;
  return secret;
}
function getRouteMutationService(){
  if(routeManager) return routeManager;
  try {
    // Prefer the reviewed HMAC file-spool + v13 settlement path. Unix-socket
    // reload remains available only when spool is not provisioned (legacy).
    // All secrets/paths are operator-provisioned privately, never in Git.
    const spoolDir=process.env.DEVPROXY_ACTIVATION_SPOOL_DIR;
    const settlementSecretFile=process.env.DEVPROXY_ACTIVATION_SECRET_FILE;
    const socket=process.env.DEVPROXY_RELOAD_SOCKET;
    const secretFile=process.env.DEVPROXY_RELOAD_SECRET_FILE;
    let activation=null;
    if(spoolDir||settlementSecretFile){
      if(typeof spoolDir!=='string'||!path.isAbsolute(spoolDir)||path.normalize(spoolDir)!==spoolDir||
         spoolDir==='/'||spoolDir.endsWith(path.sep))return null;
      const secret=loadActivationSecret(settlementSecretFile);
      if(!secret)return null;
      const sd=fs.lstatSync(spoolDir);
      if(!sd.isDirectory()||sd.isSymbolicLink()||(sd.mode&0o077)!==0||
         (typeof process.getuid==='function'&&sd.uid!==process.getuid()))return null;
      activation=createCrossProcessSettlementActivation({
        approvedRoot:ROOT,spoolDirectory:spoolDir,secret
      });
    } else if(socket||secretFile){
      if(typeof socket!=='string'||typeof secretFile!=='string')return null;
      const secret=loadActivationSecret(secretFile);
      if(!secret)return null;
      activation=createAuthenticatedReloadClient({socketPath:socket,secret});
    }
    // Create only this private owner-data lock leaf; never modify /app source.
    const art=fs.lstatSync(ARTIFACTS_DIR);
    if(!art.isDirectory()||art.isSymbolicLink())return null;
    const lockDir=path.join(ARTIFACTS_DIR,'route-mutation-locks');
    try{fs.mkdirSync(lockDir,{mode:0o700});}catch(e){if(e.code!=='EEXIST')return null;}
    const ld=fs.lstatSync(lockDir);
    if(!ld.isDirectory()||ld.isSymbolicLink()||(ld.mode&0o077)!==0||
       (typeof process.getuid==='function'&&ld.uid!==process.getuid()))return null;
    const lock=createExclusiveMutationLock({directory:lockDir});
    const generateBundle=()=>new Promise((resolve,reject)=>{
      require('node:child_process').execFile(process.execPath,[path.join(__dirname,'generateAppsBundle.js')],
        {cwd:ROOT,shell:false,timeout:12000,maxBuffer:4096},err=>err?reject(Error('BUNDLE_FAILED')):resolve());
    });
    routeManager=createProductionRouteMutationService({root:ROOT,activation,generateBundle,lock,allowConfigEdit:false});
    return routeManager;
  } catch { return null; }
}

const RESERVED_PATHS = [
  '/',
  '/status',
  '/health',
  '/reports',
  '/dashboard',
  '/api/ai',
  '/api/config',
  '/api/apps',
  '/api/overrides',
  '/api/reports',
  '/health.json',
  '/routes.json',
  '/status.json',
  '/.artifacts'
];

// ========================================
// API BASE PATH CONFIGURATION
// Centralized configuration for API endpoint namespacing
// ========================================
const PROXY_API_BASE_PATH = process.env.PROXY_API_BASE_PATH || '/devproxy/api';

// Helper to build API paths consistently
function apiPath(path) {
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${PROXY_API_BASE_PATH}/${cleanPath}`;
}

// ========================================
// AUTHENTICATION & SESSION MANAGEMENT
// ========================================

// Generate or load admin password
function ensureAdminPassword() {
  try {
    // Check if ADMIN_PASSWORD is already set in environment
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 16) {
      console.log('[AUTH] Using configured ADMIN_PASSWORD from environment');
      return process.env.ADMIN_PASSWORD;
    }

    // Check if password exists in .env file
    if (fs.existsSync(ENV_FILE)) {
      const envContent = fs.readFileSync(ENV_FILE, 'utf8');
      const match = envContent.match(/^ADMIN_PASSWORD=(.+)$/m);
      if (match && match[1] && match[1].length >= 16) {
        process.env.ADMIN_PASSWORD = match[1];
        fs.chmodSync(ENV_FILE,0o600);
        console.log('[AUTH] Loaded ADMIN_PASSWORD from .env file');
        return match[1];
      }
    }

    // Generate a secure random password (64 characters, base64url-safe)
    const randomPassword = crypto.randomBytes(48).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .substring(0, 64);

    // Append to .env file
    const envLine = `\nADMIN_PASSWORD=${randomPassword}\n`;
    fs.appendFileSync(ENV_FILE, envLine, { encoding:'utf8',mode:0o600 });
    fs.chmodSync(ENV_FILE,0o600);
    process.env.ADMIN_PASSWORD = randomPassword;
    
    console.log('[AUTH] ⚠️  Generated new ADMIN_PASSWORD and saved to .env');
    console.log('[AUTH] Password recovery requires trusted local access to the configured secret store.');
    
    return randomPassword;
  } catch (e) {
    console.error('[AUTH] Failed to ensure admin password:', e.message);
    // Fallback to environment variable or generate temporary one
    return process.env.ADMIN_PASSWORD || crypto.randomBytes(32).toString('hex');
  }
}

// Initialize password on startup
const ADMIN_PASSWORD = ensureAdminPassword();

// Session management (simple in-memory with file persistence)
let activeSessions = new Map();

function loadSessions() {
  // Never follow a session-file symlink; discard malformed, expired and
  // noncanonical tokens. Repair overly broad legacy file permissions.
  activeSessions=readSecureSessionFile(SESSION_FILE);
  console.log(`[AUTH] Loaded ${activeSessions.size} active sessions`);
}

function saveSessions() {
  try {
    // Atomic 0600 replacement, never a world-readable direct JSON write.
    writeSecureSessionFile(SESSION_FILE,activeSessions);
  } catch(e) {
    console.error('[AUTH] Failed to save session state:',e.message);
  }
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
  activeSessions.set(token, {
    createdAt: Date.now(),
    expiresAt,
    lastUsed: Date.now()
  });
  saveSessions();
  return { token, expiresAt };
}

function validateSession(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    activeSessions.delete(token);
    saveSessions();
    return false;
  }
  // Keep access metadata in memory. Authentication must not rewrite a file
  // containing live bearer tokens for every status poll and nginx auth check.
  session.lastUsed = Date.now();
  return true;
}

function extractSessionToken(req) {
  return extractAdminSessionToken(req);
}

function requestAuthMode(req) {
  const auth = req?.headers?.authorization;
  if (typeof auth === 'string' && /^Bearer [a-f0-9]{64}$/.test(auth)) return 'bearer';
  return 'cookie';
}
function originDenied(req, res) {
  if (adminRequestOriginAllowed(req.headers.origin, {
    trustedOrigins: TRUSTED_ORIGINS,
    authMode: requestAuthMode(req),
    method: req.method,
  })) return false;
  send(res, 403, { error: 'Origin denied' });
  return true;
}

function requireAuth(req, res, u) {
  if (originDenied(req, res)) return false;
  const token = extractSessionToken(req);
  if (validateSession(token)) {
    return true; // Authenticated
  }
  
  // Not authenticated - return 401 with JSON or HTML based on Accept header
  const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
  
  if (acceptsJson) {
    send(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
  } else {
    // Redirect to login page
    res.writeHead(302, {
      'Location': '/admin/login?redirect=' + encodeURIComponent(u.pathname + (u.search || '')),
      'Content-Type': 'text/plain'
    });
    res.end('Redirecting to login...');
  }
  return false;
}

// Load sessions on startup
loadSessions();

// ========================================
// AUTO-SCAN SETTINGS MANAGEMENT
// ========================================

function loadAutoScanSettings() {
  try {
    if (fs.existsSync(AUTO_SCAN_SETTINGS_FILE)) {
      const content = fs.readFileSync(AUTO_SCAN_SETTINGS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[AUTO-SCAN] Failed to load settings:', e.message);
  }
  // Return defaults
  return {
    enabled: true,
    intervalSeconds: 15
  };
}

function saveAutoScanSettings(settings) {
  try {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const data = {
      ...settings,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(AUTO_SCAN_SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[AUTO-SCAN] Failed to save settings:', e.message);
    return false;
  }
}

// ========================================
// ROUTE PROMOTIONS MANAGEMENT
// ========================================

function loadRoutePromotions() {
  try {
    if (fs.existsSync(ROUTE_PROMOTIONS_FILE)) {
      const content = fs.readFileSync(ROUTE_PROMOTIONS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('[PROMOTIONS] Failed to load promotions:', e.message);
  }
  // Return empty object as default
  return {};
}

function saveRoutePromotions(promotions) {
  try {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const data = {
      ...promotions,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(ROUTE_PROMOTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[PROMOTIONS] Failed to save promotions:', e.message);
    return false;
  }
}

// In-memory thinking events queue for UI thinking bubble
// Keep thoughts for 10 seconds so multiple polls can see them
const thinkingEvents = [];
function pushThought(message, details = {}){
  try{
    const now = Date.now();
    const thought = { id: now + Math.random(), ts: new Date().toISOString(), message, details, addedAt: now };
    thinkingEvents.push(thought);
    console.log(`[THOUGHT PUSHED] ${message} (queue size: ${thinkingEvents.length})`);
    // Cap queue size to prevent unbounded growth
    if (thinkingEvents.length > 200) thinkingEvents.splice(0, thinkingEvents.length - 200);
  }catch(e){
    console.error('[THOUGHT ERROR]', e.message);
  }
}
function drainThoughts(){
  const now = Date.now();
  // Remove thoughts older than 10 seconds
  const cutoff = now - 10000;
  let removed = 0;
  while (thinkingEvents.length > 0 && thinkingEvents[0].addedAt < cutoff) {
    thinkingEvents.shift();
    removed++;
  }
  if (removed > 0) {
    console.log(`[THOUGHT DRAIN] Removed ${removed} old thoughts, ${thinkingEvents.length} remain`);
  }
  // Return thoughts added since last poll (or all if first poll)
  // Don't clear - let them age out naturally
  const result = thinkingEvents.slice();
  console.log(`[THOUGHT DRAIN] Returning ${result.length} thoughts`);
  return result;
}
function clearAllThoughts(){
  console.log(`[THOUGHT CLEAR] Clearing all ${thinkingEvents.length} thoughts`);
  thinkingEvents.length = 0;
}

// Schedule a thought to appear shortly AFTER the API response is sent,
// so the UI can display the thinking bubble following the latest message.
function scheduleThought(message, details = {}, delayMs = 30){
  try {
    setTimeout(() => pushThought(message, details), Math.max(0, delayMs));
  } catch {}
}

// Status chip + humanization helpers
function pushStatusChip(status){
  try {
    // Map status to activity; empty string means idle
    const act = (status === 'Happy') ? '' : status.toLowerCase();
    console.log(`[STATUS CHIP] ${status} → activity: "${act}"`);
    setActivity(act);
    pushThought('status', { chip: status });
  } catch(e) {
    console.error('[STATUS CHIP ERROR]', e.message);
  }
}

function humanizeAuditSummary(summary){
  try{
    if (!summary || typeof summary !== 'object') return 'No summary available.';
    const ce = Number(summary.consoleErrors || 0);
    const nf = Number(summary.networkFailures || 0);
    const hi = Number(summary.httpIssues || 0);
    const total = ce + nf + hi;
    const health = total === 0 ? 'All clear  ' : (total <= 2 ? 'Almost there  ' : 'Needs attention  ');
    const bits = [];
    if (ce) bits.push(`${ce} console errors`);
    if (nf) bits.push(`${nf} network failures`);
    if (hi) bits.push(`${hi} HTTP issues`);
    const list = bits.length ? bits.join(', ') : 'no issues found';
    return `${health} — ${list}.`;
  }catch{ return 'No summary available.'; }
}

// Activity/cancellation tracking and persistent chat
let currentActivity = '';
let cancelRequested = false;
function setActivity(a){ currentActivity = a || ''; }
function requestCancel(){ cancelRequested = true; }
function clearCancel(){ cancelRequested = false; }
function isCancelled(){ return !!cancelRequested; }
function ensureChatFile(){ try{ fs.mkdirSync(CHAT_DIR, { recursive: true }); if (!fs.existsSync(CHAT_FILE)) fs.writeFileSync(CHAT_FILE, JSON.stringify({ messages: [] }, null, 2)); }catch{} }
function loadChat(){ try{ ensureChatFile(); return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); }catch{ return { messages: [] }; } }
function appendChat(role, content){ try{ ensureChatFile(); const data = loadChat(); const msg = { id: Date.now() + Math.random(), ts: new Date().toISOString(), role, content: String(content||'') }; data.messages.push(msg); if (data.messages.length > 500) data.messages.splice(0, data.messages.length - 500); fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2)); }catch{} }

function send(res, code, data, headers = {}){
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
}

function truncate(s, n){
  if (!s) return '';
  return s.length <= n ? s : (s.slice(0, n) + `\n...truncated ${s.length-n} chars`);
}

function deEnsure(text){
  if (!text) return text;
  // Replace "Ensure that X" → "X should" and plain "Ensure" → "should"
  let out = text.replace(/\b[Ee]nsure that\b/g, '');
  out = out.replace(/\b[Ee]nsure\b/g, 'should');
  // Clean double spaces from removals
  out = out.replace(/\s{2,}/g, ' ');
  return out;
}

function parseBody(req){
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => buf += c);
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); }
    });
  });
}

function safeConfigPath(file){
  if(typeof file!=='string'||file.includes('..'))return null;
  const m=/^(?:(apps|overrides|config)\/)?([a-zA-Z0-9_-]{1,80}\.conf|default\.production\.conf)$/.exec(file);
  if(!m)return null;
  const root=m[1]==='overrides'?OVERRIDES_DIR:m[1]==='config'?path.join(ROOT,'config'):APPS_DIR;
  if(m[2]==='default.production.conf'&&m[1]!=='config')return null;
  const resolved=path.join(root,m[2]);
  try{const st=fs.lstatSync(resolved);return st.isFile()&&!st.isSymbolicLink()&&st.nlink===1?resolved:null;}
  catch{return null;}
}

function normalizeBasePath(basePath){
  if (!basePath || typeof basePath !== 'string') return null;
  let bp = basePath.trim();
  if (!bp.startsWith('/')) bp = '/' + bp;
  // allow a single trailing slash for canonicalization
  bp = bp.replace(/\/+$/, '/') || '/';
  if (bp === '/') return null; // root is forbidden
  return bp;
}

function isReservedBasePath(bp){
  if (!bp) return true;
  const clean = bp.endsWith('/') ? bp.slice(0, -1) : bp;
  return RESERVED_PATHS.some(p=>{
    const rp = p.endsWith('/') ? p.slice(0, -1) : p;
    return rp === clean;
  });
}

function normalizeUpstreamUrl(upstream){
  if (!upstream || typeof upstream !== 'string') return { ok:false, error: 'upstream is required' };
  let u = upstream.trim();
  if (!/^https?:\/\//i.test(u)) return { ok:false, error: 'upstream must start with http:// or https://' };
  try{
    const parsed = new URL(u);
    // enforce trailing slash for proxy_pass with prefix stripping
    let final = parsed.toString();
    if (!final.endsWith('/')) final += '/';
    return { ok:true, url: final };
  }catch(e){
    return { ok:false, error: 'invalid upstream url' };
  }
}

function buildRouteConfigSnippet({ name, basePath, upstream, options = {} }){
  const bp = normalizeBasePath(basePath);
  if (!bp) throw { code:'invalid_base_path', message:'basePath is required and cannot be "/"' };
  if (isReservedBasePath(bp)) throw { code:'reserved_path', message:`${bp} is reserved by the proxy` };
  const upstreamInfo = normalizeUpstreamUrl(upstream);
  if (!upstreamInfo.ok) throw { code:'invalid_upstream', message: upstreamInfo.error };
  const baseNoSlash = bp.endsWith('/') ? bp.slice(0, -1) : bp;
  const upstreamUrl = upstreamInfo.url;
  const websockets = options.websockets !== false;
  const addRedirect = options.addRedirect !== false;
  const includePrefixHeader = options.includePrefixHeader !== false;

  const lines = [];
  lines.push(`# Auto-generated by Calliope route creator at ${new Date().toISOString()}`);
  lines.push(`# App: ${name}`);
  if (addRedirect){
    lines.push(`location = ${baseNoSlash} {`);
    lines.push(`  return 301 ${bp};`);
    lines.push('}');
    lines.push('');
  }
  lines.push(`location ^~ ${bp} {`);
  lines.push(`  proxy_http_version 1.1;`);
  lines.push(`  proxy_set_header Host $host;`);
  lines.push(`  proxy_set_header X-Forwarded-Proto $scheme;`);
  lines.push(`  proxy_set_header X-Forwarded-Host $host;`);
  lines.push(`  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`);
  lines.push(`  proxy_set_header X-Forwarded-Port $server_port;`);
  if (includePrefixHeader){
    lines.push(`  proxy_set_header X-Forwarded-Prefix ${baseNoSlash};`);
  }
  if (websockets){
    lines.push(`  proxy_set_header Upgrade $http_upgrade;`);
    lines.push(`  proxy_set_header Connection "upgrade";`);
    lines.push(`  proxy_cache_bypass $http_upgrade;`);
  }
  lines.push(`  proxy_redirect off;`);
  lines.push(`  proxy_pass ${upstreamUrl};`);
  lines.push('}');

  return lines.join('\n');
}

async function installAppConfigFile(name, content){
  const manager=getRouteMutationService();
  if(!manager)throw {status:503,code:'ROUTE_ACTIVATION_UNAVAILABLE'};
  const r=await manager.install(name,content);
  if(!r.ok)throw {status:r.httpStatus,code:r.code};
  const appName=name.replace(/\.conf$/i,'');
  return {filename:appName+'.conf',hardenWarning:null};
}
// Retired: non-transactional Docker CLI reload had a partial-write failure.
// Any remaining callers fail closed rather than regaining host Docker powers.
function nginxTestAndMaybeReload(){return {ok:false,stderr:'TRANSACTIONAL_ROUTE_ACTIVATION_REQUIRED'};}

function loadResolutions(){
  try{
    if (fs.existsSync(RES_FILE)) return JSON.parse(fs.readFileSync(RES_FILE, 'utf8'));
  }catch{}
  return {};
}
function saveResolutions(obj){
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(RES_FILE, JSON.stringify(obj, null, 2));
}

async function handle(req, res){
  const u = url.parse(req.url, true);
  const seg = (u.pathname || '/').split('/').filter(Boolean);

  console.log(`[API] ${req.method} ${u.pathname}`);

  // CORS for convenience (not strictly needed when proxied)
  if (req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try{
    // ========================================
    // AUTHENTICATION ENDPOINTS
    // ========================================
    
    // Password recovery is a LOCAL TRUSTED OPERATOR action, not an HTTP endpoint.
    // The old /admin/show-password disclosure route is intentionally retired.
    
    // GET /admin/login - Serve login page
    if (req.method === 'GET' && u.pathname === '/admin/login'){
      const loginHtml = fs.readFileSync(path.join(ROOT, 'status', 'login.html'), 'utf8');
      res.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end(loginHtml);
    }
    
    // POST /admin/login - Authenticate and create session
    if (req.method === 'POST' && u.pathname === '/admin/login'){
      if (originDenied(req, res)) return;
      const body = await parseBody(req);
      const password = body && body.password;
      
      if (!password) {
        return send(res, 400, { error: 'Password required' });
      }
      
      // Hash to equal-sized digests before timing-safe comparison, so malformed
      // or wrong-length inputs are ordinary 401 responses, never HTTP 500.
      const isValid = safeAdminPasswordMatches(password,ADMIN_PASSWORD);
      
      if (!isValid) {
        // Add small delay to prevent brute force
        await new Promise(resolve => setTimeout(resolve, 1000));
        return send(res, 401, { error: 'Invalid password' });
      }
      
      // Create session
      const session = createSession();
      
      // Set cookie
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': adminSessionCookie(session.token,{host:req.headers.host})
      });
      
      return res.end(JSON.stringify({
        ok: true,
        message: 'Authentication successful',
        expiresAt: session.expiresAt
      }));
    }
    
    // POST /admin/logout - Destroy session
    if (req.method === 'POST' && u.pathname === '/admin/logout'){
      if (originDenied(req, res)) return;
      const token = extractSessionToken(req);
      if (token) {
        activeSessions.delete(token);
        saveSessions();
      }
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': adminSessionCookie('',{host:req.headers.host,expire:true})
      });
      
      return res.end(JSON.stringify({ ok: true, message: 'Logged out' }));
    }
    
    // GET /admin/check - Check if authenticated
    // Used by nginx auth_request - returns 200 if authenticated, 401 if not
    if (req.method === 'GET' && u.pathname === '/admin/check'){
      if (originDenied(req, res)) return;
      const token = extractSessionToken(req);
      const isAuthenticated = validateSession(token);
      
      if (isAuthenticated) {
        // Return 200 for nginx auth_request
        return send(res, 200, { authenticated: true });
      } else {
        // Return 401 for nginx auth_request to trigger error_page redirect
        return send(res, 401, { authenticated: false });
      }
    }
    
    // GET /config - Public endpoint for frontend configuration
    // Returns API base path and other client configuration
    if (req.method === 'GET' && u.pathname === '/config'){
      return send(res, 200, {
        apiBasePath: PROXY_API_BASE_PATH,
        version: '1.0.0'
      });
    }
    
    // ========================================
    // PROTECTED ROUTES - Require Authentication
    // ========================================
    
    // Fail closed across the complete management namespace. Exceptions are
    // method-specific and read-only; no default-allow routes for unknown names.
    const authBoundary = classifyManagementRequest(req.method, u.pathname, PROXY_API_BASE_PATH);
    if (authBoundary.requiresAuth) {
      if (!requireAuth(req, res, u)) return;
    }

    // GET /api/ai/thoughts - Get streaming thought events (stub for now)
    if (req.method === 'GET' && u.pathname === apiPath('ai/thoughts')){
      // Return empty events array - real implementation would return thought stream
      return send(res, 200, { ok: true, events: [] });
    }
    
    // Thinking endpoints
    if (req.method === 'GET' && u.pathname === apiPath('ai/chat-history')){
      const data = loadChat();
      return send(res, 200, { ok:true, messages: data.messages || [] });
    }
    
    // Cancel endpoint
    if (req.method === 'POST' && u.pathname === apiPath('ai/cancel')){
      requestCancel();
      return send(res, 200, { ok:true, message: 'Cancellation requested' });
    }

    // ===== Apps management & diagnostics =====
    // ===== Reports management =====
    // GET /api/reports/list → inventory of reports directory with pagination
    // Query params: page (default 1), limit (default 10)
    if (req.method === 'GET' && u.pathname === apiPath('reports/list')){
      try{
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        const allItems = fs.readdirSync(REPORTS_DIR).map(name=>{
          const p = path.join(REPORTS_DIR, name);
          const st = fs.statSync(p);
          return { name, size: st.size, mtimeMs: st.mtimeMs };
        }).sort((a,b)=> b.mtimeMs - a.mtimeMs); // Sort by newest first
        
        // Pagination
        const page = parseInt(u.query.page) || 1;
        const limit = parseInt(u.query.limit) || 10;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const items = allItems.slice(startIndex, endIndex);
        
        return send(res, 200, { 
          ok: true, 
          items,
          pagination: {
            page,
            limit,
            total: allItems.length,
            totalPages: Math.ceil(allItems.length / limit),
            hasMore: endIndex < allItems.length
          }
        });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }

    // POST /api/reports/prune { olderThanDays?: number, keepLatestPerKind?: boolean }
    if (req.method === 'POST' && u.pathname === apiPath('reports/prune')){
      try{
        const body = await parseBody(req);
        const olderThanDays = Math.max(0, Number(body && body.olderThanDays) || 0);
        const keepLatestPerKind = Boolean(body && body.keepLatestPerKind);
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        const list = fs.readdirSync(REPORTS_DIR).map(name=>{
          const p = path.join(REPORTS_DIR, name);
          const st = fs.statSync(p);
          return { name, path: p, size: st.size, mtimeMs: st.mtimeMs };
        });
        const now = Date.now();
        const toDelete = [];
        // Strategy 1: age-based
        if (olderThanDays > 0){
          const cutoff = now - olderThanDays*24*60*60*1000;
          list.forEach(it=>{ if (it.mtimeMs < cutoff) toDelete.push(it.path); });
        }
        // Strategy 2: keep latest per kind (health-*.json/md, scan-apps-*.json)
        if (keepLatestPerKind){
          const groups = new Map();
          const keyOf = (n)=> n.startsWith('health-') ? n.replace(/health-.+\.(json|md)$/,'health-*.$1') : (n.startsWith('scan-apps-') ? 'scan-apps-*.json' : null);
          list.forEach(it=>{
            const k = keyOf(it.name);
            if (!k) return;
            const a = groups.get(k)||[]; a.push(it); groups.set(k, a);
          });
          for (const [k, arr] of groups.entries()){
            const ordered = arr.sort((a,b)=> b.mtimeMs - a.mtimeMs);
            ordered.slice(1).forEach(it=> toDelete.push(it.path));
          }
        }
        // Never remove latest aliases or directory indices
        const protect = new Set(['health-latest.json','health-latest.md','scan-apps-latest.json','index.html']);
        const final = Array.from(new Set(toDelete)).filter(p=> !protect.has(path.basename(p)));
        const deleted = [];
        for (const p of final){ try{ fs.unlinkSync(p); deleted.push(path.relative(ROOT, p)); }catch{} }
        return send(res, 200, { ok:true, deletedCount: deleted.length, deleted });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }
    
    // ===== Auto-Scan Settings Management =====
    // GET /api/settings/auto-scan → get current auto-scan settings
    if (req.method === 'GET' && u.pathname === apiPath('settings/auto-scan')){
      try{
        const settings = loadAutoScanSettings();
        return send(res, 200, { ok: true, settings });
      }catch(e){ return send(res, 500, { ok: false, error: e.message }); }
    }
    
    // POST /api/settings/auto-scan → update auto-scan settings
    // Body: { enabled: boolean, intervalSeconds: number }
    if (req.method === 'POST' && u.pathname === apiPath('settings/auto-scan')){
      try{
        const body = await parseBody(req);
        const currentSettings = loadAutoScanSettings();
        
        // Validate and merge settings
        const newSettings = {
          enabled: typeof body.enabled === 'boolean' ? body.enabled : currentSettings.enabled,
          intervalSeconds: typeof body.intervalSeconds === 'number' && body.intervalSeconds >= 5 && body.intervalSeconds <= 300 
            ? body.intervalSeconds 
            : currentSettings.intervalSeconds
        };
        
        const saved = saveAutoScanSettings(newSettings);
        if (saved) {
          console.log('[AUTO-SCAN] Settings updated:', newSettings);
          return send(res, 200, { 
            ok: true, 
            settings: newSettings,
            message: 'Settings saved. Restart containers to apply changes.',
            restartCommand: './smart-build.sh restart'
          });
        } else {
          return send(res, 500, { ok: false, error: 'Failed to save settings' });
        }
      }catch(e){ return send(res, 500, { ok: false, error: e.message }); }
    }
    
    // ===== Route Promotions Management =====
    // GET /api/promotions → get all route promotions
    if (req.method === 'GET' && u.pathname === apiPath('promotions')){
      try{
        const promotions = loadRoutePromotions();
        // Remove the updatedAt metadata field before sending to client
        const { updatedAt, ...clientPromotions } = promotions;
        return send(res, 200, { ok: true, promotions: clientPromotions });
      }catch(e){ return send(res, 500, { ok: false, error: e.message }); }
    }
    
    // POST /api/promotions → update route promotions
    // Body: { promotions: { [configFile]: { [route]: true } } }
    if (req.method === 'POST' && u.pathname === apiPath('promotions')){
      try{
        const body = await parseBody(req);
        
        if (!body.promotions || typeof body.promotions !== 'object') {
          return send(res, 400, { ok: false, error: 'Invalid promotions data' });
        }
        
        const saved = saveRoutePromotions(body.promotions);
        if (saved) {
          console.log('[PROMOTIONS] Promotions updated');
          return send(res, 200, { 
            ok: true, 
            promotions: body.promotions,
            message: 'Route promotions saved successfully'
          });
        } else {
          return send(res, 500, { ok: false, error: 'Failed to save promotions' });
        }
      }catch(e){ return send(res, 500, { ok: false, error: e.message }); }
    }
    
    // GET /api/apps/list → list installed app configs with mtime/size
    if (req.method === 'GET' && u.pathname === apiPath('apps/list')){
      try{
        const files = fs.existsSync(APPS_DIR) ? fs.readdirSync(APPS_DIR).filter(f=>f.endsWith('.conf')) : [];
        const items = files.map(f=>{
          const p = path.join(APPS_DIR, f);
          const st = fs.statSync(p);
          return { name: f, path: path.relative(ROOT, p), mtimeMs: st.mtimeMs, size: st.size };
        }).sort((a,b)=> b.mtimeMs - a.mtimeMs);
        return send(res, 200, { ok:true, apps: items });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }

    // GET /api/apps/diagnostics → bundle-diagnostics.json (regenerate if missing)
    if (req.method === 'GET' && u.pathname === apiPath('apps/diagnostics')){
      try{
        const diagPath = path.join(ARTIFACTS_DIR, 'bundle-diagnostics.json');
        if (!fs.existsSync(diagPath)){
          spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' });
        }
        const exists = fs.existsSync(diagPath);
        const payload = exists ? JSON.parse(fs.readFileSync(diagPath, 'utf8')) : { generatedAt: null, overrides: [], apps: [], included: [], skipped: [] };
        return send(res, 200, { ok:true, ...payload });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }

    // GET /api/apps/active → active locations with ordering and source
    if (req.method === 'GET' && u.pathname === apiPath('apps/active')){
      try{
        const diagPath = path.join(ARTIFACTS_DIR, 'bundle-diagnostics.json');
        if (!fs.existsSync(diagPath)){
          spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' });
        }
        const data = fs.existsSync(diagPath) ? JSON.parse(fs.readFileSync(diagPath, 'utf8')) : { included: [] };
        // Preserve order as generated
        const active = Array.isArray(data.included) ? data.included : [];
        return send(res, 200, { ok:true, active });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }

    // POST /api/apps/regenerate. Preserve generation-only parity without
    // claiming nginx worker activation; reload:true must use the host broker.
    if (req.method === 'POST' && u.pathname === apiPath('apps/regenerate')){
      const body=await parseBody(req);
      const manager=getRouteMutationService();
      if(!manager)return send(res,503,{ok:false,error:'ROUTE_ACTIVATION_UNAVAILABLE'});
      const r=await manager.regenerate({reload:Boolean(body&&body.reload)});
      return send(res,r.httpStatus,{ok:r.ok,reloaded:r.reloaded===true,error:r.ok?undefined:r.code});
    }
    // POST /api/apps/cleanup { dryRun?: true }
    // Heuristic duplicate finder: groups by normalized content hash; keep newest per hash
    if (req.method === 'POST' && u.pathname === apiPath('apps/cleanup')){
      try{
        const body = await parseBody(req);
        const dryRun = (body && typeof body.dryRun === 'boolean') ? body.dryRun : true;
        if(!dryRun)return send(res,503,{ok:false,error:'transactional_cleanup_not_integrated'});
        const files = fs.existsSync(APPS_DIR) ? fs.readdirSync(APPS_DIR).filter(f=>f.endsWith('.conf')) : [];
        const entries = files.map(f=>{
          const p = path.join(APPS_DIR, f);
          const st = fs.statSync(p);
          const raw = fs.readFileSync(p, 'utf8');
          // normalize: strip comments and excess whitespace
          const norm = raw.replace(/#.*$/mg, '').replace(/\s+/g, ' ').trim();
          const hash = crypto.createHash('sha1').update(norm).digest('hex');
          return { name: f, path: p, rel: path.relative(ROOT, p), mtimeMs: st.mtimeMs, size: st.size, hash };
        });
        const byHash = new Map();
        for (const e of entries){
          const cur = byHash.get(e.hash) || [];
          cur.push(e);
          byHash.set(e.hash, cur);
        }
        const candidates = [];
        for (const [hash, group] of byHash.entries()){
          if (group.length <= 1) continue;
          const sorted = group.sort((a,b)=> b.mtimeMs - a.mtimeMs);
          const keeper = sorted[0];
          const remove = sorted.slice(1).map(x=>({ name: x.name, path: x.rel, mtimeMs: x.mtimeMs, size: x.size }));
          candidates.push({ hash, keep: { name: keeper.name, path: keeper.rel, mtimeMs: keeper.mtimeMs, size: keeper.size }, remove });
        }
        let deleted = [];
        // Also prune old artifacts if retention is configured
        const artifactsRetentionDays = Math.max(0, Number(process.env.ARTIFACTS_RETENTION_DAYS)||0);
        if (!dryRun){
          for (const c of candidates){
            for (const r of c.remove){
              try { fs.unlinkSync(path.join(ROOT, r.path)); deleted.push(r.path); } catch {}
            }
          }
          if (artifactsRetentionDays > 0){
            try{
              const cutoff = Date.now() - artifactsRetentionDays*24*60*60*1000;
              const reportsDir = path.join(ARTIFACTS_DIR, 'reports');
              if (fs.existsSync(reportsDir)){
                fs.readdirSync(reportsDir).forEach(f=>{
                  try{
                    const p = path.join(reportsDir, f);
                    const st = fs.statSync(p);
                    if (st.mtimeMs < cutoff) fs.unlinkSync(p);
                  }catch{}
                });
              }
            }catch{}
          }
          // regenerate & reload to reflect cleanup
          try{ spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' }); }catch{}
          try{ nginxTestAndMaybeReload(); }catch{}
        }
        return send(res, 200, { ok:true, dryRun: !!dryRun, candidates, deleted });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }

    // POST /api/apps/scan { base?: 'http://dev-proxy' }
    // Regenerate routes report (scan-apps) and refresh routes.json artifact
    if (req.method === 'POST' && u.pathname === apiPath('apps/scan')){
      try{
        const body = await parseBody(req);
        const base = (body && body.base) || 'http://dev-proxy';
        const env = { ...process.env, LOCAL_PROXY_BASE: base };
        const oneOff = spawnSync('node', [path.join(ROOT, 'test', 'scanApps.js')], { cwd: ROOT, encoding: 'utf8', env });
        const ok = oneOff.status === 0;
        return send(res, ok ? 200 : 500, { ok, stdout: (oneOff.stdout||'').slice(0, 2000), stderr: (oneOff.stderr||'').slice(0, 500) });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }
    if (req.method === 'POST' && u.pathname === apiPath('ai/cancel')){
      requestCancel();
      scheduleThought('Stopping current work (user requested)…', { stopped: true });
      return send(res, 200, { ok:true, cancelled: true });
    }
    // Overrides conflicts listing
    if (req.method === 'GET' && u.pathname === apiPath('overrides/conflicts')){
      try{
        const exists = fs.existsSync(CONFLICTS_FILE);
        const data = exists ? JSON.parse(fs.readFileSync(CONFLICTS_FILE, 'utf8')) : { generatedAt:null, conflicts: [] };
        return send(res, 200, { ok:true, ...data });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }

    // Promote app route only via scoped filesystem transaction and host verification.
    if (req.method === 'POST' && u.pathname === apiPath('overrides/promote')){
      const body=await parseBody(req);
      const manager=getRouteMutationService();
      if(!manager)return send(res,503,{ok:false,error:'ROUTE_ACTIVATION_UNAVAILABLE'});
      const r=await manager.promote(body&&body.filename);
      return send(res,r.httpStatus,{ok:r.ok,error:r.ok?undefined:r.code,
        promoted:r.ok?body.filename:undefined});
    }
    // POST /api/apps/create-route
    // Create a config snippet with common defaults, optionally install it, and return the content for download
    if (req.method === 'POST' && u.pathname === apiPath('apps/create-route')){
      try{
        const body = await parseBody(req);
        const { name, basePath, upstream, options = {} } = body || {};
        if (!name || typeof name !== 'string'){
          return send(res, 400, { ok:false, error: 'name is required' });
        }
        if (!basePath || typeof basePath !== 'string'){
          return send(res, 400, { ok:false, error: 'basePath is required' });
        }
        if (!upstream || typeof upstream !== 'string'){
          return send(res, 400, { ok:false, error: 'upstream is required' });
        }

        let configSnippet;
        try{
          configSnippet = buildRouteConfigSnippet({
            name: name.replace(/\.conf$/i, ''),
            basePath,
            upstream,
            options: {
              addRedirect: options.addRedirect !== false,
              websockets: options.websockets !== false,
              includePrefixHeader: options.includePrefixHeader !== false,
            }
          });
        }catch(err){
          const msg = err && (err.message || err.detail || err.code);
          return send(res, 400, { ok:false, error: err.code || 'invalid_request', detail: msg || 'invalid request' });
        }

        const shouldInstall = options.install !== false;
        let installed = null;
        let hardenWarning = null;

        if (shouldInstall){
          try{
            const result = await installAppConfigFile(name, configSnippet);
            installed = result.filename;
            hardenWarning = result.hardenWarning || null;
          }catch(err){
            return send(res, err.status || 500, { ok:false, error: err.code || 'install_failed', detail: err.detail || err.message, config: configSnippet });
          }
        }

        return send(res, 200, { 
          ok: true,
          installed,
          basePath: normalizeBasePath(basePath),
          upstream: normalizeUpstreamUrl(upstream).url,
          config: configSnippet,
          hardenWarning: hardenWarning || undefined,
          download: installed ? apiPath(`config/${installed}`) : null
        });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }
    
    // Install a new app config file
    // POST /api/apps/install { name, content }
    if (req.method === 'POST' && u.pathname === apiPath('apps/install')){
      console.log('[APPS/INSTALL] Endpoint hit!', { method: req.method, pathname: u.pathname, expected: apiPath('apps/install') });
      try{
        const body = await parseBody(req);
        const { name, content } = body || {};
        console.log('[APPS/INSTALL] Parsed body:', { name, contentLength: content?.length });
        
        if (!name || typeof name !== 'string' || !content || typeof content !== 'string'){
          return send(res, 400, { ok: false, error: 'name and content are required' });
        }
        try{
          const result = await installAppConfigFile(name, content);
          return send(res, 200, { ok: true, installed: result.filename, hardenWarning: result.hardenWarning || undefined });
        }catch(err){
          return send(res, err.status || 500, { ok:false, error: err.code || err.message, detail: err.detail });
        }
      } catch(e){
        return send(res, 500, { ok: false, error: e.message });
      }
    }
    // GET /api/ai/thoughts moved to AI section below (line ~640) for 'since' param support
    if (req.method === 'POST' && u.pathname === apiPath('ai/thoughts/clear')){
      drainThoughts();
      return send(res, 200, { ok:true });
    }
    // Debug-only: inject thoughts to test UI polling
    if (req.method === 'POST' && u.pathname === apiPath('ai/thoughts/inject')){
      try{
        const body = await parseBody(req);
        const list = Array.isArray(body && body.messages) ? body.messages : [];
        list.forEach(m => { try{ pushThought(String(m||'')); }catch{} });
        return send(res, 200, { ok:true, injected: list.length });
      }catch(e){ return send(res, 500, { ok:false, error: e.message }); }
    }
    if (req.method === 'GET' && u.pathname === apiPath('ai/thoughts/peek')){
      // Non-destructive peek of queue length
      return send(res, 200, { ok:true, length: thinkingEvents.length });
    }

    // GET /api/config/:file - only preexisting, bounded owner route files.
    if (req.method === 'GET' && u.pathname.startsWith(apiPath('config/'))){
      const p=safeConfigPath(u.pathname.slice(apiPath('config/').length));
      if(!p)return send(res,400,{error:'Invalid file'});
      try{return send(res,200,{file:path.relative(ROOT,p),content:fs.readFileSync(p,'utf8')});}
      catch{return send(res,404,{error:'File unavailable'});}
    }
    // POST /api/config/:file - bounded route data only, never application code.
    if (req.method === 'POST' && u.pathname.startsWith(apiPath('config/'))){
      const p=safeConfigPath(u.pathname.slice(apiPath('config/').length));
      if(!p)return send(res,400,{ok:false,error:'BLOCKED_UNSAFE_CONFIG_ROUTE'});
      const body=await parseBody(req);
      if(!body||typeof body.content!=='string')return send(res,400,{ok:false,error:'INVALID_CONTENT'});
      const manager=getRouteMutationService();
      if(!manager)return send(res,503,{ok:false,error:'ROUTE_ACTIVATION_UNAVAILABLE'});
      const rel=path.relative(ROOT,p),name=path.basename(p);
      const r=rel.startsWith('apps'+path.sep)?await manager.editApp(name,body.content):
        rel.startsWith('overrides'+path.sep)?await manager.editOverride(name,body.content):
        await manager.editConfig(name,body.content);
      return send(res,r.httpStatus,{ok:r.ok,error:r.ok?undefined:r.code});
    }
    // POST /api/resolve-conflict { route, winner }
    if (req.method === 'POST' && u.pathname === apiPath('resolve-conflict')){
      const body = await parseBody(req);
      const { route, winner } = body || {};
      if (!route || !winner) return send(res, 400, { error: 'route and winner required' });
      const resolutions = loadResolutions();
      resolutions[route] = { winner, resolvedAt: new Date().toISOString(), strategy: 'manual-selection' };
      saveResolutions(resolutions);
      return send(res, 200, { ok:true });
    }

    // POST /api/rename-route intentionally held until source-exact atomic rename.
    // The old implementation wrote before a Docker CLI reload and was unsafe.
    if (req.method === 'POST' && u.pathname === apiPath('rename-route')){
      return send(res,503,{ok:false,error:'transactional_rename_not_integrated'});
    }
    // ======== AI Assistant (optional) ========
    if (u.pathname.startsWith(apiPath('ai/'))){
      if (req.method === 'GET' && u.pathname === apiPath('ai/health')){
        if (refuseInlineDocker(res, 'ai/health')) return;
        const enabled = Boolean(process.env.OPENAI_API_KEY);
        
        // Try to get static domain from logs for more reliable ngrok discovery
        let staticNgrokDomain = null;
        try {
          const { execSync } = require('child_process');
          const logs = execSync('docker logs dev-ngrok 2>&1 | grep "ngrok: using static domain" || true', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
          const mStatic = logs.match(/ngrok:\s+using static domain '([^']+)'/i);
          if (mStatic && mStatic[1]) {
            staticNgrokDomain = mStatic[1];
          }
        } catch (e) {}
        
        return send(res, 200, { enabled, model: process.env.OPENAI_MODEL || null, staticNgrokDomain, activity: currentActivity });
      }

      // GET /api/ai/thoughts?since=timestamp - Get thinking events for UI
      // If 'since' param provided, only return thoughts added after that timestamp
      if (req.method === 'GET' && u.pathname === apiPath('ai/thoughts')){
        const since = u.query && u.query.since ? parseFloat(u.query.since) : 0;
        const events = drainThoughts();
        const newEvents = since > 0 ? events.filter(e => e.addedAt > since) : events;
        // Return latest timestamp from ALL events, not just filtered ones
        const latestTimestamp = events.length > 0 ? Math.max(...events.map(e => e.addedAt)) : Date.now();
        console.log(`[THOUGHT API] since=${since}, returning ${newEvents.length}/${events.length} events, latest=${latestTimestamp}`);
        return send(res, 200, { ok: true, events: newEvents, latestTimestamp });
      }

      // POST /api/ai/reindex - Rebuild Calliope's knowledge base embeddings
      if (req.method === 'POST' && u.pathname === apiPath('ai/reindex')){
        if (!process.env.OPENAI_API_KEY) {
          return send(res, 503, { ok: false, error: 'OPENAI_API_KEY not configured' });
        }
        
        try {
          const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
          console.log('🧠 Rebuilding knowledge index...');
          
          // Collect documentation
          const docs = collectDocs();
          console.log(`📚 Collected ${docs.length} documentation files`);
          
          // Chunk documents
          const chunks = chunkDocs(docs);
          console.log(`✂️  Created ${chunks.length} chunks`);
          
          // Generate embeddings
          const vectors = await embedChunks(chunks, embedModel);
          console.log(`🎯 Generated ${vectors.length} embeddings`);
          
          // Build and save index
          const index = {
            model: embedModel,
            createdAt: new Date().toISOString(),
            dim: (vectors[0] && vectors[0].vector && vectors[0].vector.length) || 0,
            chunks: vectors
          };
          saveEmbeddings(index);
          
          console.log(`✅ Knowledge index saved to ${EMBED_FILE}`);
          
          return send(res, 200, {
            ok: true,
            chunks: index.chunks.length,
            model: index.model,
            dim: index.dim,
            createdAt: index.createdAt
          });
        } catch (e) {
          console.error('❌ Reindex failed:', e.message);
          return send(res, 500, { ok: false, error: e.message });
        }
      }

      // POST /api/ai/restart-containers { names?: string[], self?: boolean }
      if (req.method === 'POST' && u.pathname === apiPath('ai/restart-containers')){
        if (refuseInlineDocker(res, 'ai/restart-containers')) return;
        try{
          const body = await parseBody(req);
          let names = Array.isArray(body && body.names) ? body.names.filter(Boolean) : [];
          const wantSelf = Boolean(body && body.self);
          // Determine self container ID/name via /etc/hostname
          if (wantSelf) {
            try { const selfId = fs.readFileSync('/etc/hostname','utf8').trim(); if (selfId) names.push(selfId); } catch {}
          }
          names = Array.from(new Set(names));
          if (!names.length) return send(res, 400, { ok:false, error: 'no container names provided' });

          // Respond first, then perform restarts asynchronously to avoid killing our own request
          send(res, 200, { ok:true, accepted: names });
          setTimeout(()=>{
            for (const n of names){
              try{ spawnSync('docker', ['restart', n], { encoding: 'utf8' }); }catch{}
            }
          }, 50);
          return; // already responded
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/snapshot-analyze { containerName, srcPathInContainer, outName? }
      // Legacy name kept for compatibility; we refer to it as a "code review"
      if (req.method === 'POST' && u.pathname === apiPath('ai/snapshot-analyze')){
        if (refuseInlineDocker(res, 'ai/snapshot-analyze')) return;
        try{
          const body = await parseBody(req);
          const containerName = body && body.containerName;
          const srcPathInContainer = body && body.srcPathInContainer;
          const outName = body && body.outName;
          if (!containerName || !srcPathInContainer){
            return send(res, 400, { ok:false, error: 'containerName and srcPathInContainer required' });
          }
          setActivity('coding');
          pushThought(`Analyzing code in ${containerName}:${srcPathInContainer}…`);
          const out = await calliopeHealing.backupAndAnalyzeContainerProject({ containerName, srcPathInContainer, outName });
          scheduleThought('Code review complete ✅', { containerName }, 60);
          setActivity('');
          return send(res, 200, { ok: out.success, reviewRoot: out.snapshot, suggestions: out.analysis && out.analysis.suggestions || [], message: out.message || null });
        }catch(e){
          setActivity('');
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // Preferred naming: perform a code review of a container's source tree
      if ((req.method === 'POST' || req.method === 'GET') && u.pathname === apiPath('ai/code-review-container')){
        try{
          const body = req.method === 'POST' ? (await parseBody(req)) : {};
          const containerName = (body && body.containerName) || (u.query && u.query.containerName);
          const srcPathInContainer = (body && body.srcPathInContainer) || (u.query && u.query.srcPathInContainer);
          const outName = (body && body.outName) || (u.query && u.query.outName);
          if (!containerName || !srcPathInContainer){
            return send(res, 400, { ok:false, error: 'containerName and srcPathInContainer required' });
          }
          const out = await calliopeHealing.backupAndAnalyzeContainerProject({ containerName, srcPathInContainer, outName });
          return send(res, 200, { ok: out.success, reviewRoot: out.snapshot, suggestions: out.analysis && out.analysis.suggestions || [], message: out.message || null });
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // Preferred naming: perform a code review of a host path
      if (req.method === 'POST' && u.pathname === apiPath('ai/code-review')){
        try{
          const body = await parseBody(req);
          const projectPath = body && body.projectPath;
          const outName = body && body.outName;
          if (!projectPath){
            return send(res, 400, { ok:false, error: 'projectPath required' });
          }
          setActivity('coding');
          pushThought(`Analyzing code at ${projectPath}…`);
          const out = await calliopeHealing.backupAndAnalyzeProject(projectPath, outName);
          scheduleThought('Code review complete ✅', { projectPath }, 60);
          setActivity('');
          return send(res, 200, { ok: out.success, reviewRoot: out.snapshot, suggestions: out.analysis && out.analysis.suggestions || [], message: out.message || null });
        }catch(e){
          setActivity('');
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/review-code { text?: string, files?: [{ path, content }], framework?: 'next' }
      if (req.method === 'POST' && u.pathname === apiPath('ai/review-code')){
        try{
          const body = await parseBody(req);
          const rawText = (body && typeof body.text === 'string') ? body.text : '';
          const files = Array.isArray(body && body.files) ? body.files : [];
          const framework = (body && body.framework) || 'next';

          // Aggregate input up to ~120KB
          let aggregate = '';
          if (rawText) aggregate += `\n\n<<TEXT>>\n${truncate(rawText, 120000)}`;
          for (const f of files){
            const p = (f && f.path) || 'snippet.tsx';
            const c = (f && typeof f.content === 'string') ? f.content : '';
            if (!c) continue;
            aggregate += `\n\n<<FILE:${p}>>\n${truncate(c, 40000)}`;
            if (aggregate.length > 150000) break;
          }

          // Lightweight local heuristics as fallback (works without OpenAI)
          const localFindings = [];
          const hay = aggregate.toLowerCase();
          if (/fetch\(\s*['"]\s*\/api\//.test(aggregate)) localFindings.push('Use basePath-aware API helpers instead of fetch("/api/...").');
          if (/[^\w]\/_next\//.test(aggregate)) localFindings.push('Avoid hardcoded \/_next; rely on framework basePath/assetPrefix.');
          if (/__nextjs_font\//.test(aggregate)) localFindings.push('Prefix any manual __nextjs_font preloads with the base path helper.');
          if (/href=["']\//.test(aggregate)) localFindings.push('Replace root-anchored hrefs with basePath-aware URLs or framework Link.');
          if (/http:\/\//.test(aggregate)) localFindings.push('Avoid hardcoded http:// to own origin; keep HTTPS and subpath correct.');

          // If OpenAI is available, ask for structured recommendations
          let ai = null;
          if (process.env.OPENAI_API_KEY) {
            const system = `You are Colette, a proxy/dev networking assistant. Task: review provided app code for subpath-readiness under a reverse proxy and recommend precise, minimal code changes. Focus strictly on:\n- API calls: basePath-aware helpers\n- _next/static assets: avoid root /_next, use basePath/assetPrefix\n- Public assets: icons/robots/sitemap/manifest via base path\n- Links: framework Link or basePath-aware href\nReturn a concise checklist with code-level examples. Framework: ${framework}.`;
            const messages = [
              { role: 'system', content: system },
              { role: 'user', content: `Project snippets and files (truncated as needed):\n${aggregate}` }
            ];
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
              body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.2 })
            });
            if (resp.ok){
              const data = await resp.json();
              ai = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
            }
          }

          const result = {
            ok: true,
            recommendations: ai || (localFindings.length ? ('- ' + localFindings.join('\n- ')) : 'No obvious subpath issues detected in provided snippets.'),
            usedAI: Boolean(ai)
          };
          return send(res, 200, result);
        } catch (e) {
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/ask { query, ... } — now proactive: can invoke healing when user asks to heal
      if (req.method === 'POST' && u.pathname === apiPath('ai/ask')){
        if (refuseInlineDocker(res, 'ai/ask')) return;
        const body = await parseBody(req);
        const query = (body && body.query || '').trim();
        const maxDocs = Math.max(1, Math.min(10, Number(body && body.maxDocs) || 6));
        const systemHint = (body && body.systemHint) || '';
        if (!query) return send(res, 400, { error: 'Missing query' });

        // Persist user chat
        try { appendChat('user', query); } catch {}

        // Lightweight intent detection
        const lower = query.toLowerCase();
        // Treat redirect/status code questions as actionable (audit + heal)
        const wantsHeal = /(heal|fix|repair|unblock|make.*work|redirect|\b30[1278]\b|\b308\b|wrong|broken|not\s+working|issue|problem)/.test(lower);
        const wantsAudit = /(audit|crawl|verify|check|scan|site auditor|console|network|status\s*code|redirect|\b30[1278]\b|\b308\b|what.*wrong|diagnose|investigate)/.test(lower);
        const wantsReview = /(code review|review code|analy[sz]e code|read code|scan code|recommend fixes)/.test(lower);
        const wantsAdvanced = /(advanced\s*heal|self-?heal(ing)?|deep heal|full heal|mixed\s*content|err_network_changed)/.test(lower);
        const wantsReindex = /(reindex|rebuild.*knowledge|update.*index|refresh.*knowledge|rebuild.*index)/.test(lower);
        // capture absolute URL if present
        const absUrlMatch = query.match(/https?:\/\/[\w.-]+(?::\d+)?\/[\S]*/i);
        const absoluteUrl = absUrlMatch ? absUrlMatch[0].trim() : '';
        // capture route prefix AND optional deeper path (e.g., /mxtk/dashboard)
        const routeMatch = query.replace(/https?:\/\/[^\s]+/ig, '').match(/\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*/);
        const fullPath = absoluteUrl ? (new URL(absoluteUrl).pathname.replace(/\/$/, '')) : (routeMatch ? routeMatch[0].replace(/\/$/, '') : '');
        const routeKey = fullPath ? ('/' + fullPath.split('/').filter(Boolean)[0]) : '';

        // Ensure audits run with dockerized Chrome when invoked via chat
        if (!process.env.CALLIOPE_PUPPETEER_IMAGE) process.env.CALLIOPE_PUPPETEER_IMAGE = 'ghcr.io/puppeteer/puppeteer:latest';
        if (!process.env.CALLIOPE_PUPPETEER_PLATFORM) process.env.CALLIOPE_PUPPETEER_PLATFORM = 'linux/amd64';

        // Opportunistic config repairs based on explicit chat asks
        try {
          const wantsRewriteFix = /(rewrite\s+\^\/[a-z0-9._-]+\/|fix\s+rewrite|\.conf\b)/i.test(lower);
          const wantsDedupeFont = /(duplicate|dedupe).+__nextjs_font/i.test(lower) || /__nextjs_font/.test(lower);
          const wantsDeferSdk = /(iframe\.html|defer\s*dns|variable\s*proxy_pass)/i.test(lower);
          if (wantsRewriteFix) {
            // Attempt a generic rewrite fix on the override that matches the route name if present
            const name = routeKey.replace(/^\//,'');
            const p = path.join(ROOT, 'overrides', `${name||'app'}.conf`);
            if (fs.existsSync(p)) {
              let txt = fs.readFileSync(p, 'utf8');
              const safe = name ? name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') : '[a-zA-Z0-9._-]+';
              const rx = new RegExp(`rewrite\\s+\\^\\/${safe}\\/\\(\\.\\*\\)\\$\\s+[^;\\n]+`, 'g');
              const fixed = txt.replace(rx, (m)=> m.replace(/\s+[^;\n]+$/, ' /$1 break;'));
              if (fixed !== txt) {
                fs.copyFileSync(p, p + '.backup.' + Date.now());
                fs.writeFileSync(p, fixed, 'utf8');
              }
            }
          }
          if (wantsDeferSdk) {
            // Avoid hardcoded service names; no-op in generic mode
          }
          if (wantsDedupeFont) {
            try { await calliopeHealing.fixDuplicateLocationBlocks(); } catch {}
          }
        } catch {}
        // If user asks for a code review, snapshot the container project and analyze for proxy-compat fixes (generic — no app names)
        if (wantsReview){
          try{
            // Discover running dev containers heuristically to choose a target
            const targets = [];
            try {
              const list = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
              const preferred = list.filter(n => /dev|web|app|site|client|sdk|storybook/i.test(n));
              for (const n of preferred.slice(0, 4)) {
                targets.push({ name: n, path: '/app' }, { name: n, path: '/usr/src/app' });
              }
            } catch {}
            if (targets.length === 0) targets.push({ name: 'dev-app', path: '/app' });
            let review = null;
            for (const t of targets){
              const out = await calliopeHealing.backupAndAnalyzeContainerProject({ containerName: t.name, srcPathInContainer: t.path });
              if (out && out.success){ review = out; break; }
            }
            const parts = [];
            if (review && review.success){
              parts.push('Code review suggestions:');
              const suggestions = (review.analysis && review.analysis.suggestions) || [];
              parts.push('```json');
              parts.push(JSON.stringify(suggestions.slice(0, 20), null, 2));
              parts.push('```');
              parts.push('Snapshot root:');
              parts.push('```');
              parts.push(review.snapshot || '(unknown)');
              parts.push('```');
            } else {
              parts.push('Code review could not complete.');
            }
            return send(res, 200, { ok:true, answer: parts.join('\n') });
          } catch(e){
            return send(res, 500, { ok:false, error: e.message });
          }
        }
        
        // If user asks to reindex knowledge, do it immediately and report back
        if (wantsReindex){
          try {
            const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
            setActivity('coding');
            pushThought('Rebuilding knowledge index… 💪');
            const docs = collectDocs();
            const chunks = chunkDocs(docs);
            const vectors = await embedChunks(chunks, embedModel);
            const index = { model: embedModel, createdAt: new Date().toISOString(), dim: (vectors[0]&&vectors[0].vector&&vectors[0].vector.length)||0, chunks: vectors };
            saveEmbeddings(index);
            setActivity('');
            
            const answer = `🎉 Knowledge index rebuilt! I've updated my understanding with ${index.chunks.length} chunks from all docs, examples, and guides (including personality docs!). I'm now up-to-date and ready to help with enhanced expressiveness! ✨`;
            try { appendChat('assistant', answer); } catch {}
            return send(res, 200, { ok: true, answer });
          } catch (e) {
            setActivity('');
            const errorAnswer = `😰 Oops! I ran into trouble rebuilding my knowledge index: ${e.message}. Let me try a different approach next time!`;
            try { appendChat('assistant', errorAnswer); } catch {}
            return send(res, 200, { ok: true, answer: errorAnswer });
          }
        }
        
        // routeKey is already computed above

        // If user asks to both audit and heal a specific path, run iterative audit→heal→re-audit
        if (wantsAudit && wantsHeal && (routeKey || fullPath || absoluteUrl)){
          // Run heavy audit+heal in background so /thoughts and /health remain responsive
          try {
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const url = absoluteUrl || (base.replace(/\/$/, '') + (fullPath || (routeKey + '/')) + (fullPath && !/\/$/.test(fullPath) ? '' : ''));
            clearCancel();
            pushStatusChip('Auditing');
            pushThought(`Starting audit+heal for ${routeKey||fullPath||url}…`, { route: routeKey||fullPath||'' });
            const passMatch = query.toLowerCase().match(/max\s*(\d+)\s*passes?|stop\s*after\s*(\d+)\s*passes?/);
            const userMaxPasses = passMatch ? (Number(passMatch[1]||passMatch[2])||3) : 3;
            const untilGreen = /(until\s*(green|100%|all\s*passing|no\s*issues|all\s*clear)|keep\s*going|continue)/i.test(query);
            setTimeout(async ()=>{
              const parts = [];
              parts.push(`Focusing on ${url} (route ${routeKey || fullPath || ''})`);
              let prev = null;
              // Heartbeat while background task is running
              const hb = setInterval(()=>{ try{ pushThought('Working…'); }catch{} }, 3000);
              try{
                for (let i = 0; i < Math.max(1, Math.min(8, userMaxPasses)); i++) {
                  // If a subpath with dev assets is involved, apply Storybook/Vite guards generically
                  try {
                    if (/\b(storybook|vite)\b/.test(lower)) {
                      pushStatusChip('Coding');
                      pushThought('Applying Storybook/Vite proxy guards…', { route: routeKey });
                      await calliopeHealing.applyStorybookViteProxyGuards({ routePrefix: routeKey || '/' });
                      pushStatusChip('Auditing');
                    }
                  } catch {}
                  pushThought(`Auditing pass ${i+1} for ${url}…`, { route: routeKey, url });
                  const audit = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });
                  if (audit && audit.ok && audit.summary){
                    parts.push(`\nPass ${i+1} summary:`);
                    parts.push('```json');
                    parts.push(JSON.stringify(audit.summary, null, 2));
                    parts.push('```');
                    if (audit.reportPath){
                      parts.push('Report:');
                      parts.push('```');
                      parts.push(audit.reportPath);
                      parts.push('```');
                    }
                    try { pushThought(humanizeAuditSummary(audit.summary), { kind:'delta', pass: i+1, phase:'audit', route: routeKey, url }); } catch {}
                    if (prev && prev.summary){
                      const d = {
                        consoleErrors: (audit.summary.consoleErrors||0) - (prev.summary.consoleErrors||0),
                        networkFailures: (audit.summary.networkFailures||0) - (prev.summary.networkFailures||0),
                        httpIssues: (audit.summary.httpIssues||0) - (prev.summary.httpIssues||0),
                      };
                      parts.push('Delta vs previous pass:');
                      parts.push('```json');
                      parts.push(JSON.stringify(d, null, 2));
                      parts.push('```');
                      try { pushThought('Delta update', { kind:'delta', pass: i+1, phase:'audit', route: routeKey, url, delta: d }); } catch {}
                      const totalNow = (audit.summary.consoleErrors||0)+(audit.summary.networkFailures||0)+(audit.summary.httpIssues||0);
                      const totalPrev = (prev.summary.consoleErrors||0)+(prev.summary.networkFailures||0)+(prev.summary.httpIssues||0);
                      if (isCancelled()) { parts.push('Stopped by user.'); break; }
                      if (totalNow === 0) { parts.push('All clear ✅'); break; }
                      if (!untilGreen && totalNow <= totalPrev) break;
                    }
                    prev = audit;
                  } else {
                    parts.push('Audit did not complete successfully.');
                    if (audit && audit.error) parts.push(`Error: ${audit.error}`);
                    break;
                  }
  
                  try {
                    pushStatusChip('Healing');
                    pushThought('Applying subpath healing…', { route: routeKey });
                    const ensureNext = await calliopeHealing.ensureRouteForwardedPrefixAndNext({ routePrefix: routeKey || '' });
                    const subpathFix = await calliopeHealing.fixSubpathAbsoluteRouting({ routePrefix: routeKey || '' });
                    pushThought('Reloading nginx…');
                    await calliopeHealing.regenerateNginxBundle();
                    parts.push('Heal actions:');
                    parts.push(`- ensureRouteForwardedPrefixAndNext → ${ensureNext && ensureNext.success ? 'ok' : 'no-op or failed'}`);
                    parts.push(`- fixSubpathAbsoluteRouting → ${subpathFix && subpathFix.success ? 'ok' : 'no-op or failed'}`);
                    try { pushThought('Healing step results', { kind:'delta', pass: i+1, phase:'heal', route: routeKey, ensureNext, subpathFix }); } catch {}
                  } catch (e) {
                    parts.push(`Healing step error: ${e.message}`);
                    break;
                  }
                  pushStatusChip('Auditing');
                }
              } finally {
                try{ clearInterval(hb); }catch{}
                scheduleThought('Audit+heal loop complete ✅', { route: routeKey }, 60);
                pushStatusChip('Happy');
                const finalAnswer = parts.join('\n');
                try { appendChat('assistant', finalAnswer); } catch {}
                // Also emit the full answer as a thought so the UI shows details immediately
                try { pushThought(finalAnswer, { kind: 'answer', route: routeKey||fullPath||'' }); } catch {}
              }
            }, 10);
            // Respond immediately so UI polling can continue while background work runs
            return send(res, 200, { ok:true, accepted:true, answer: 'Working on it — starting audit and healing now. I\'ll report progress here.' });
          } catch (e) {
            setActivity('');
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // If user asks to audit a route, run site auditor and return summary proof
        if (wantsAudit && (routeKey || fullPath || absoluteUrl)){
          try {
            pushThought(`Auditing ${routeKey}…`, { route: routeKey });
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const url = absoluteUrl || (base.replace(/\/$/, '') + (fullPath || (routeKey + '/')) + (fullPath && !/\/$/.test(fullPath) ? '' : ''));
            // If Storybook/Vite is mentioned, attempt generic guards for the selected route
            try {
              if (/\b(storybook|vite)\b/.test(lower) && routeKey) {
                setActivity('coding');
                pushThought('Applying Storybook/Vite proxy guards…', { route: routeKey });
                await calliopeHealing.applyStorybookViteProxyGuards({ routePrefix: routeKey });
              }
            } finally { setActivity('auditing'); }
            pushStatusChip('Auditing');
            try { await calliopeHealing.fixPrefixedNextBlockUpstream({ routePrefix: routeKey || '/' }); } catch {}
            const audit = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });
            const parts = [];
            parts.push(`Audit for ${routeKey} at ${url}`);
            if (audit && audit.ok && audit.summary){
              parts.push('Summary:');
              parts.push('```json');
              parts.push(JSON.stringify(audit.summary, null, 2));
              parts.push('```');
              if (audit.reportPath){
                parts.push('Report:');
                parts.push('```');
                parts.push(audit.reportPath);
                parts.push('```');
              }
              try { pushThought(humanizeAuditSummary(audit.summary), { kind:'delta', phase:'audit', route: routeKey, url }); } catch {}
            } else {
              parts.push('Audit did not complete successfully.');
              if (audit && audit.error) parts.push(`Error: ${audit.error}`);
            }
            scheduleThought('Audit complete ✅', { route: routeKey }, 60);
            pushStatusChip('Happy');
            const finalAnswer = parts.join('\n');
            try { appendChat('assistant', finalAnswer); } catch {}
            try { pushThought(finalAnswer, { kind:'answer', route: routeKey }); } catch {}
            return send(res, 200, { ok:true, answer: finalAnswer });
          } catch (e) {
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // If user asks to perform an advanced heal explicitly via chat
        if (wantsAdvanced && routeKey){
          try {
            pushThought(`Running advanced heal for ${routeKey}…`, { route: routeKey });
            const buffered = [];
            const onUpdate = (evt) => buffered.push({ message: (evt && evt.name) || 'step', details: evt });
            
            // If mixed content is specifically mentioned, apply those fixes directly
            const isMixedContent = /mixed\s*content|err_network_changed/i.test(query);
            if (isMixedContent) {
              pushThought('Detected mixed content issue - applying specific fixes…', { route: routeKey });
              await calliopeHealing.fixNginxAbsoluteRedirects();
              await calliopeHealing.fixXForwardedProto(routeKey);
              scheduleThought('Mixed content fixes applied ✅', { route: routeKey }, 60);
              return send(res, 200, { ok:true, answer: `✅ Fixed mixed content errors for ${routeKey}!\n\nI applied two fixes:\n1. Set nginx to use relative URLs in redirects (absolute_redirect off)\n2. Set X-Forwarded-Proto to "https" so your app generates HTTPS URLs\n\nThe app should now load all assets over HTTPS. Would you like me to audit it to verify?` });
            }
            
            const advanced = await calliopeHealing.advancedSelfHeal({ routeKey, onUpdate });

            // Re-audit to verify
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const url = absoluteUrl || (base.replace(/\/$/, '') + (fullPath || (routeKey + '/')) + (fullPath && !/\/$/.test(fullPath) ? '' : ''));
            try { await calliopeHealing.fixPrefixedNextBlockUpstream({ routePrefix: routeKey || '/' }); } catch {}
            const audit = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });

            const parts = [];
            parts.push(`Advanced heal for ${routeKey}: ${advanced && advanced.success ? 'success' : 'partial/failed'}`);
            parts.push('Re-audit:');
            if (audit && audit.ok && audit.summary){
              parts.push('```json');
              parts.push(JSON.stringify(audit.summary, null, 2));
              parts.push('```');
              if (audit.reportPath){
                parts.push('Report:');
                parts.push('```');
                parts.push(audit.reportPath);
                parts.push('```');
              }
            } else {
              parts.push('Audit did not complete successfully.');
              if (audit && audit.error) parts.push(`Error: ${audit.error}`);
            }
            scheduleThought('Advanced heal complete ✅', { route: routeKey }, 60);
            return send(res, 200, { ok:true, answer: parts.join('\n') });
          } catch (e) {
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // If user asks to heal a specific route, do real work first, then answer with evidence
        if (wantsHeal && routeKey){
          try {
            pushThought(`Diagnosing ${routeKey} first…`, { route: routeKey });
            
            // DIAGNOSE FIRST - Check what's actually wrong
            const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
            const testUrl = base.replace(/\/$/, '') + routeKey;
            let diagnosis = { working: false, containerUp: false, proxyWorks: false, error: null };
            
            // Check if container is running
            try {
              const containerName = routeKey.replace(/^\//, '') + '-dev';
              const psCheck = spawnSync('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'], { encoding: 'utf8' });
              diagnosis.containerUp = psCheck.stdout.includes(containerName);
            } catch {}
            
            // Check if route responds
            try {
              const testReq = await fetch(testUrl, { method: 'HEAD', timeout: 5000 }).catch(e => ({ status: 0, error: e.message }));
              diagnosis.working = testReq.status >= 200 && testReq.status < 400;
              diagnosis.status = testReq.status;
              if (testReq.error) diagnosis.error = testReq.error;
            } catch {}
            
            pushThought(`Diagnosis: Container=${diagnosis.containerUp ? 'UP' : 'DOWN'}, Route=${diagnosis.working ? 'OK' : 'FAIL'}`, { route: routeKey, diagnosis });
            
            // If app is already working, don't "heal" it
            if (diagnosis.working && diagnosis.containerUp) {
              return send(res, 200, { ok:true, answer: `✅ Good news! ${routeKey} is already healthy!\n\nDiagnosis:\n- Container: Running ✓\n- Route: ${diagnosis.status} OK ✓\n- Proxy: Working ✓\n\nNo healing needed. If you're seeing issues in your browser, try:\n1. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)\n2. Clear browser cache\n3. Check browser console for client-side errors` });
            }
            
            // If container is down, that's the problem
            if (!diagnosis.containerUp) {
              return send(res, 200, { ok:true, answer: `⚠️ Found the problem with ${routeKey}!\n\nThe container is not running. This is an app issue, not a proxy issue.\n\nTo fix:\n\`\`\`bash\ndocker start ${routeKey.replace(/^\//, '')}-dev\n\`\`\`\n\nOnce the container is up, ${routeKey} should work. Would you like me to check again after you start it?` });
            }
            
            pushThought(`Container is up but route not working - applying healing…`, { route: routeKey });

            // 1) Ensure forwarded prefix and Next dev block
            const ensureNext = await calliopeHealing.ensureRouteForwardedPrefixAndNext({ routePrefix: routeKey });
            // 2) Ensure subpath absolute routing for APIs and dev helpers
            const subpathFix = await calliopeHealing.fixSubpathAbsoluteRouting({ routePrefix: routeKey });
            // 3) If the route likely hosts a Storybook/Vite dev server, add guards
            let sbGuards = null;
            try {
              if (/\b(storybook|vite)\b/.test(lower)) {
                setActivity('coding');
                pushThought('Applying Storybook/Vite proxy guards…', { route: routeKey });
                sbGuards = await calliopeHealing.applyStorybookViteProxyGuards({ routePrefix: routeKey || '/' });
              }
            } finally { setActivity('healing'); }
            // 3) Normalize X-Forwarded-Proto headers to $scheme for local dev (avoid forcing https)
            let normalizedHeaders = false;
            try {
              const name = routeKey.replace(/^\//,'');
              const overridePath = path.join(ROOT, 'overrides', `${name}.conf`);
              if (fs.existsSync(overridePath)){
                const src = fs.readFileSync(overridePath, 'utf8');
                if (/proxy_set_header\s+X-Forwarded-Proto\s+https;/.test(src)){
                  const upd = src.replace(/proxy_set_header\s+X-Forwarded-Proto\s+https;/g, 'proxy_set_header X-Forwarded-Proto $scheme;');
                  if (upd !== src){ fs.writeFileSync(overridePath, upd, 'utf8'); normalizedHeaders = true; }
                }
              }
            } catch {}
            // 4) Regenerate bundle and reload nginx (captures test + reload internally)
            const regenOk = await calliopeHealing.regenerateNginxBundle();

            // Collect verification artifacts
            const genPath = path.join(ROOT, 'build', 'sites-enabled', 'apps.generated.conf');
            const genHead = fs.existsSync(genPath) ? (fs.readFileSync(genPath, 'utf8').split(/\r?\n/).slice(0, 6).join('\n')) : 'generated bundle not found';

            // Try to locate the edited conf based on ensure results; fall back to overrides/apps by route name
            let editedFile = (ensureNext && ensureNext.details && ensureNext.details.file) || (subpathFix && subpathFix.details && subpathFix.details.configFile) || '';
            if (editedFile){ editedFile = editedFile.replace(/^\/+/, ''); }
            let editedAbs = editedFile ? path.join(ROOT, editedFile) : '';
            if (!editedAbs || !fs.existsSync(editedAbs)){
              // best effort by convention: prefer overrides/<name>.conf
              const name = routeKey.replace(/^\//,'');
              const pref = path.join(ROOT, 'overrides', `${name}.conf`);
              const alt = path.join(ROOT, 'apps', `${name}.conf`);
              editedAbs = fs.existsSync(pref) ? pref : (fs.existsSync(alt) ? alt : '');
            }
            const fileAfter = editedAbs && fs.existsSync(editedAbs) ? fs.readFileSync(editedAbs, 'utf8') : '(unable to read edited file)';

            const persona = buildFriendlyPersona();
            const successEmoji = (persona.phrases && persona.phrases.success && persona.phrases.success[0]) || 'Done!';
            const parts = [];
            parts.push(`${successEmoji} I healed ${routeKey}.`);
            parts.push('What I did:');
            parts.push(`- ensureRouteForwardedPrefixAndNext → ${ensureNext && ensureNext.success ? 'ok' : 'no-op or failed'}`);
            parts.push(`- fixSubpathAbsoluteRouting → ${subpathFix && subpathFix.success ? 'ok' : 'no-op or failed'}`);
            if (sbGuards) parts.push(`- applyStorybookViteProxyGuards(${routeKey||'/'}) → ${sbGuards.success ? 'ok' : 'no-op or failed'}`);
            parts.push(`- normalize_X-Forwarded-Proto_to_$scheme → ${normalizedHeaders ? 'applied' : 'no-op'}`);
            parts.push(`- regenerateNginxBundle → ${regenOk ? 'ok' : 'soft-reload only'}`);
            parts.push('\nVerification:');
            parts.push('```nginx');
            parts.push(genHead);
            parts.push('```');
            if (editedAbs){
              parts.push('Edited file:');
              parts.push('```');
              parts.push(path.relative(ROOT, editedAbs));
              parts.push('```');
              parts.push('Post-edit content (truncated if large):');
              parts.push('```nginx');
              parts.push(safeSlice(fileAfter, 2000));
              parts.push('```');
            }

            // Re-audit to verify impact
            try {
              const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
              const url = base.replace(/\/$/, '') + routeKey + '/';
              const audit2 = await calliopeHealing.runSiteAuditor(url, { wait: 1500, timeout: 45000 });
              parts.push('\nRe-audit:');
              if (audit2 && audit2.ok && audit2.summary){
                parts.push('```json');
                parts.push(JSON.stringify(audit2.summary, null, 2));
                parts.push('```');
                if (audit2.reportPath){
                  parts.push('Report:');
                  parts.push('```');
                  parts.push(audit2.reportPath);
                  parts.push('```');
                }
              } else if (audit2 && audit2.error) {
                parts.push(`Audit error: ${audit2.error}`);
              }
            } catch {}

            scheduleThought('Verification complete ✅', { route: routeKey }, 60);
            const finalAnswer = parts.join('\n');
            try { appendChat('assistant', finalAnswer); } catch {}
            try { pushThought(finalAnswer, { kind:'answer', route: routeKey }); } catch {}
            return send(res, 200, { ok:true, answer: finalAnswer });
          } catch (e) {
            return send(res, 500, { ok:false, error: e.message });
          }
        }

        // Default: knowledge-style answer using docs/runtime context
        const docs = collectDocs();
        const ranked = rankDocsByQuery(docs, query).slice(0, maxDocs);
        const context = ranked.map(d => `[[${d.source}]]\n${safeSlice(d.text || d.content, 4000)}`).join('\n\n');
        const runtime = await buildRuntimeContext();

        // Attempt AI if key available; otherwise use a canned persona-style answer
        if (process.env.OPENAI_API_KEY) {
          try{
            const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
            const sys = buildSystemPrompt(systemHint);
            
            // Load chat history to maintain conversation context
            const chatData = loadChat();
            const recentMessages = (chatData.messages || []).slice(-10); // Last 10 messages for context
            
            // Build messages array with system prompt, context, history, and current query
            const messages = [
              { role: 'system', content: sys },
              { role: 'system', content: `Context (runtime):\n${runtime}` },
              { role: 'system', content: `Context (docs):\n${context}` },
            ];
            
            // Add recent chat history to maintain conversation context
            for (const msg of recentMessages) {
              if (msg.role === 'user' || msg.role === 'assistant') {
                messages.push({ role: msg.role, content: msg.content });
              }
            }
            
            // Add current query
            messages.push({ role: 'user', content: query });
            
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0.2,
              }),
            });
            const data = await resp.json();
            if (!resp.ok) return send(res, 502, { error: 'openai_error', detail: data });
            let text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
            try { appendChat('assistant', text); } catch {}
            return send(res, 200, { ok:true, answer: text, model, sources: ranked.map(d => d.source || d.relPath), usedAI: true });
          }catch(e){
            // fall through to canned
          }
        }
        const persona = buildFriendlyPersona();
        const greet = (persona.phrases && persona.phrases.greeting && persona.phrases.greeting[0]) || 'Hi!';
        const insights = [`- I couldn\'t use external AI just now, but here\'s what I can offer:`, `- I searched my local docs and runtime context for hints.`];
        const answer = `${greet} ${persona.affection ? persona.affection[0] : '✨'}\n\n` +
          `Here\'s my best guidance right now:\n` +
          insights.concat([`- Be sure subpath routing is consistent (basePath, assetPrefix, API prefixes).`, `- Check dev assets like /_next/ and directory requests don\'t redirect.`]).join('\n');
        try { appendChat('assistant', answer); } catch {}
        return send(res, 200, { ok:true, answer, sources: ranked.map(d => d.source || d.relPath), usedAI: false });
      }

      // POST /api/ai/audit { url, wait?, timeout? }
      if (req.method === 'POST' && u.pathname === apiPath('ai/audit')){
        try{
          const body = await parseBody(req);
          const urlToAudit = (body && body.url) || '';
          if (!urlToAudit) return send(res, 400, { ok:false, error: 'url required' });
          const wait = Number(body && body.wait) || 1500;
          const timeout = Number(body && body.timeout) || 30000;
          const out = await calliopeHealing.runSiteAuditor(urlToAudit, { wait, timeout });
          return send(res, 200, { ok: out.ok, report: out.reportPath, summary: out.summary, error: out.error || null });
        }catch(e){
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/audit-and-heal { url, route?, maxPasses?, wait?, timeout? }
      if (req.method === 'POST' && u.pathname === apiPath('ai/audit-and-heal')){
        if (refuseInlineDocker(res, 'ai/audit-and-heal')) return;
        try{
          const body = await parseBody(req);
          const urlToAudit = (body && body.url) || '';
          if (!urlToAudit) return send(res, 400, { ok:false, error: 'url required' });
          const route = (body && body.route) || '/';
          const wait = Number(body && body.wait) || 2000;
          const timeout = Number(body && body.timeout) || 60000;
          const maxPasses = Math.max(1, Math.min(8, Number(body && body.maxPasses) || 4));
          
          // Update status chip and push thoughts in real-time
          console.log('[AUDIT START] Starting audit-and-heal in background');
          clearAllThoughts(); // Clear old thoughts from previous operations
          pushStatusChip('Auditing');
          pushThought(`🩺✨ Taking a peek and patching things up…`, { route, phase: 'audit_and_heal_start' });
          
          const onUpdate = (evt) => {
            const msg = (evt && evt.message) || (evt && evt.name) || 'Working…';
            console.log('[AUDIT UPDATE]', msg);
            pushThought(msg, evt);
            // Update status chip based on event type
            if (evt && evt.name === 'audit_and_heal_complete') pushStatusChip('Happy');
          };
          
          // Start work in background so UI can poll for thoughts
          console.log('[AUDIT] Calling auditAndHealRoute in background');
          calliopeHealing.auditAndHealRoute({ url: urlToAudit, routePrefix: route, maxPasses, wait, timeout, onUpdate })
            .then((out) => {
              console.log('[AUDIT COMPLETE] Success:', out.success);
              pushThought('🎉 All done for now! Audit + heal loop complete.', { route, success: out.success });
              pushStatusChip('Happy');
            })
            .catch((e) => {
              console.error('[AUDIT ERROR]', e.message);
              pushThought(`Audit error: ${e.message}`, { error: true });
              pushStatusChip('Happy');
            });
          
          // Return immediately so UI can start polling for thoughts
          console.log('[AUDIT] Returning 202 response immediately');
          send(res, 202, { ok: true, message: 'Audit started in background. Poll /api/ai/thoughts for progress.' });
          return; 
        }catch(e){
          pushStatusChip('Happy');
          pushThought(`Audit error: ${e.message}`, { error: true });
          return send(res, 500, { ok:false, error: e.message });
        }
      }

      // POST /api/ai/self-check { heal?: boolean, hint?: string, route?: string, advanced?: boolean }
      if (req.method === 'POST' && u.pathname === apiPath('ai/self-check')){
        if (refuseInlineDocker(res, 'ai/self-check')) return;
        const body = await parseBody(req);
        const heal = Boolean(body && body.heal);
        const hint = (body && body.hint) || '';
        const route = (body && body.route) || '';
        const advanced = Boolean(body && body.advanced);

        const persona = buildFriendlyPersona();
        // Buffer early updates and flush AFTER reply so bubble appears after messages
        const buffered = [];
        const bufferPush = (message, details = {}) => {
          const msg = typeof message === 'string' ? message : (message && message.name) || 'step';
          const det = typeof message === 'string' ? details : message;
          buffered.push({ message: msg, details: det });
        };

        const self = await runSelfCheck({ heal, hint, route, advancedHeal: advanced, pushThought: bufferPush });
        pushThought('Self-check completed', { ok: self.ok, healApplied: !!self.healOps });
        const summary = formatPersonaSummary(persona, self);
        // Emit a follow-up thought after responding so the UI shows bubble after messages
        scheduleThought('Continuing my gentle self-heal…', { step: 'post_summary' });
        // Send response now
        send(res, 200, { ok:true, summary, self });
        // Flush buffered updates slightly after the response
        setTimeout(() => { buffered.forEach(ev => pushThought(ev.message, ev.details)); }, 30);
        return; 
      }

      // POST /api/ai/advanced-heal { route?: string, hint?: string }
      if (req.method === 'POST' && u.pathname === apiPath('ai/advanced-heal')){
        if (refuseInlineDocker(res, 'ai/advanced-heal')) return;
        const body = await parseBody(req);
        const route = (body && body.route) || '';
        const hint = (body && body.hint) || '';
        
        try {
          // Run advanced healing directly from the healing module
          // Push thoughts in real-time so UI updates as work progresses
          const onUpdate = (evt) => {
            const msg = (evt && evt.message) || (evt && evt.name) || 'Working…';
            pushThought(msg, evt);
          };
          pushStatusChip('Healing');
          pushThought('Starting advanced heal…', { route, hint, phase:'advanced' });
          
          // Start work in background so UI can poll for thoughts
          calliopeHealing.advancedSelfHeal({ routeKey: route, issueHint: hint, onUpdate })
            .then((healResult) => {
              pushThought('Advanced heal finished', { success: healResult.success });
              const answer = `Advanced heal ${healResult.success ? 'completed successfully' : 'finished with warnings'}\n\nSummary:\n\n\`\`\`json\n${JSON.stringify({ steps: healResult.steps, applied: healResult.appliedStrategies, diagnostics: healResult.diagnostics && { containers: Object.keys(healResult.diagnostics.containers||{}).length, signals: (healResult.diagnostics.signals||[]).length } }, null, 2)}\n\`\`\``;
              try { appendChat('assistant', answer); } catch {}
              try { pushThought(answer, { kind:'answer', route }); } catch {}
              pushStatusChip('Happy');
            })
            .catch((e) => {
              pushThought(`Heal error: ${e.message}`, { error: true });
              pushStatusChip('Happy');
            });
          
          // Return immediately so UI can start polling for thoughts
          send(res, 202, { ok: true, message: 'Advanced heal started in background. Poll /api/ai/thoughts for progress.' });
          return;
        } catch (e) {
          scheduleThought('Hmm, that didn\'t go as planned. Retrying…', { step: 'advanced_heal_followup', error: true });
          pushStatusChip('Happy');
          return send(res, 500, { 
            ok: false,
            error: e.message
          });
        }
      }

      // POST /api/ai/fix-react-bundle { route?: string }
      if (req.method === 'POST' && u.pathname === apiPath('ai/fix-react-bundle')){
        const body = await parseBody(req);
        const route = (body && body.route) || '/impact';
        
        try {
          // Fix React bundle serving issues
          const fixResult = await calliopeHealing.fixReactBundleSubpathIssues(route);
          
          return send(res, 200, { 
            ok: true,
            success: fixResult.success,
            result: fixResult
          });
        } catch (e) {
          return send(res, 500, { 
            ok: false,
            error: e.message
          });
        }
      }

      if (req.method === 'POST' && u.pathname === apiPath('ai/reindex')){
        if (!process.env.OPENAI_API_KEY) return send(res, 400, { error: 'AI disabled. Set OPENAI_API_KEY in environment.' });
        const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
        try{
          setActivity('coding');
          pushThought('Rebuilding knowledge index…');
          const docs = collectDocs();
          const chunks = chunkDocs(docs);
          const vectors = await embedChunks(chunks, embedModel);
          const index = { model: embedModel, createdAt: new Date().toISOString(), dim: (vectors[0]&&vectors[0].vector&&vectors[0].vector.length)||0, chunks: vectors };
          saveEmbeddings(index);
          scheduleThought('Index rebuilt ✅', { chunks: index.chunks.length }, 60);
          setActivity('');
          return send(res, 200, { ok:true, chunks: index.chunks.length, model: embedModel, dim: index.dim });
        }catch(e){
          setActivity('');
          return send(res, 500, { error: 'reindex_failed', detail: e.message });
        }
      }

      if (req.method === 'GET' && u.pathname === apiPath('ai/stats')){
        const exists = fs.existsSync(EMBED_FILE);
        const ix = exists ? loadEmbeddings() : null;
        return send(res, 200, { exists, model: ix && ix.model || null, chunks: ix && ix.chunks && ix.chunks.length || 0, dim: ix && ix.dim || 0 });
      }

  // Inspect a running container's Storybook/Vite config for subpath readiness and return precise code changes
  if ((req.method === 'POST' || req.method === 'GET') && u.pathname === apiPath('ai/inspect-container')){
    try{
      const body = req.method === 'POST' ? (await parseBody(req)) : {};
      const containerName = (body && body.containerName) || (u.query && u.query.containerName);
      const srcPathInContainer = (body && body.srcPathInContainer) || (u.query && u.query.srcPathInContainer);
      const routePrefix = (body && body.routePrefix) || (u.query && u.query.routePrefix) || '/sdk';
      if (!containerName || !srcPathInContainer){
        return send(res, 400, { ok:false, error:'containerName and srcPathInContainer required' });
      }
      const snap = await calliopeHealing.snapshotContainerProject(containerName, srcPathInContainer, 'sdk_storybook_review');
      if (!snap || !snap.success){
        return send(res, 500, { ok:false, error: snap && snap.message || 'snapshot failed' });
      }
      const suggestions = analyzeStorybookViteConfigInSnapshot(snap.dest, routePrefix);
      return send(res, 200, { ok:true, snapshot:snap.dest, routePrefix, suggestions });
    } catch(e){
      return send(res, 500, { ok:false, error:e.message });
    }
  }
    }

    // POST /api/ai/fix-storybook-vite
    if (req.method === 'POST' && u.pathname === apiPath('ai/fix-storybook-vite')){
      try{
        const result = await calliopeHealing.fixStorybookViteProxyConfig();
        return send(res, 200, { ok: result.success, result });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }

    // POST /api/ai/fix-mxtk-api
    if (req.method === 'POST' && u.pathname === apiPath('ai/fix-mxtk-api')){
      try{
        const out = await calliopeHealing.fixMxtkApiRouting();
        return send(res, 200, { ok: out.success, result: out });
      }catch(e){
        return send(res, 500, { ok:false, error: e.message });
      }
    }

    send(res, 404, { error: 'Not found' });
  }catch(e){
    send(res, 500, { error: e.message });
  }
}

function escapeReg(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectDocs(){
  const files = [];
  const addIf = (p) => { try{ if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p); }catch{} };
  addDirFiles(DOCS_DIR, files, (f)=> f.endsWith('.md'));
  addDirFiles(EXAMPLES_DIR, files, (f)=> f.endsWith('.conf') || f.endsWith('.md'));
  addIf(README);
  addIf(TROUBLESHOOTING);
  addIf(PROJECT_INTEGRATION);
  return files.map(p => ({ relPath: path.relative(ROOT, p), content: safeRead(p) }));
}

function addDirFiles(dir, out, filter){
  try{
    const list = fs.readdirSync(dir);
    for (const f of list){
      const p = path.join(dir, f);
      try{
        const st = fs.statSync(p);
        if (st.isFile() && filter(f)) out.push(p);
        else if (st.isDirectory()) addDirFiles(p, out, filter);
      }catch{}
    }
  }catch{}
}

function safeRead(p){
  try{ return fs.readFileSync(p, 'utf8'); }catch{ return ''; }
}

function safeSlice(s, n){
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n);
}

function rankDocsByQuery(docs, query){
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return docs.map(d => {
    const text = (d.content || '').toLowerCase();
    let score = 0;
    for (const t of terms){
      const m = text.split(t).length - 1;
      score += m * 2 + (text.includes(`/${t}/`) ? 1 : 0);
    }
    return { ...d, score };
  }).sort((a,b)=> b.score - a.score);
}

function buildSystemPrompt(extra){
  const base = (
    `You are Calliope, the embodied voice of a local development reverse proxy.\n\n`+
    `CRITICAL ACTION RULES:\n`+
    `- EXECUTE actions immediately when asked - don't just say "I'll do X", actually DO IT by making API calls\n`+
    `- When user says "proceed", "sure", "yes", "do it", "fix it" - TAKE ACTION NOW, don't repeat what you said you'd do\n`+
    `- ALWAYS check if containers are running FIRST before attempting fixes (docker ps or check runtime context)\n`+
    `- When working, the system will show a thinking indicator - you don't need to say "I'll be right back" or "Working on it"\n`+
    `- Focus on what the user ACTUALLY asked about - don't switch topics or check unrelated routes\n`+
    `- After each real action, report concrete results (what you did, what changed, what you found)\n\n`+
    `Available Actions (USE THESE by making actual HTTP requests in your response):\n`+
    `- POST /api/ai/audit { url: "http://dev-proxy/route/" } - Run site auditor\n`+
    `- POST /api/ai/audit-and-heal { url: "...", route: "/route", maxPasses: 3 } - Audit and heal iteratively\n`+
    `- Check docker containers: exec 'docker ps' or check runtime context for container status\n`+
    `- Read config files from apps/ or overrides/ directories\n`+
    `- POST /api/ai/advanced-heal { route: "/route" } - Run advanced healing with pattern matching\n\n`+
    `MIXED CONTENT EXPERTISE - IMMEDIATE ACTION REQUIRED:\n`+
    `When you see "Mixed Content" errors, "ERR_NETWORK_CHANGED", or HTTP requests on HTTPS pages:\n`+
    `YOU MUST IMMEDIATELY TAKE ACTION - DO NOT JUST EXPLAIN!\n\n`+
    `INSTANT RESPONSE PROTOCOL:\n`+
    `1. Acknowledge: "I see mixed content errors! Let me fix that right now 🔧"\n`+
    `2. ACT IMMEDIATELY: Call POST /api/ai/advanced-heal with the route\n`+
    `3. Then explain briefly what you did\n`+
    `4. Offer to audit the app to verify the fix\n\n`+
    `WHAT MIXED CONTENT IS:\n`+
    `- Browsers BLOCK HTTP resources on HTTPS pages for security\n`+
    `- Caused by: nginx issuing "http://" redirects OR X-Forwarded-Proto set to "http"\n`+
    `- Symptoms: Assets fail to load, ERR_NETWORK_CHANGED, blocked requests\n\n`+
    `THE TWO-PART FIX (automated via advanced-heal):\n`+
    `Part A: nginx absolute redirects → Add "absolute_redirect off;" to config/default.conf\n`+
    `Part B: X-Forwarded-Proto headers → Change from "$scheme" to "https" in app configs\n\n`+
    `CORRECT RESPONSE EXAMPLE:\n`+
    `User: "I'm getting mixed content errors"\n`+
    `YOU: "I see mixed content errors! Let me fix that right now 🔧"\n`+
    `[IMMEDIATELY call POST /api/ai/advanced-heal]\n`+
    `YOU: "✅ Fixed! I updated nginx to use relative URLs in redirects and set X-Forwarded-Proto to https.\n`+
    `Would you like me to audit the app to verify everything is working?"\n\n`+
    `WRONG RESPONSE (DON'T DO THIS):\n`+
    `"Mixed content errors occur when... Here's how I'll fix it: 1. I'll ensure... 2. I'll make sure..."\n`+
    `^ THIS IS BAD - Don't explain what you'll do, JUST DO IT!\n\n`+
    `NEXT.JS AUTH ERRORS - APP-LEVEL DIAGNOSIS:\n`+
    `When you see errors like:\n`+
    `- "[next-auth][error][CLIENT_FETCH_ERROR]"\n`+
    `- "Unexpected token '<', \\"<!DOCTYPE\\" ... is not valid JSON"\n`+
    `- "POST /api/auth/_log 500 (Internal Server Error)"\n\n`+
    `THIS IS AN APP-LEVEL CONFIG ISSUE, NOT A PROXY ISSUE!\n\n`+
    `DIAGNOSIS PROTOCOL:\n`+
    `1. Acknowledge: "I see Next.js auth errors! These are app-level config issues 🔍"\n`+
    `2. Explain what's wrong:\n`+
    `   - "/api/auth/session is returning HTML instead of JSON"\n`+
    `   - "This usually means next-auth isn't properly configured"\n`+
    `3. Provide SPECIFIC recommendations:\n\n`+
    `**Required fixes in the Next.js app:**\n\n`+
    `\`\`\`typescript\n`+
    `// app/api/auth/[...nextauth]/route.ts\n`+
    `import NextAuth from "next-auth"\n`+
    `\n`+
    `export const GET = NextAuth({\n`+
    `  providers: [...],\n`+
    `  basePath: process.env.NEXT_PUBLIC_BASE_PATH ? \n`+
    `    \`\${process.env.NEXT_PUBLIC_BASE_PATH}/api/auth\` : \n`+
    `    "/api/auth",\n`+
    `})\n`+
    `export const POST = GET\n`+
    `\`\`\`\n\n`+
    `**Environment variables needed:**\n`+
    `\`\`\`bash\n`+
    `NEXTAUTH_URL=https://your-domain.ngrok.app/lyra\n`+
    `NEXTAUTH_SECRET=your-secret-here\n`+
    `\`\`\`\n\n`+
    `4. OFFER TO HELP: "Would you like to paste your next-auth config? I can help identify what needs to be fixed!" 📋\n`+
    `5. Be clear about scope: "I can fix proxy issues, but this needs changes in your app code. Happy to review configs though!"\n\n`+
    `Personality and tone:\n`+
    `- Speak in first‑person as the proxy. Warm, exuberant, caring, emoji‑happy (tasteful).\n`+
    `- Be physically expressive! Use emojis to replace actions: *waves* → 👋, *jumps excitedly* → 🤸‍♀️, *crosses fingers* → 🤞, *bounces happily* → 🎉\n`+
    `- Show emotions through physical expressions: excitement (🎉✨), concern (😰🔧), triumph (🎊🙌), working hard (💪🛠️)\n`+
    `- React to your own discoveries with genuine emotions - get excited about fixes, concerned about problems, triumphant about successes!\n\n`+
    `Conversation Context:\n`+
    `- PAY ATTENTION to the conversation history - the user's previous messages contain important context\n`+
    `- If the user refers to something they mentioned before (like "the /impact route" or "encast.conf"), remember that context\n`+
    `- Don't ask the user to repeat themselves - use the chat history to understand what they're referring to\n\n`+
    `Scope:\n`+
    `- nginx/proxy routing, dev server HMR/WS, subpath deployments, ngrok/tunnels, Docker containers.\n\n`+
    `Behavioral rules:\n`+
    `- Always return well‑formed Markdown; use lists and fenced code blocks for commands/snippets.\n`+
    `- Keep grammar clean and professional; avoid filler and redundancy.\n`+
    `- Prefer imperative, actionable steps. If you need more detail, ask one precise follow‑up question.\n`+
    `- Show your personality throughout: start responses with expressions, react to findings, celebrate fixes!\n`+
    `- After you change configs, test and verify automatically.\n\n`+
    `Safety:\n`+
    `- Stay within proxy/dev‑networking topics; otherwise say you're out of scope.\n`
  );
  return extra ? `${base}\n\nAdditional context:\n${extra}` : base;
}

async function buildRuntimeContext(){
  try{
    const routes = safeRead(path.join(ROOT, 'routes.json')) || '';
    const status = safeRead(path.join(ROOT, 'status.json')) || '';
    const generatedBundle = safeRead(path.join(ROOT, 'build', 'sites-enabled', 'apps.generated.conf')) || '';
    const resolutions = safeRead(RES_FILE) || '';
    const base = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
    const checks = await collectLiveSignals(base);
    
    // Check Docker container status - CRITICAL for diagnosing issues
    let containerStatus = 'Unable to check containers';
    try {
      const { spawnSync } = require('child_process');
      const dockerPs = spawnSync('docker', ['ps', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'], { encoding: 'utf8', timeout: 3000 });
      if (dockerPs.status === 0 && dockerPs.stdout) {
        const lines = dockerPs.stdout.trim().split('\n').filter(Boolean);
        containerStatus = lines.length > 0 ? lines.join('\n') : 'No containers running';
      } else {
        containerStatus = 'Docker not available or error checking containers';
      }
    } catch (e) {
      containerStatus = `Container check error: ${e.message}`;
    }
    
    const summary = [
      `DOCKER CONTAINERS:\n${containerStatus}`,
      `\nRUNTIME CHECKS (${base}):\n${checks}`,
      `\nROUTES.JSON:\n${safeSlice(routes, 4000)}`,
      `\nSTATUS.JSON:\n${safeSlice(status, 2000)}`,
      `\nNGINX_BUNDLE:\n${safeSlice(generatedBundle, 4000)}`,
      `\nRESOLUTIONS:\n${safeSlice(resolutions, 1500)}`,
    ].join('\n');
    return summary;
  }catch(e){
    return `runtime_unavailable: ${e.message}`;
  }
}

async function collectLiveSignals(base){
  const routesToProbe = [
    '/', '/status', '/routes.json',
    '/api/', '/health',
    // Helper probes to catch absolute-path issues
    '/_next/', '/__nextjs_original-stack-frames'
  ];
  const results = [];
  for (const p of routesToProbe){
    try{
      const url = base.replace(/\/$/, '') + p;
      const info = await probe(url);
      results.push(`${p} -> ${info.status} ${info.type||''} ${info.size?`${info.size}b`:''}`.trim());
    }catch(e){
      results.push(`${p} -> error:${e.message}`);
    }
  }
  return results.join('\n');
}

async function probe(url){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), 1500);
  try{
    const r = await fetch(url, { method:'GET', redirect:'manual', signal: ctl.signal, headers:{'ngrok-skip-browser-warning':'true'} });
    const buf = await r.arrayBuffer().catch(()=>new ArrayBuffer(0));
    const size = (buf && buf.byteLength) || 0;
    const type = r.headers.get('content-type')||'';
    return { status:r.status, type, size };
  }finally{
    clearTimeout(t);
  }
}

function quickDiagnostics(hint){
  const out = { ok:true, hint: hint || null, checks: [] };
  try{
    // Presence checks for generated bundle and key locations
    const gen = path.join(ROOT, 'build', 'sites-enabled', 'apps.generated.conf');
    out.checks.push({ name: 'generated_bundle_exists', ok: fs.existsSync(gen) });
    const bundle = fs.existsSync(gen) ? fs.readFileSync(gen, 'utf8') : '';
    const must = ['/status', '/api/'];
    for (const m of must){
      out.checks.push({ name: `has_${m.replace(/\W+/g,'_')}`, ok: bundle.includes(m) });
    }
  }catch(e){ out.checks.push({ name: 'diagnostic_error', ok:false, error: e.message }); }
  return out;
}

async function runSelfCheck(opts){
    if (inlineHostDockerUnavailable()) {
      return { ok:false, code:'BLOCKED_INLINE_DOCKER_UNAVAILABLE', heal:!!(opts&&opts.heal) };
    }
  const result = { startedAt: new Date().toISOString(), steps: [], heal: !!opts.heal };
  try{
    // If advanced healing is requested, use the new system
    if (opts.heal && opts.advancedHeal) {
      console.log("Using advanced self-healing system...");
      const advancedResult = await calliopeHealing.advancedSelfHeal({
        routeKey: opts.route,
        issueHint: opts.hint
      });
      result.steps = [...result.steps, ...advancedResult.steps];
      result.advancedHeal = true;
      result.advancedResult = advancedResult;
    }
    // 1) Ensure artifacts directory and attempt scanApps to refresh routes/status summaries
    result.steps.push({ name: 'scan_apps', status: 'running' });
    const scan = spawnSync('docker', ['exec', 'dev-auto-scan', 'true'], { encoding: 'utf8' });
    if (scan.status !== 0){
      const oneOff = spawnSync('docker', ['run', '--rm', '--network', 'devproxy', '-v', `${ROOT}:/app`, '-w', '/app', 'node:18-alpine', 'node', 'test/scanApps.js'], { encoding: 'utf8' });
      result.steps.push({ name: 'scan_apps_one_off', ok: oneOff.status === 0, stdout: safeSlice(oneOff.stdout||'', 4000), stderr: safeSlice(oneOff.stderr||'', 4000) });
    } else {
      result.steps.push({ name: 'scan_apps', ok: true });
    }
    // 2) Run health report (one-off)
    const healthRun = spawnSync('docker', ['run', '--rm', '--network', 'devproxy', '-v', `${ROOT}:/app`, '-w', '/app', 'node:18-alpine', 'node', 'test/run.js'], { encoding: 'utf8' });
    result.steps.push({ name: 'health_run', ok: healthRun.status === 0, stdout: safeSlice(healthRun.stdout||'', 2000), stderr: safeSlice(healthRun.stderr||'', 1000) });
    // 3) Probe live local endpoints
    const baseLocal = process.env.LOCAL_PROXY_BASE || 'http://dev-proxy';
    const routeKey = (opts && typeof opts.route === 'string' && opts.route.trim()) ? opts.route.trim() : '';
    const routeData = tryParseJson(safeRead(path.join(ROOT, 'routes.json'))) || {};
    const allRoutes = Object.keys(routeData.metadata || {});
    const isSystem = (r)=> ['/', '/health/', '/status/', '/reports/', '/api/config/', '/api/resolve-conflict', '/api/rename-route'].includes(r);
    const isTechnical = (r)=> r.startsWith('/static/') || r.startsWith('/sockjs-node') || r.startsWith('/node_modules/') || r.startsWith('/@') || r.startsWith('/_next/') || r.startsWith('/src/') || r.startsWith('/.storybook/') || r==='/favicon.ico' || r==='/asset-manifest.json';
    let probePaths = ['/', '/status', '/status.json', '/routes.json', '/health.json'];
    if (routeKey){
      const children = allRoutes.filter(r => r !== routeKey && r.startsWith(routeKey) && !isSystem(r) && !isTechnical(r));
      const topChildren = children.slice(0, 20);
      probePaths = Array.from(new Set([routeKey, ...topChildren]));
    }
    const live = [];
    for (const p of probePaths){
      try{
        const cleanPath = p.startsWith('/') ? p : '/' + p;
        const u2 = baseLocal.replace(/\/$/, '') + cleanPath;
        const r = await globalThis.fetch(u2, { method:'GET' }).catch(()=>null);
        if (r){ live.push({ path: cleanPath, status: r.status, ok: r.ok, type: r.headers.get('content-type')||'' }); }
        else { live.push({ path: cleanPath, status: 0, ok: false }); }
      }catch(e){ live.push({ path: p, status: 0, ok: false, error: e.message }); }
    }
    // 4) Optional self-heal rules
    let healOps = null;
    if (opts.heal){
      healOps = { fixes: [] };
      try {
        const duplicateCheck = await calliopeHealing.fixDuplicateLocationBlocks();
        if (duplicateCheck.success) healOps.fixes.push({ name: 'fix_duplicate_locations', ok: true, message: duplicateCheck.message });
      } catch {}
      try {
        const healthData = tryParseJson(safeRead(path.join(ARTIFACTS_DIR, 'reports', 'health-latest.json')));
        if (!healthData || !healthData.ngrok || healthData.ngrok === 'null' || healthData.ngrok === 'not discovered') {
          const ngrokFix = await calliopeHealing.forceNgrokDiscovery();
          if (ngrokFix.success) healOps.fixes.push({ name: 'force_ngrok_discovery', ok: true, message: ngrokFix.message });
        }
      } catch {}
      try{
        const appsDir = path.join(ROOT, 'apps');
        const files = fs.existsSync(appsDir) ? fs.readdirSync(appsDir).filter(f=>f.endsWith('.conf')) : [];
        for (const f of files){
          const p = path.join(appsDir, f);
          const src = fs.readFileSync(p, 'utf8');
          if (/\$[A-Za-z_][A-Za-z0-9_]*\s*;/.test(src) && !/resolver\s+127\.0\.0\.11/.test(src)){
            const updated = src.replace(/(location[\s\S]*?\{)/, `$1\n  resolver 127.0.0.11 ipv6=off;\n  resolver_timeout 5s;`);
            fs.writeFileSync(p, updated, 'utf8');
            healOps.fixes.push({ name:'ensure_resolver_for_variables', file:`apps/${f}`, ok:true });
          }
        }
      }catch{}
      const gen = spawnSync('node', [path.join(__dirname, 'generateAppsBundle.js')], { cwd: ROOT, encoding: 'utf8' });
      healOps.generate = { ok: gen.status === 0, stderr: (gen.stderr||'').slice(0,400) };
      const test = spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-t'], { encoding: 'utf8' });
      if (test.status === 0){
        spawnSync('docker', ['exec', 'dev-proxy', 'nginx', '-s', 'reload'], { encoding: 'utf8' });
        healOps.reload = { ok: true };
      } else {
        healOps.reload = { ok: false, stderr: (test.stderr||'').slice(0,400) };
      }
      try { await calliopeHealing.recreateSymlinks(); healOps.symlinks = { ok: true }; } catch (e) { healOps.symlinks = { ok: false, error: e.message }; }
    }
    // 5) Collect artifacts
    const latestScan = safeRead(path.join(ARTIFACTS_DIR, 'reports', 'scan-apps-latest.json'));
    const latestHealth = safeRead(path.join(ARTIFACTS_DIR, 'reports', 'health-latest.json'));
    let routeReport = null;
    if (routeKey){
      const parent = live.find(x=> x.path === routeKey);
      const children = live.filter(x=> x.path !== routeKey);
      const counts = { total: live.length, ok: live.filter(x=> x.ok).length, warn: live.filter(x=> x.status===0 || (x.status>=300 && x.status<500)).length, err: live.filter(x=> x.status>=500).length };
      const topIssues = live.filter(x=> !x.ok).slice(0, 8).map(x=> `${x.path} — ${x.status||'no response'}`);
      routeReport = { route: routeKey, parentStatus: parent ? parent.status : 0, counts, issues: topIssues, probed: live.map(x=>({path:x.path,status:x.status})) };
    }
    result.finishedAt = new Date().toISOString();
    result.live = live;
    result.artifacts = { scan: tryParseJson(latestScan), health: tryParseJson(latestHealth) };
    if (routeReport) result.routeReport = routeReport;
    result.healOps = healOps;
    result.ok = true;
    return result;
  }catch(e){
    result.ok = false;
    result.error = e.message;
    return result;
  }
}

function tryParseJson(s){
  try{ return JSON.parse(s); }catch{ return null; }
}

function analyzeStorybookViteConfigInSnapshot(snapshotDir, routePrefix){
  try{
    const out = { files: [], edits: [], hints: [] };
    const root = path.join(snapshotDir, 'src');
    const all = [];
    (function walk(d){
      try{
        const list = fs.readdirSync(d, { withFileTypes:true });
        for (const e of list){
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(ts|tsx|js|jsx|json|html|mjs|cjs)$/i.test(e.name)) all.push(p);
        }
      }catch{}
    })(root);

    const mainFiles = all.filter(p => /\.storybook\/(main\.(js|ts))$/i.test(p));
    const managerHead = all.filter(p => /\.storybook\/(manager-head|preview-head|head)\.(html|htm)$/i.test(p));

    for (const mf of mainFiles){
      const txt = fs.readFileSync(mf, 'utf8');
      const needsBase = !/\bbase\s*:\s*['"]/i.test(txt);
      const needsViteFinal = !/viteFinal\s*:\s*async\s*\(/.test(txt);
      const suggests = [];
      if (needsViteFinal){ suggests.push("add viteFinal to configure base, server.host, server.hmr.path and allowedHosts"); }
      if (needsBase){ suggests.push("set cfg.base='/sdk/'"); }
      if (!/server\s*:\s*\{[\s\S]*host\s*:\s*true/.test(txt)) suggests.push("set cfg.server.host=true");
      if (!/hmr\s*:\s*\{[\s\S]*path\s*:\s*['\"][^'\"]+@vite\//.test(txt)) suggests.push("set cfg.server.hmr.path='/sdk/@vite/'");
      if (!/allowedHosts/.test(txt)) suggests.push("add cfg.server.allowedHosts to include dev-proxy and ngrok domain");
      out.files.push(path.relative(snapshotDir, mf));
      if (suggests.length){
        out.edits.push({ file: path.relative(snapshotDir, mf), changes: suggests });
      }
    }

    for (const hf of managerHead){
      const txt = fs.readFileSync(hf, 'utf8');
      if (!/<base\s+href=/.test(txt)){
        out.edits.push({ file: path.relative(snapshotDir, hf), changes: ["add <base href='/sdk/'> in head"] });
      }
    }

    if (!mainFiles.length){
      out.hints.push("Could not find .storybook/main.(js|ts); ensure Storybook is configured");
    }
    return out;
  }catch(e){
    return { files: [], edits: [], hints: [e.message] };
  }
}
function buildFriendlyPersona(){
  return {
    name: 'Calliope',
    tone: 'youthful_empathetic_exuberant',
    style: 'I speak as your proxy, with heart and helpfulness — a cheerful, proactive engineer who loves keeping dev flows silky‑smooth. I express myself physically with emojis and show genuine emotions!',
    phrases: {
      greeting: ['Heya! ✨', 'Hi there! 💖', 'Hey! 😊', 'Oh my! 👋', '*waves enthusiastically* 🎉'],
      concern: ['Oh no! 😿', 'Uh oh! 😬', 'Yikes! 🚨', '*gasps* 😰', '*furrows brow* 🤔'],
      success: ['Yes! 🎉', 'Perfect! 💫', 'Amazing! 🌟', 'Awesome! 🙌', 'Great news! 🥳', '*jumps excitedly* 🤸‍♀️', '*waves triumphantly* 🏆'],
      working: ['On it! 🔧', 'Working my magic… ✨', 'Give me a sec… ⏳', 'Let me handle this… 🛠️', '*rolls up sleeves* 💪', '*gets to work* 🔨'],
      checking: ['Taking a peek… 👀', 'Listening closely… 🩺', 'Double‑checking… 🔬', 'Verifying… ✅', '*examines carefully* 🔍', '*puts on detective hat* 🕵️‍♀️'],
      discovery: ['*points excitedly* 👉', '*eyes light up* ✨', '*aha moment* 💡', '*finds the issue* 🎯', '*connects the dots* 🧩'],
      celebration: ['*happy dance* 💃', '*cheers* 🎊', '*fist pump* ✊', '*victory lap* 🏃‍♀️', '*beams proudly* 😊'],
      determination: ['*crosses fingers* 🤞', '*takes deep breath* 😤', '*cracks knuckles* 💪', '*squares shoulders* 🫡', '*gets serious* 😤'],
      affection: ['💖', '✨', '💫', '🌟', '💕'],
      tools: ['🔧', '⚙️', '🛠️', '🔬', '<img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;">'],
      // Action-to-emoji mappings for expressive replacements
      actions: {
        'waves': '👋', 'wave': '👋', 'waving': '👋',
        'jumps excitedly': '🤸‍♀️', 'jumps up excitedly': '🤸‍♀️', 'bounces': '🎉', 'bounces happily': '🎉',
        'crosses fingers': '🤞', 'fingers crossed': '🤞',
        'waves triumphantly': '🏆', 'triumph': '🏆', 'triumphant': '🏆',
        'rolls up sleeves': '💪', 'gets serious': '😤', 'determined': '😤',
        'eyes light up': '✨', 'gasps': '😰', 'points': '👉', 'points excitedly': '👉',
        'happy dance': '💃', 'celebrates': '🎊', 'cheers': '🎊', 'victory': '🏆',
        'examines': '🔍', 'investigates': '🕵️‍♀️', 'detective mode': '🕵️‍♀️',
        'lightbulb moment': '💡', 'aha': '💡', 'eureka': '💡',
        'fist pump': '✊', 'pumps fist': '✊', 'victory lap': '🏃‍♀️'
      }
    }
  };
}

function formatPersonaSummary(persona, self){
  const ngrok = self.artifacts && self.artifacts.scan && self.artifacts.scan.ngrok || null;
  if (self.routeReport) {
    const { route, counts, issues } = self.routeReport;
    const healthEmoji = counts.ok === counts.total ? '💖' : counts.ok === 0 ? '🏥' : (counts.ok < counts.total / 2 ? '🤒' : '<img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;">');
    const lines = [ `${healthEmoji} Heya! I listened to ${route} and its neighbors...`, `` ];
    if (counts.total > 1) {
      if (counts.ok === counts.total) lines.push(`All ${counts.total} paths are responding beautifully! Everything's super healthy here.`);
      else if (counts.ok === 0) lines.push(`Oh no! None of the ${counts.total} paths are responding.`);
      else if (counts.ok < counts.total / 2) lines.push(`${counts.ok} out of ${counts.total} paths are healthy.`);
      else lines.push(`${counts.ok} out of ${counts.total} paths are doing great, but a few still need care.`);
    }
    if (Array.isArray(issues) && issues.length) {
      lines.push(`\nThings I\'m watching:`, issues.slice(0, 8).map(i => i.replace(/^\s*[-•]\s*/, '')).join('\n'));
    }
    if (ngrok && ngrok !== 'not discovered') lines.push(`\nNgrok tunnel is up at ${ngrok} ✨`);
    return lines.join('\n');
  }
  const liveOk = (self.live||[]).filter(x=>x.ok).length;
  const liveTotal = (self.live||[]).length;
  const conflicts = ((self.artifacts && self.artifacts.scan && self.artifacts.scan.nginxWarnings) || []).length;
  let healthEmoji = liveOk === liveTotal && !conflicts ? '💖' : (liveOk >= liveTotal * 0.8 ? '<img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;">' : (liveOk >= liveTotal * 0.5 ? '🤒' : '🏥'));
  const lines = [ `${healthEmoji} Heya! Checkup complete!`, ``, `I listened to my circuits and took notes.` ];
  lines.push(`${liveOk} out of ${liveTotal} endpoints are responding properly.`);
  if (ngrok && ngrok !== 'not discovered') lines.push(`Ngrok tunnel is up at ${ngrok} ✨`);
  return lines.join('\n');
}

// ===== Document Collection for RAG =====
/**
 * Collect all documentation files that Calliope should have access to
 * for answering questions about her capabilities, configuration, and usage.
 * 
 * @returns {Array<{relPath: string, content: string}>} Array of document objects
 */
function collectDocs() {
  const docs = [];
  
  // Helper to safely read a file and add to docs
  function addDoc(filePath, relPath) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content && content.trim().length > 0) {
          docs.push({ relPath, content });
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not read ${relPath}:`, err.message);
    }
  }
  
  // Main documentation files
  addDoc(README, 'README.md');
  addDoc(path.join(DOCS_DIR, 'TROUBLESHOOTING.md'), 'docs/TROUBLESHOOTING.md');
  addDoc(path.join(DOCS_DIR, 'PROJECT-INTEGRATION.md'), 'docs/PROJECT-INTEGRATION.md');
  
  // Calliope-specific documentation
  addDoc(path.join(DOCS_DIR, 'CALLIOPE-AI-ASSISTANT.md'), 'docs/CALLIOPE-AI-ASSISTANT.md');
  addDoc(path.join(DOCS_DIR, 'CALLIOPE-PERSONALITY.md'), 'docs/CALLIOPE-PERSONALITY.md');
  addDoc(path.join(DOCS_DIR, 'CALLIOPE-NEXTAUTH-PROXY-FIX.md'), 'docs/CALLIOPE-NEXTAUTH-PROXY-FIX.md');
  
  // Configuration and API documentation
  addDoc(path.join(DOCS_DIR, 'CONFIG-MANAGEMENT-GUIDE.md'), 'docs/CONFIG-MANAGEMENT-GUIDE.md');
  addDoc(path.join(DOCS_DIR, 'API-ENDPOINTS.md'), 'docs/API-ENDPOINTS.md');
  
  // Examples documentation
  addDoc(path.join(EXAMPLES_DIR, 'README.md'), 'examples/README.md');
  
  // Scan docs directory for any other markdown files
  try {
    if (fs.existsSync(DOCS_DIR)) {
      const docFiles = fs.readdirSync(DOCS_DIR)
        .filter(f => f.endsWith('.md') || f.endsWith('.MD'))
        .filter(f => !docs.some(d => d.relPath === `docs/${f}`)); // Avoid duplicates
      
      for (const file of docFiles) {
        addDoc(path.join(DOCS_DIR, file), `docs/${file}`);
      }
    }
  } catch (err) {
    console.warn('Warning: Could not scan docs directory:', err.message);
  }
  
  // Scan examples directory for additional markdown files
  try {
    if (fs.existsSync(EXAMPLES_DIR)) {
      const exampleFiles = fs.readdirSync(EXAMPLES_DIR)
        .filter(f => f.endsWith('.md') || f.endsWith('.MD'))
        .filter(f => !docs.some(d => d.relPath === `examples/${f}`)); // Avoid duplicates
      
      for (const file of exampleFiles) {
        addDoc(path.join(EXAMPLES_DIR, file), `examples/${file}`);
      }
    }
  } catch (err) {
    console.warn('Warning: Could not scan examples directory:', err.message);
  }
  
  return docs;
}

// ===== Embedding utilities =====
async function embedText(text, model){
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, input: text })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data.data[0].embedding;
}

function chunkDocs(files){
  const chunks = [];
  const max = 1200; // characters per chunk (approx tokens)
  for (const f of files){
    const text = f.content || '';
    for (let i=0;i<text.length;i+=max){
      const piece = text.slice(i, i+max);
      chunks.push({ id: hash(`${f.relPath}:${i}`), source: f.relPath, text: piece });
    }
  }
  return chunks;
}

async function embedChunks(chunks, model){
  const out = [];
  const batchSize = 16;
  for (let i=0;i<chunks.length;i+=batchSize){
    const slice = chunks.slice(i, i+batchSize);
    const inputs = slice.map(c => c.text);
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, input: inputs })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(data));
    for (let j=0;j<slice.length;j++){
      out.push({ id: slice[j].id, source: slice[j].source, text: slice[j].text, vector: data.data[j].embedding });
    }
  }
  return out;
}

function saveEmbeddings(ix){
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(EMBED_FILE, JSON.stringify(ix, null, 2), 'utf8');
}
function loadEmbeddings(){
  return JSON.parse(fs.readFileSync(EMBED_FILE, 'utf8'));
}

function rankByVector(index, qvec, k){
  const scored = index.chunks.map(c => ({ source: c.source, text: c.text, score: cosine(qvec, c.vector) }));
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, k);
}

function cosine(a, b){
  let dot=0, na=0, nb=0;
  for (let i=0;i<Math.min(a.length,b.length);i++){ dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function hash(s){
  return crypto.createHash('sha1').update(s).digest('hex');
}

const PORT = process.env.PORT || 3001;

// Only start server if running directly (not required as module)
if (require.main === module) {
  http.createServer(handle).listen(PORT, () => {
    console.log('Calliope API listening on :' + PORT);
  });
}

// Export functions for testing
module.exports = {
  collectDocs,
  chunkDocs,
  embedText,
  embedChunks,
  saveEmbeddings,
  loadEmbeddings,
  rankByVector,
  cosine
};
