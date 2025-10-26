/**
 * Calliope Advanced Self-Healing System
 * 
 * This module extends Calliope's capabilities with:
 * - Knowledge-based pattern recognition for common issues
 * - Multi-tier healing strategies
 * - Feedback loop for continuous improvement
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

const ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT, '.artifacts');
const CALLIOPE_DIR = path.join(ARTIFACTS_DIR, 'calliope');
const KB_FILE = path.join(CALLIOPE_DIR, 'healing-kb.json');
const AUDITS_DIR = path.join(ARTIFACTS_DIR, 'audits');
const RESOURCES_DIR = path.join(CALLIOPE_DIR, 'resources');
const AUDIT_HISTORY_DIR = path.join(CALLIOPE_DIR, 'audit-history');

// Regenerate nginx bundle and reload - ensures Calliope's fixes take effect
async function regenerateNginxBundle() {
  try {
    console.log('🔧 Regenerating nginx bundle...');
    // Prefer running directly inside this container (volume already mounted at /app)
    try {
      execSync('node utils/generateAppsBundle.js', { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      // Fallback to docker-run only if direct node execution is unavailable
      execSync('docker run --rm --network devproxy -v "' + ROOT + ':/app" -w /app node:18-alpine node utils/generateAppsBundle.js', { 
        encoding: 'utf8' 
      });
    }

    // Test the new configuration
    console.log('🧪 Testing nginx configuration...');
    execSync('docker exec dev-proxy nginx -t', { encoding: 'utf8' });

    // Reload nginx to apply changes
    console.log('🔄 Reloading nginx...');
    execSync('docker exec dev-proxy nginx -s reload', { encoding: 'utf8' });

    console.log('✅ Nginx bundle regenerated and reloaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to regenerate nginx bundle:', error.message);
    // Soft reload fallback to keep healthy endpoints online
    try {
      console.log('🩹 Attempting soft reload to preserve healthy routes...');
      execSync('docker exec dev-proxy nginx -s reload', { encoding: 'utf8' });
      console.log('💫 Soft reload completed');
      return false;
    } catch (reloadError) {
      console.error('💥 Even soft reload failed:', reloadError.message);
      throw error;
    }
  }
}
const HEALING_LOG_FILE = path.join(CALLIOPE_DIR, 'healing-log.json');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Ensure directories exist
if (!fs.existsSync(CALLIOPE_DIR)) {
  fs.mkdirSync(CALLIOPE_DIR, { recursive: true });
}
if (!fs.existsSync(AUDITS_DIR)) {
  fs.mkdirSync(AUDITS_DIR, { recursive: true });
}
if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}
if (!fs.existsSync(AUDIT_HISTORY_DIR)) {
  fs.mkdirSync(AUDIT_HISTORY_DIR, { recursive: true });
}

// Initialize healing log if it doesn't exist
if (!fs.existsSync(HEALING_LOG_FILE)) {
  fs.writeFileSync(HEALING_LOG_FILE, JSON.stringify({
    version: "1.0",
    entries: []
  }, null, 2));
}

/**
 * Ensure generic patterns are present in the knowledge base
 * Guardrails: patterns are generic (no app-specific file paths) and map to
 * automated, reversible proxy-side healing first.
 */
function ensureGenericPatterns() {
  const kb = loadKnowledgeBase();
  const have = new Set((kb.patterns || []).map(p => p.id));
  const seed = [];

  if (!have.has('missing_basepath_assets')) {
    seed.push({
      id: 'missing_basepath_assets',
      detection: {
        // Signals observed when absolute asset paths are used under a subpath proxy
        signals: [
          String.raw`X-Forwarded-Prefix`,
          String.raw`A tree hydrated but some attributes .* hydration-mismatch`,
        ],
        effects: [
          '404',
          'redirect loops or mixed content types for static assets'
        ]
      },
      solutions: [{
        id: 'apply_asset_prefix_guards',
        description: 'Add generic directory guards and subpath routing resilience for static assets',
        implementation: { type: 'automated', function: 'applyGenericDirectoryGuards', params: [] }
      }, {
        id: 'fix_subpath_absolute_routing',
        description: 'Ensure proxy forwards API and dev paths and sets X-Forwarded-Prefix',
        implementation: { type: 'automated', function: 'fixSubpathAbsoluteRouting', params: [] }
      }]
    });
  }

  // Storybook + Vite under a subpath pattern (generic; no hardcoded route)
  if (!have.has('storybook_vite_subpath')) {
    seed.push({
      id: 'storybook_vite_subpath',
      detection: {
        signals: [
          String.raw`/(?:^|\s)/@vite/`,
          String.raw`/(?:^|\s)/@id/`,
          String.raw`/(?:^|\s)/@fs/`,
          String.raw`/(?:^|\s)/node_modules/`,
          String.raw`iframe\.html\?viewMode=story`,
          String.raw`vite-inject-mocker-entry\.js`
        ],
        effects: [
          'Storybook iframe fails to load under subpath',
          'HMR and Vite client fail through proxy',
          '404s for @vite/@id/@fs routes'
        ]
      },
      solutions: [{
        id: 'apply_storybook_vite_proxy_guards',
        description: 'Ensure generic subpath proxy blocks for Storybook+Vite (prefix-agnostic)',
        implementation: { type: 'automated', function: 'applyStorybookViteProxyGuards', params: [] }
      }, {
        id: 'ensure_static_vite_root_pass_throughs',
        description: 'Ensure root /@id and /@vite use static upstream and minimal headers',
        implementation: { type: 'automated', function: 'ensureStaticViteRootPassThroughs', params: [] }
      }, {
        id: 'run_storybook_proxy_tests',
        description: 'Run regression sanity/smoke tests for Storybook proxy',
        implementation: { type: 'automated', function: 'runStorybookProxyTests', params: [] }
      }]
    });
  }

  // Hydration mismatch due to basePath inconsistency
  if (!have.has('hydration_mismatch_basepath')) {
    seed.push({
      id: 'hydration_mismatch_basepath',
      detection: {
        signals: [
          String.raw`hydration-mismatch`,
          String.raw`A tree hydrated but some attributes`,
          String.raw`data-nimg="fill"`,
          String.raw`X-Forwarded-Prefix`
        ],
        effects: [
          'SSR/CSR render mismatch for asset URLs',
          'Images or links without basePath in SSR'
        ]
      },
      solutions: [{
        id: 'unify_basepath_handling',
        description: 'Ensure SSR-safe basePath and basePath-aware image/link helpers (app-side change)',
        implementation: { type: 'manual' }
      }, {
        id: 'proxy_forward_xfp_and_next_block',
        description: 'Proxy-side: add X-Forwarded-Prefix and /<prefix>/_next support for subpath apps',
        implementation: { type: 'automated', function: 'ensureRouteForwardedPrefixAndNext', params: [] }
      }]
    });
  }

  // Mixed Content Errors (HTTP resources on HTTPS pages)
        if (!have.has('mixed_content_errors')) {
          seed.push({
            id: 'mixed_content_errors',
            detection: {
              signals: [
                String.raw`Mixed Content`,
                String.raw`was loaded over HTTPS, but requested an insecure`,
                String.raw`This request has been blocked`,
                String.raw`http://.*\.ngrok\.app`,
                String.raw`ERR_NETWORK_CHANGED`
              ],
              effects: [
                'Assets fail to load on HTTPS pages',
                'Browser blocks HTTP requests',
                'Stylesheet and script tags fail to load',
                'ERR_NETWORK_CHANGED errors from failed requests'
              ]
            },
            solutions: [{
              id: 'fix_nginx_absolute_redirects',
              description: 'Disable nginx absolute_redirect to prevent HTTP URLs in redirect headers',
              implementation: { type: 'automated', function: 'fixNginxAbsoluteRedirects', params: [] }
            }, {
              id: 'fix_x_forwarded_proto',
              description: 'Set X-Forwarded-Proto to https for apps behind HTTPS proxies',
              implementation: { type: 'automated', function: 'fixXForwardedProto', params: [] }
            }, {
              id: 'run_mixed_content_test',
              description: 'Run browser test to detect mixed content errors',
              implementation: { type: 'automated', function: 'runMixedContentTest', params: [] }
            }]
          });
        }

        if (!have.has('redirect_loop_errors')) {
          seed.push({
            id: 'redirect_loop_errors',
            detection: {
              signals: [
                String.raw`ERR_TOO_MANY_REDIRECTS`,
                String.raw`too many redirects`,
                String.raw`redirect loop`,
                String.raw`Redirect limit exceeded`,
                String.raw`308 Permanent Redirect.*/_next`
              ],
              effects: [
                'Assets fail to load with redirect errors',
                'Browser console shows ERR_TOO_MANY_REDIRECTS',
                '308 redirects on /_next/ paths',
                'Infinite redirect loop between paths with/without trailing slash'
              ]
            },
            solutions: [{
              id: 'fix_redirect_loop',
              description: 'Fix nginx proxy_pass configuration to prevent redirect loops on /_next/ paths',
              implementation: { type: 'automated', function: 'fixRedirectLoop', params: [] }
            }]
          });
        }

        if (!have.has('nextjs_auth_errors')) {
          seed.push({
            id: 'nextjs_auth_errors',
            detection: {
              signals: [
                String.raw`\[next-auth\]\[error\]\[CLIENT_FETCH_ERROR\]`,
                String.raw`Unexpected token '<', "<!DOCTYPE "`,
                String.raw`/api/auth/session.*not valid JSON`,
                String.raw`POST.*\/api\/auth\/_log.*500`,
                String.raw`next-auth.*errors#client_fetch_error`
              ],
              effects: [
                'Auth endpoints return HTML instead of JSON',
                'Session management fails',
                'Auth logging returns 500 errors',
                'User authentication broken'
              ]
            },
            solutions: [{
              id: 'diagnose_nextjs_auth',
              description: 'App-level Next.js auth configuration issue - recommend config fixes',
              implementation: { type: 'recommendation', guidance: 'Next.js Auth Configuration Issues Detected' }
            }]
          });
        }

  if (seed.length) {
    for (const p of seed) {
      addPatternFromHealing(p.id, p.solutions[0], true, {
        signals: p.detection.signals,
        effects: p.detection.effects
      });

      // Optionally add any additional solutions beyond the first
      if (p.solutions.length > 1) {
        for (let i = 1; i < p.solutions.length; i++) {
          addPatternFromHealing(p.id, p.solutions[i], false, {});
        }
      }
    }
  }
}

/**
 * Create a filtered code snapshot of a host project into Calliope resources dir using Docker.
 * - Reads from host path (read-only)
 * - Copies only source and important files into .artifacts/calliope/resources/<stamp>/src
 * - Excludes heavy directories (node_modules, .git, dist, build, .next, out, coverage, public, tmp, .cache)
 */
async function snapshotProjectToResources(hostProjectPath, outName) {
  try {
    if (!hostProjectPath || !fs.existsSync(hostProjectPath)) {
      return { success: false, message: 'hostProjectPath does not exist' };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const base = outName || (path.basename(hostProjectPath.replace(/\/?$/, '')) + '_' + stamp);
    const dest = path.join(RESOURCES_DIR, base);
    fs.mkdirSync(dest, { recursive: true });

    const tmpDir = path.join(CALLIOPE_DIR, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const scriptPath = path.join(tmpDir, 'copy-src.js');
    const js = `
const fs = require('fs');
const path = require('path');
const EXCLUDE_DIRS = new Set(['node_modules','.git','dist','build','.next','out','coverage','public','tmp','.cache','.output']);
const INCLUDE_EXTS = new Set(['.js','.jsx','.ts','.tsx','.mjs','.cjs','.json','.md','.yml','.yaml','.html','.css','.scss','.xml','.sh','.sql']);
function shouldInclude(filePath, stat){
  if (!stat.isFile()) return false;
  const base = path.basename(filePath);
  if (base.startsWith('.')) {
    if (/^\.env(\..*)?$/.test(base)) return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  return INCLUDE_EXTS.has(ext);
}
async function walk(srcDir, outDir){
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  for (const e of entries){
    const srcPath = path.join(srcDir, e.name);
    const outPath = path.join(outDir, e.name);
    if (e.isDirectory()){
      if (EXCLUDE_DIRS.has(e.name)) continue;
      await walk(srcPath, outPath);
    } else if (e.isFile()){
      const st = await fs.promises.stat(srcPath);
      if (shouldInclude(srcPath, st)){
        await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
        await fs.promises.copyFile(srcPath, outPath);
      }
    }
  }
}
(async()=>{
  await fs.promises.mkdir('/out/src', { recursive: true });
  await walk('/src', '/out/src');
})().catch(e=>{ console.error(e && (e.stack||e)); process.exit(1); });
`;
    fs.writeFileSync(scriptPath, js, 'utf8');

    const cmd = `docker run --rm -v "${hostProjectPath}:/src:ro" -v "${dest}:/out" -v "${scriptPath}:/script.js:ro" node:20-alpine node /script.js`;
    execSync(cmd, { encoding: 'utf8' });

    return { success: true, message: 'Snapshot created', dest };
  } catch (e) {
    return { success: false, message: `snapshotProjectToResources failed: ${e.message}` };
  }
}

/**
 * Analyze a code snapshot directory for proxy-compat issues and return suggestions.
 * Heuristics only; non-destructive. Input should be a path created by snapshotProjectToResources.
 */
async function analyzeSnapshotForProxyCompatibility(snapshotDir) {
  try {
    const srcRoot = path.join(snapshotDir, 'src');
    const suggestions = [];
    if (!fs.existsSync(srcRoot)) return { success:false, message:'snapshot src not found', suggestions: [] };

    const files = [];
    (function walk(dir){
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries){
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|md|html|css|scss)$/i.test(e.name)) files.push(p);
      }
    })(srcRoot);

    // Detect Storybook presence
    const hasStorybook = fs.existsSync(path.join(srcRoot, '.storybook'));

    for (const f of files){
      let txt = '';
      try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
      const projectRel = path.relative(srcRoot, f).replace(/^\.\//, '');
      if (/next\.config\.(js|mjs)/.test(path.basename(f))) {
        if (!/basePath\s*:/.test(txt)) {
          suggestions.push({ file: projectRel, issue: 'Missing basePath in Next config', fix: 'Add basePath and assetPrefix using NEXT_PUBLIC_BASE_PATH env' });
        }
        if (/basePath\s*:\s*['"]/i.test(txt) && !/process\.env\.NEXT_PUBLIC_BASE_PATH/.test(txt)) {
          suggestions.push({ file: projectRel, issue: 'Hardcoded basePath', fix: 'Use process.env.NEXT_PUBLIC_BASE_PATH' });
        }
      }
      if (/(<img\b[^>]*\ssrc=\s*["']\/(?!_next\/)\S+)/i.test(txt)) {
        suggestions.push({ file: projectRel, issue: 'Raw <img> with absolute src', fix: 'Wrap with basePath-aware image/component or prefix properly' });
      }
      if (/(<Image\b[^>]*\ssrc=\s*["']\/(?!_next\/)\S+)/i.test(txt)) {
        suggestions.push({ file: projectRel, issue: 'next/image with absolute src', fix: 'Route through basePath-aware helper' });
      }
      if (/\bfetch\(\s*["']\/(api|graphql)\//i.test(txt)) {
        suggestions.push({ file: projectRel, issue: 'Absolute API path', fix: 'Use basePath-aware API URL builder' });
      }

      // Storybook-specific heuristics
      if (hasStorybook && /\.storybook\//.test(projectRel)) {
        if (/manager-head\.html|preview-head\.html|head\.html/.test(projectRel)) {
          if (!/<base\s+href=["'][^"']+["']/.test(txt)) {
            suggestions.push({ file: projectRel, issue: 'Storybook missing <base href> for subpath', fix: 'Add a <base href> in head matching your deployed subpath (ideally from env)' });
          }
        }
        if (/main\.(js|ts)$/.test(projectRel)) {
          const mentionsVite = /builder:\s*'@storybook\/builder-vite'|viteFinal\s*\(/.test(txt);
          if (mentionsVite && !/base:\s*['"][^"']+["']/.test(txt)) {
            suggestions.push({ file: projectRel, issue: 'Vite base not set for subpath', fix: 'Set Vite config base to your subpath (e.g., from PUBLIC_BASE_PATH env)' });
          }
          if (mentionsVite) {
            if (!/server\s*:\s*\{[\s\S]*host\s*:\s*true/.test(txt)) {
              suggestions.push({ file: projectRel, issue: 'Vite server.host not enabled', fix: 'In viteFinal, set server.host = true (or start with --host) for non-localhost access' });
            }
            if (!/allowedHosts/.test(txt)) {
              suggestions.push({ file: projectRel, issue: 'Vite allowedHosts missing', fix: 'In viteFinal, set server.allowedHosts to include dev-proxy and your ngrok domain' });
            }
            if (!/hmr\s*:\s*\{[\s\S]*path\s*:\s*['"][^"']+@vite\/["'][\s\S]*\}/.test(txt)) {
              suggestions.push({ file: projectRel, issue: 'Vite HMR path not set for subpath', fix: 'In viteFinal, set server.hmr.path to `${PUBLIC_BASE_PATH}/@vite/` (or your subpath)' });
            }
          } else {
            // No viteFinal present; suggest adding a block tailored for subpath + ngrok
            suggestions.push({
              file: projectRel,
              issue: 'Storybook Vite config missing viteFinal',
              fix: 'Add viteFinal with subpath-aware base, server.host=true, allowedHosts for proxy/ngrok, and server.hmr.path="${PUBLIC_BASE_PATH}/@vite/"'
            });
          }
        }
      }
    }

    return { success: true, suggestions };
  } catch (e) {
    return { success:false, message: e.message, suggestions: [] };
  }
}

/**
 * Snapshot a running container's project path into Calliope resources (filtered) using tar piping.
 */
async function snapshotContainerProject(containerName, srcPathInContainer, outName) {
  try {
    if (!containerName || !srcPathInContainer) return { success:false, message:'containerName and srcPathInContainer required' };
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const base = outName || (`${containerName.replace(/[^a-zA-Z0-9_-]/g,'_')}_${stamp}`);
    const dest = path.join(RESOURCES_DIR, base);
    fs.mkdirSync(path.join(dest, 'src'), { recursive: true });

    const excludes = [
      '--exclude=node_modules', '--exclude=.git', '--exclude=dist', '--exclude=build', '--exclude=.next', '--exclude=out', '--exclude=coverage', '--exclude=public', '--exclude=tmp', '--exclude=.cache', '--exclude=.output'
    ].join(' ');

    const cmd = `docker exec ${containerName} sh -lc "cd ${srcPathInContainer} 2>/dev/null && tar -cf - ${excludes} ." | tar -C ${dest}/src -xf -`;
    execSync(cmd, { encoding: 'utf8' });
    return { success:true, dest };
  } catch (e) {
    return { success:false, message: `snapshotContainerProject failed: ${e.message}` };
  }
}

/**
 * High-level: snapshot+analyze from a container.
 */
async function backupAndAnalyzeContainerProject({ containerName, srcPathInContainer, outName } = {}) {
  const snap = await snapshotContainerProject(containerName, srcPathInContainer, outName);
  if (!snap.success) return { success:false, message: snap.message };
  const analysis = await analyzeSnapshotForProxyCompatibility(snap.dest);
  return { success:true, snapshot: snap.dest, analysis };
}

/**
 * High-level: backup (snapshot) a host project into Calliope resources and analyze it.
 */
async function backupAndAnalyzeProject(hostProjectPath, outName) {
  const snap = await snapshotProjectToResources(hostProjectPath, outName);
  if (!snap.success) return { success:false, message: snap.message };
  const analysis = await analyzeSnapshotForProxyCompatibility(snap.dest);
  return { success:true, snapshot: snap.dest, analysis };
}

/**
 * Load the knowledge base
 */
function loadKnowledgeBase() {
  try {
    if (fs.existsSync(KB_FILE)) {
      return JSON.parse(fs.readFileSync(KB_FILE, 'utf8'));
    }
    console.log('Knowledge base not found, initializing empty');
    return { version: "1.0", lastUpdated: new Date().toISOString(), patterns: [] };
  } catch (e) {
    console.error('Error loading knowledge base:', e);
    return { version: "1.0", lastUpdated: new Date().toISOString(), patterns: [] };
  }
}

/**
 * Save the knowledge base
 */
function saveKnowledgeBase(kb) {
  kb.lastUpdated = new Date().toISOString();
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2));
}

/**
 * Log a healing attempt
 */
function logHealingAttempt(issue, solution, success, details = {}) {
  const log = JSON.parse(fs.readFileSync(HEALING_LOG_FILE, 'utf8'));
  log.entries.push({
    timestamp: new Date().toISOString(),
    issue,
    solution,
    success,
    details,
  });
  fs.writeFileSync(HEALING_LOG_FILE, JSON.stringify(log, null, 2));
}

/**
 * Check for patterns in logs and config that match known issues
 */
async function detectIssuesFromSignals(signals) {
  const kb = loadKnowledgeBase();
  const detectedIssues = [];

  for (const pattern of kb.patterns) {
    let matched = false;
    
    // Check if any signal matches pattern's detection signals
    if (pattern.detection && pattern.detection.signals) {
      for (const signalPattern of pattern.detection.signals) {
        const regex = new RegExp(signalPattern);
        for (const signal of signals) {
          if (regex.test(signal)) {
            detectedIssues.push({
              pattern,
              signal,
              match: signal.match(regex)
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }
  }

  return detectedIssues;
}

/**
 * Run diagnostics on the system
 */
async function runDiagnostics() {
  const results = {
    signals: [],
    containers: {},
    configs: {},
    artifacts: {},
  };

  // Check nginx config status
  try {
    const nginxTest = execSync('docker exec dev-proxy nginx -t 2>&1 || true', { encoding: 'utf8' });
    results.signals.push(nginxTest);
    results.configs.nginx_test = nginxTest;
  } catch (e) {
    results.signals.push(e.message);
  }

  // Check container statuses
  try {
    const containerStatus = execSync('docker ps --format "{{.Names}} {{.Status}}" | grep -E "dev-"', { encoding: 'utf8' });
    const lines = containerStatus.split('\\n').filter(Boolean);
    lines.forEach(line => {
      const [name, ...statusParts] = line.split(' ');
      const status = statusParts.join(' ');
      results.containers[name] = status;
      if (status.includes('unhealthy')) {
        results.signals.push(`Container ${name} is unhealthy`);
      }
    });
  } catch (e) {
    results.signals.push(e.message);
  }

  // Check ngrok status
  try {
    const ngrokLogs = execSync('docker logs dev-ngrok 2>&1 | grep "static domain" | tail -1', { encoding: 'utf8' });
    results.signals.push(ngrokLogs);
    
    const match = ngrokLogs.match(/using static domain '([^']+)'/);
    if (match && match[1]) {
      results.configs.ngrok_domain = match[1];
    } else {
      results.signals.push('No static ngrok domain found');
    }
  } catch (e) {
    results.signals.push('Error reading ngrok logs');
  }

  // Check symlinks and artifacts
  try {
    const routesJson = fs.existsSync(path.join(ROOT, 'routes.json'));
    const statusJson = fs.existsSync(path.join(ROOT, 'status.json'));
    results.artifacts.routesJson = routesJson;
    results.artifacts.statusJson = statusJson;
    
    if (!routesJson || !statusJson) {
      results.signals.push('Missing routes.json or status.json');
    }
  } catch (e) {
    results.signals.push(e.message);
  }

  return results;
}

/**
 * Fix duplicate location blocks in nginx configuration
 */
async function fixDuplicateLocationBlocks(configFile = 'config/default.conf', locationPattern = null) {
  try {
    const configPath = path.join(ROOT, configFile);
    if (!fs.existsSync(configPath)) {
      return { success: false, message: `Config file ${configFile} not found` };
    }

    let content = fs.readFileSync(configPath, 'utf8');
    
    // If no specific pattern provided, find duplicate locations
    if (!locationPattern) {
      // Extract location blocks for analysis
      const locationRegex = /location\s+([^{]+)\s*\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g;
      const locations = [];
      let match;
      while ((match = locationRegex.exec(content))) {
        locations.push({
          directive: match[1].trim(),
          block: match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
      
      // Find duplicates by directive
      const byDirective = {};
      locations.forEach(loc => {
        const key = loc.directive;
        if (!byDirective[key]) {
          byDirective[key] = [];
        }
        byDirective[key].push(loc);
      });
      
      // Process duplicates - keep the most detailed one
      let modified = false;
      const duplicates = Object.entries(byDirective).filter(([_, locs]) => locs.length > 1);
      
      for (const [directive, locs] of duplicates) {
        // Sort by complexity (length of block), keep the most complex one
        locs.sort((a, b) => b.block.length - a.block.length);
        
        // Keep the first (most complex) one, remove others
        for (let i = 1; i < locs.length; i++) {
          const loc = locs[i];
          console.log(`Removing duplicate location ${directive} at position ${loc.start}`);
          
          // Create a backup first
          const backupPath = `${configPath}.backup.${Date.now()}`;
          fs.writeFileSync(backupPath, content);
          
          // Remove the duplicate block (careful with nested blocks)
          content = content.substring(0, loc.start) + 
                   '# Removed duplicate location by Calliope healing\\n' + 
                   content.substring(loc.end);
          modified = true;
        }
      }
      
      if (!modified) {
        return { success: false, message: 'No duplicate locations found to fix' };
      }
      
      // Write modified content
      fs.writeFileSync(configPath, content);
      
      // Test nginx config
      const testResult = execSync('docker exec dev-proxy nginx -t', { encoding: 'utf8', stdio: 'pipe' }).toString();
      
      // Reload nginx if test passes
      if (testResult.includes('syntax is ok')) {
        execSync('docker exec dev-proxy nginx -s reload', { encoding: 'utf8' });
        return { success: true, message: 'Removed duplicate location blocks and reloaded nginx' };
      } else {
        return { success: false, message: 'Config fixed but nginx test failed', details: testResult };
      }
    }
    // If specific pattern provided, handle it directly
    else {
      // Implementation for specific pattern
      return { success: false, message: 'Specific pattern healing not yet implemented' };
    }
  } catch (e) {
    return { success: false, message: `Error fixing duplicate locations: ${e.message}` };
  }
}

/**
 * Force ngrok discovery by checking logs and updating reports
 */
async function forceNgrokDiscovery() {
  try {
    // Extract static domain from logs
    let ngrokDomain;
    try {
      const logs = execSync('docker logs dev-ngrok 2>&1 | grep "static domain" | tail -1', { encoding: 'utf8' });
      const match = logs.match(/using static domain '([^']+)'/);
      if (match && match[1]) {
        ngrokDomain = match[1];
        console.log(`Found ngrok domain: ${ngrokDomain}`);
      } else {
        // Try getting it from environment
        try {
          const envDomain = execSync('docker exec dev-ngrok printenv NGROK_STATIC_DOMAIN 2>/dev/null', { encoding: 'utf8' }).trim();
          if (envDomain) {
            ngrokDomain = envDomain;
            console.log(`Found ngrok domain from env: ${ngrokDomain}`);
          }
        } catch (e) {
          console.log('No domain in env var');
        }
      }
    } catch (e) {
      console.error('Error reading ngrok logs:', e);
    }

    if (!ngrokDomain) {
      return { success: false, message: 'Could not find ngrok domain in logs or environment' };
    }

    const ngrokUrl = `https://${ngrokDomain}`;

    // Update the latest reports
    const reportsDir = path.join(ARTIFACTS_DIR, 'reports');
    const files = [
      path.join(reportsDir, 'scan-apps-latest.json'),
      path.join(reportsDir, 'health-latest.json'),
    ];

    for (const file of files) {
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          data.ngrok = ngrokUrl;
          fs.writeFileSync(file, JSON.stringify(data, null, 2));
          console.log(`Updated ${file} with ngrok URL: ${ngrokUrl}`);
        } catch (e) {
          console.error(`Error updating ${file}:`, e);
        }
      } else {
        console.log(`Report file not found: ${file}`);
      }
    }

    // Ensure symlinks exist
    await recreateSymlinks();

    return { success: true, message: `Forced ngrok discovery: ${ngrokUrl}` };
  } catch (e) {
    return { success: false, message: `Error in force ngrok discovery: ${e.message}` };
  }
}

/**
 * Recreate symlinks to latest report files
 */
async function recreateSymlinks() {
  try {
    const reportsDir = path.join(ARTIFACTS_DIR, 'reports');
    
    // Find latest scan-apps file
    const scanAppFiles = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('scan-apps-') && f.endsWith('.json') && f !== 'scan-apps-latest.json')
      .sort()
      .reverse();

    // Find latest health file
    const healthFiles = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('health-') && f.endsWith('.json') && f !== 'health-latest.json')
      .sort()
      .reverse();

    // Create symlinks
    const routesTarget = path.join(reportsDir, scanAppFiles[0] || 'scan-apps-latest.json');
    const statusTarget = path.join(reportsDir, healthFiles[0] || 'health-latest.json');

    // Remove old symlinks if they exist
    if (fs.existsSync(path.join(ROOT, 'routes.json'))) {
      fs.unlinkSync(path.join(ROOT, 'routes.json'));
    }
    if (fs.existsSync(path.join(ROOT, 'status.json'))) {
      fs.unlinkSync(path.join(ROOT, 'status.json'));
    }

    // Create new symlinks
    if (fs.existsSync(routesTarget)) {
      fs.symlinkSync(path.relative(ROOT, routesTarget), path.join(ROOT, 'routes.json'));
      console.log(`Created routes.json symlink to ${path.relative(ROOT, routesTarget)}`);
    }
    if (fs.existsSync(statusTarget)) {
      fs.symlinkSync(path.relative(ROOT, statusTarget), path.join(ROOT, 'status.json'));
      console.log(`Created status.json symlink to ${path.relative(ROOT, statusTarget)}`);
    }

    return { 
      success: true, 
      message: 'Recreated symlinks to latest report files',
      details: {
        routesSymlink: scanAppFiles[0] || null,
        statusSymlink: healthFiles[0] || null
      }
    };
  } catch (e) {
    return { success: false, message: `Error recreating symlinks: ${e.message}` };
  }
}

/**
 * Improve proxy resilience for specific upstream
 */
async function improveProxyResilience(upstreamName) {
  try {
    if (!upstreamName) {
      return { success: false, message: 'Upstream name is required' };
    }

    // Find config files that reference this upstream
    const findCmd = `grep -l "${upstreamName}" ${ROOT}/apps/*.conf ${ROOT}/config/*.conf 2>/dev/null || echo ""`;
    const files = execSync(findCmd, { encoding: 'utf8' }).split('\\n').filter(Boolean);

    if (files.length === 0) {
      return { success: false, message: `No config files found referencing ${upstreamName}` };
    }

    let modified = false;
    let modifiedFiles = [];

    // Process each file
    for (const file of files) {
      let content = fs.readFileSync(file, 'utf8');
      
      // Check if file needs modification (direct proxy_pass without resolver and variable)
      const directPassRegex = new RegExp(`proxy_pass\\s+https?://${upstreamName}[\\s:;]`);
      
      if (directPassRegex.test(content) && !content.includes(`resolver 127.0.0.11 ipv6=off;`)) {
        // Create backup
        const backupPath = `${file}.backup.${Date.now()}`;
        fs.writeFileSync(backupPath, content);
        
        // Add resolver and use variable for upstream
        const varName = `${upstreamName.replace(/[^a-zA-Z0-9]/g, '_')}_upstream`;
        
        // Add resolver and variable directive
        const withResolver = content.replace(
          /(location[^{]*{)/g, 
          `$1\\n  resolver 127.0.0.11 ipv6=off;\\n  resolver_timeout 5s;\\n  set $${varName} ${upstreamName};`
        );
        
        // Replace direct proxy_pass with variable version
        const withVarPass = withResolver.replace(
          new RegExp(`proxy_pass\\s+(https?://)${upstreamName}([:;/])`, 'g'),
          `proxy_pass $1$${varName}$2`
        );
        
        fs.writeFileSync(file, withVarPass);
        modified = true;
        modifiedFiles.push(file);
        console.log(`Added resilience to ${file} for ${upstreamName}`);
      }
    }

    if (!modified) {
      return { success: false, message: 'No changes needed, configs already have proper resilience' };
    }

    // Regenerate bundle and reload
    execSync('node utils/generateAppsBundle.js', { cwd: ROOT, encoding: 'utf8' });
    
    // Test config
    try {
      execSync('docker exec dev-proxy nginx -t', { encoding: 'utf8' });
      execSync('docker exec dev-proxy nginx -s reload', { encoding: 'utf8' });
      return { 
        success: true, 
        message: 'Added resilience for upstream and reloaded config',
        details: { modifiedFiles }
      };
    } catch (e) {
      return { 
        success: false, 
        message: 'Added resilience but nginx test failed',
        details: { error: e.message, modifiedFiles }
      };
    }
  } catch (e) {
    return { success: false, message: `Error improving resilience: ${e.message}` };
  }
}

/**
 * Restart proxy after ensuring upstream services are running
 */
async function restartProxyAfterUpstreams() {
  try {
    // Discover likely upstream container names from configs (apps/ and overrides/)
    const confDirs = [path.join(ROOT, 'apps'), path.join(ROOT, 'overrides')];
    const candidates = new Set();
    for (const dir of confDirs) {
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.conf'));
        for (const f of files) {
          const txt = fs.readFileSync(path.join(dir, f), 'utf8');
          // From set $var host:port
          const setMatches = txt.matchAll(/set\s+\$[A-Za-z0-9_]+\s+([A-Za-z0-9_.-]+)(?::\d+)?\s*;/g);
          for (const m of setMatches) { if (m[1]) candidates.add(m[1]); }
          // From proxy_pass http://host:port
          const passMatches = txt.matchAll(/proxy_pass\s+http:\/\/(?:\$[A-Za-z0-9_]+|([A-Za-z0-9_.-]+)(?::\d+)?)[^;]*;/g);
          for (const m of passMatches) { if (m[1]) candidates.add(m[1]); }
        }
      } catch {}
    }
    const upstreams = Array.from(candidates);
    let allUp = true;
    let notReadyUpstreams = [];

    // Check if upstream services are running
    for (const upstream of upstreams) {
      try {
        // Check if container is running
        const result = execSync(`docker ps --filter name=${upstream} --format "{{.Status}}"`, { encoding: 'utf8' });
        if (!result.includes('Up')) {
          allUp = false;
          notReadyUpstreams.push(upstream);
        }
      } catch (e) {
        allUp = false;
        notReadyUpstreams.push(upstream);
      }
    }

    if (!allUp) {
      return { 
        success: false, 
        message: 'Not all upstream services are running',
        details: { notReadyUpstreams }
      };
    }

    // Restart proxy
    execSync('docker restart dev-proxy', { encoding: 'utf8' });
    
    // Check if proxy came up healthy
    let healthCheck;
    try {
      // Wait a bit for it to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      healthCheck = execSync('docker ps --filter name=dev-proxy --format "{{.Status}}"', { encoding: 'utf8' });
    } catch (e) {
      healthCheck = e.message;
    }

    if (healthCheck.includes('healthy')) {
      return { success: true, message: 'Proxy restarted successfully after confirming upstream services' };
    } else {
      return { 
        success: false, 
        message: 'Proxy restarted but health check is concerning',
        details: { proxyStatus: healthCheck.trim() }
      };
    }
  } catch (e) {
    return { success: false, message: `Error restarting proxy: ${e.message}` };
  }
}

/**
 * Run site-auditor-debug against a URL and return a compact summary.
 * Tries local Node first; if dist missing it will build; falls back to dockerized Node.
 */
async function runSiteAuditor(urlToAudit, options = {}) {
  const out = { ok: false, reportPath: null, summary: null, raw: null };
  if (!urlToAudit) return { ok:false, error: 'url required' };
  const toolDir = path.join(ROOT, 'site-auditor-debug');
  const distCli = path.join(toolDir, 'dist', 'cli.js');
  const tsConfig = path.join(toolDir, 'tsconfig.json');
  try {
    // Ensure build exists
    if (!fs.existsSync(distCli)) {
      try {
        execSync('npm ci --no-audit --no-fund --silent', { cwd: toolDir, stdio: 'ignore' });
      } catch {}
      try {
        execSync('npx -y tsc -p tsconfig.json', { cwd: toolDir, stdio: 'ignore' });
      } catch (e) {
        // try dockerized build as last resort
        execSync(`docker run --rm -v "${toolDir}:/app" -w /app node:20-alpine sh -lc 'npm ci --no-audit --no-fund && npx -y tsc -p tsconfig.json'`, { stdio: 'ignore' });
      }
    }
    // Run the auditor
    const headless = options.headless === false ? 'false' : 'true';
    const wait = Number(options.wait || 1500);
    const timeout = Number(options.timeout || 30000);
    // Use 'load' instead of 'networkidle2' for more reliable completion in Docker
    const waitUntil = options.waitUntil || 'load';
    const outDir = AUDITS_DIR;
    let stdout = '';

    const preferDocker = !!process.env.CALLIOPE_PUPPETEER_IMAGE; // if set, skip local Puppeteer entirely
    if (!preferDocker) {
      try {
        stdout = execSync(`node dist/cli.js ${JSON.stringify(urlToAudit)} --headless ${headless} --waitUntil networkidle2 --timeout ${timeout} --wait ${wait} --styles-mode off --output ${JSON.stringify(outDir)}`, { cwd: toolDir, encoding: 'utf8' });
      } catch (e) {
        // fall through to dockerized run
      }
    }
    if (!stdout) {
      // dockerized run with a Puppeteer image (bundled Chrome)
      const img = process.env.CALLIOPE_PUPPETEER_IMAGE || 'ghcr.io/puppeteer/puppeteer:latest';
      const desiredPlatform = process.env.CALLIOPE_PUPPETEER_PLATFORM || (process.arch === 'arm64' ? 'linux/arm64/v8' : '');
      const platformFlag = desiredPlatform ? `--platform ${desiredPlatform}` : '';
      // Quote URL to avoid shell interpreting characters like & ? *
      const safeUrl = JSON.stringify(String(urlToAudit));
      // Ensure Chrome is installed/available inside the puppeteer image
      const preInstall = `npx puppeteer browsers install chrome 2>&1 | grep -E 'chrome@|already' || true`;
      const cmd = `${preInstall} && node dist/cli.js ${safeUrl} --headless ${headless} --waitUntil ${waitUntil} --timeout ${timeout} --wait ${wait} --styles-mode off --output /app/.artifacts/audits`;
      // Prefer reusing volumes from the API container (Docker Desktop file sharing already approved there)
      let apiContainer = 'dev-proxy-config-api';
      try {
        const names = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
        if (names.includes('dev-proxy-config-api')) apiContainer = 'dev-proxy-config-api';
        else if (names.includes('dev-proxy-config-api')) apiContainer = 'dev-proxy-config-api';
      } catch {}
      // Copy site-auditor to container temp dir to avoid node_modules conflicts
      const setupCmd = `cp -r /app/site-auditor-debug /tmp/auditor && cd /tmp/auditor && npm install --no-audit --no-fund 2>&1 | grep -E 'added|up to date' || echo 'deps ready'`;
      const adjustedCmd = cmd.replace(/\/app\/\.artifacts\/audits/g, '/app/.artifacts/audits');
      const fullCmd = `${setupCmd} && cd /tmp/auditor && ${adjustedCmd}`;
      const dockerCmd = [`docker run --rm`, platformFlag, `--network devproxy`, `--volumes-from ${apiContainer}`, img, `sh -lc ${JSON.stringify(fullCmd)}`]
        .filter(Boolean)
        .join(' ');
      stdout = execSync(dockerCmd, { encoding: 'utf8' });
    }
    out.raw = stdout;
    const m = stdout.match(/Report:\s*(.*report\.json)/);
    const reportPath = m && m[1] ? m[1].trim() : null;
    out.reportPath = reportPath;
    if (reportPath && fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const ce = (report.console?.errors?.length || 0) + (report.console?.pageErrors?.length || 0);
      const nf = (report.network?.failures?.length || 0);
      const hi = (report.network?.httpIssues?.length || 0);
      const failures = Array.from(new Set((report.network?.failures || []).map(x => x.url))).slice(0, 12);
      out.summary = { consoleErrors: ce, networkFailures: nf, httpIssues: hi, failures };
      out.ok = true;

      // Persist audit history with deltas per-path for improvement tracking
      try {
        const urlObj = new URL(String(urlToAudit));
        const pathKey = urlObj.pathname.replace(/\/$/, '') || '/';
        const safeKey = pathKey.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'root';
        const histFile = path.join(AUDIT_HISTORY_DIR, `${safeKey}.jsonl`);
        let prev = null;
        if (fs.existsSync(histFile)) {
          try {
            const lines = fs.readFileSync(histFile, 'utf8').split(/\r?\n/).filter(Boolean);
            if (lines.length) prev = JSON.parse(lines[lines.length - 1]);
          } catch {}
        }
        const entry = {
          timestamp: new Date().toISOString(),
          url: urlObj.toString(),
          summary: out.summary,
          reportPath,
        };
        if (prev && prev.summary) {
          entry.delta = {
            consoleErrors: (out.summary.consoleErrors || 0) - (prev.summary.consoleErrors || 0),
            networkFailures: (out.summary.networkFailures || 0) - (prev.summary.networkFailures || 0),
            httpIssues: (out.summary.httpIssues || 0) - (prev.summary.httpIssues || 0),
          };
        }
        fs.appendFileSync(histFile, JSON.stringify(entry) + '\n');
      } catch {}
    } else {
      out.summary = { note: 'report path not found in output' };
    }
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

/**
 * Ensure best-practice Nginx overrides for a subpath app when needed (generic)
 */
async function applyMxtkBestPractices() {
  try {
    // Guardrail: this helper historically targeted a specific app.
    // In generic mode, do nothing and return a safe message.
    return { success: false, message: 'Generic mode: app-specific best-practices helper disabled' };

    // Dead code retained above for diff context; intentionally no file edits in generic mode.
  } catch (e) {
    return { success: false, message: `applyMxtkBestPractices disabled in generic mode: ${e.message}` };
  }
}

/**
 * Ensure Storybook + Vite proxy guards for a subpath (idempotent), then regenerate Nginx.
 */
async function applyStorybookViteProxyGuards({ routePrefix = '' } = {}) {
  try {
    if (!routePrefix || !routePrefix.startsWith('/')) {
      return { success: false, message: 'routePrefix starting with / is required' };
    }

    // Find target config file that contains the routePrefix block and detect its upstream variable
    const findConfByPrefix = (baseDir) => {
      try {
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.conf'));
        for (const f of files) {
          const p = path.join(baseDir, f);
          const txt = fs.readFileSync(p, 'utf8');
          const safe = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const rx = new RegExp('location\\s*\\^~\\s*' + safe + '\\/');
          if (rx.test(txt)) return p;
        }
      } catch {}
      return null;
    };
    const target = findConfByPrefix(path.join(ROOT, 'overrides')) || findConfByPrefix(path.join(ROOT, 'apps'));
    if (!target) return { success:false, message:'No config found for routePrefix' };

    let content = fs.readFileSync(target, 'utf8');
    const original = content;

    // Try to detect upstream variable used in this file; fall back to explicit host if present
    let upstreamVar = null;
    const bodyVar = content.match(/proxy_pass\s+http:\/\/\$([A-Za-z0-9_]+)/);
    if (bodyVar && bodyVar[1]) upstreamVar = bodyVar[1];
    if (!upstreamVar) {
      const setVar = content.match(/set\s+\$([A-Za-z0-9_]+)\s+[^;]+;/);
      if (setVar && setVar[1]) upstreamVar = setVar[1];
    }
    // Detect explicit upstream host:port in file (first occurrence)
    let upstreamHost = null;
    if (!upstreamVar) {
      const hostMatch = content.match(/proxy_pass\s+http:\/\/(?:\$[A-Za-z0-9_]+|([A-Za-z0-9_.-]+(?::\d+)?))(?:\/?[;\s])/);
      if (hostMatch && hostMatch[1]) upstreamHost = hostMatch[1];
    }

    const ensure = (re, block) => { if (!re.test(content)) content += (content.endsWith('\n')?'':'\n') + block + '\n'; };

    // Ensure core subpath block sets forwarded prefix (idempotent)
    const safePrefix = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const locRe = new RegExp('(location\\s*\\^~\\s*' + safePrefix + '\/\\s*\{)([\\s\\S]*?)(\\n\})', 'm');
    if (locRe.test(content)) {
      content = content.replace(locRe, (m, a, b, c)=>{
        if (/\bproxy_set_header\s+X-Forwarded-Prefix\b/.test(b)) return m;
        const lines = b.split('\n');
        let inserted = false;
        for (let i=0;i<lines.length;i++){
          if (/\bproxy_set_header\s+X-Forwarded-Host\b/.test(lines[i]) || /\bproxy_set_header\s+Host\b/.test(lines[i])){
            lines.splice(i+1,0,`  proxy_set_header X-Forwarded-Prefix ${routePrefix};`);
            inserted = true; break;
          }
        }
        if (!inserted) lines.unshift(`  proxy_set_header X-Forwarded-Prefix ${routePrefix};`);
        return a + lines.join('\n') + c;
      });
    }

    // Add Vite/Storybook helper locations under the same prefix
    const guards = [
      [`${routePrefix}/@vite/`, '@vite/'],
      [`${routePrefix}/@id/`, '@id/'],
      [`${routePrefix}/@fs/`, '@fs/'],
      [`${routePrefix}/node_modules/`, 'node_modules/'],
      [`${routePrefix}/sb-manager/`, 'sb-manager/'],
      [`${routePrefix}/sb-addons/`, 'sb-addons/'],
      [`${routePrefix}/sb-common-assets/`, 'sb-common-assets/'],
    ];
    for (const [loc, pass] of guards){
      const safeLoc = loc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp('location\\s*\\^~\\s*' + safeLoc, 'm');
      const isViteHmr = /@vite\//.test(pass);
      const block = [
        `location ^~ ${loc} {`,
        '  proxy_http_version 1.1;',
        '  proxy_set_header Host $proxy_host;',
        '  proxy_set_header X-Forwarded-Proto $scheme;',
        ...(isViteHmr ? [
          '  proxy_set_header Upgrade $http_upgrade;',
          '  proxy_set_header Connection "upgrade";',
          '  proxy_read_timeout 300s;',
          '  proxy_send_timeout 300s;',
          '  proxy_buffering off;',
        ] : []),
        (upstreamVar
          ? `  proxy_pass http://$${upstreamVar}/${pass};`
          : (upstreamHost ? `  proxy_pass http://${upstreamHost}/${pass};` : '  # upstream not detected; configure proxy_pass manually')),
        '}'
      ].join('\n');
      ensure(re, block);
    }

    // Root-level fallbacks (safe generics for Storybook/Vite): /@id/ and combined fonts regex
    // Only emit if not present; use detected upstreamVar/host. Place after prefixed guards.
    const rootIdRe = /\n\s*location\s*\^~\s*\/@id\//m;
    if (!rootIdRe.test(content)){
      const idBlock = [
        'location ^~ /@id/ {',
        '  proxy_http_version 1.1;',
        '  proxy_set_header Host $proxy_host;',
        '  proxy_set_header X-Forwarded-Proto $scheme;',
        '  proxy_set_header X-Forwarded-Host $host;',
        '  proxy_set_header ngrok-skip-browser-warning "true";',
        '  resolver 127.0.0.11 ipv6=off;',
        '  resolver_timeout 5s;',
        (upstreamVar
          ? `  proxy_pass http://$${upstreamVar}/@id/;`
          : (upstreamHost ? `  proxy_pass http://${upstreamHost}/@id/;` : '  # configure proxy_pass for /@id/')),
        '}'
      ].join('\n');
      content += (content.endsWith('\n')?'':'\n') + idBlock + '\n';
    }

    const fontsRe = /location\s+~\*\s+\^\/\(sdk\/\)\?sb-common-assets\//m;
    if (!fontsRe.test(content)){
      const hostHeader = 'proxy_set_header Host $proxy_host;';
      const passLine = (upstreamVar
        ? `proxy_pass http://$${upstreamVar}/sb-common-assets/$2.woff2;`
        : (upstreamHost ? `proxy_pass http://${upstreamHost}/sb-common-assets/$2.woff2;` : '# configure proxy_pass for fonts'));
      const fontsBlock = [
        'location ~* ^/(sdk/)?sb-common-assets/(.+)\\.woff2$ {',
        '  proxy_http_version 1.1;',
        `  ${hostHeader}`,
        '  proxy_set_header X-Forwarded-Proto $scheme;',
        '  proxy_set_header X-Forwarded-Host $host;',
        '  resolver 127.0.0.11 ipv6=off;',
        '  resolver_timeout 5s;',
        `  ${passLine}`,
        '  proxy_hide_header Content-Type;',
        '  add_header Content-Type font/woff2;',
        '}'
      ].join('\n');
      content += (content.endsWith('\n')?'':'\n') + fontsBlock + '\n';
    }

    // Also add explicit prefix blocks which outrank a broader "^~ /sdk/" catch-all
    const sdkFontsPrefix = new RegExp('\\n\\s*location\\s*\\^~\\s*/sdk/sb-common-assets/','m');
    if (!sdkFontsPrefix.test(content)){
      const passLine2 = (upstreamVar
        ? `proxy_pass http://$${upstreamVar}/sb-common-assets/;`
        : (upstreamHost ? `proxy_pass http://${upstreamHost}/sb-common-assets/;` : '# configure proxy_pass'));
      const block2 = [
        'location ^~ /sdk/sb-common-assets/ {',
        '  proxy_http_version 1.1;',
        '  proxy_set_header Host $proxy_host;',
        '  proxy_set_header X-Forwarded-Proto $scheme;',
        '  proxy_set_header X-Forwarded-Host $host;',
        `  ${passLine2}`,
        '}'
      ].join('\n');
      content += (content.endsWith('\n')?'':'\n') + block2 + '\n';
    }
    const rootFontsPrefix = new RegExp('\\n\\s*location\\s*\\^~\\s*/sb-common-assets/','m');
    if (!rootFontsPrefix.test(content)){
      const passLine3 = (upstreamVar
        ? `proxy_pass http://$${upstreamVar}/sb-common-assets/;`
        : (upstreamHost ? `proxy_pass http://${upstreamHost}/sb-common-assets/;` : '# configure proxy_pass'));
      const block3 = [
        'location ^~ /sb-common-assets/ {',
        '  proxy_http_version 1.1;',
        '  proxy_set_header Host $proxy_host;',
        '  proxy_set_header X-Forwarded-Proto $scheme;',
        '  proxy_set_header X-Forwarded-Host $host;',
        `  ${passLine3}`,
        '}'
      ].join('\n');
      content += (content.endsWith('\n')?'':'\n') + block3 + '\n';
    }

    if (content !== original){
      fs.writeFileSync(target, content, 'utf8');
      await regenerateNginxBundle();
      return { success:true, message:'Applied Storybook+Vite proxy guards', details: { file: path.relative(ROOT, target), routePrefix } };
    }
    return { success:true, message:'Storybook+Vite proxy guards already present', details: { file: path.relative(ROOT, target), routePrefix } };
  } catch (e) {
    return { success:false, message:`applyStorybookViteProxyGuards failed: ${e.message}` };
  }
}

/**
 * Run auditor and apply targeted healing for a route until green or attempts exhausted
 */
async function auditAndHealRoute({ url, routePrefix = '/', maxPasses = 4, wait = 2000, timeout = 60000, onUpdate } = {}) {
  const passes = [];
  const emit = typeof onUpdate === 'function' ? onUpdate : ()=>{};
  for (let i=0;i<maxPasses;i++){
    emit({ name: 'thinking', message: `Starting audit pass ${i+1} for ${url}`, routePrefix });
    const run = await runSiteAuditor(url, { wait, timeout });
    const entry = { attempt: i+1, ok: run.ok, summary: run.summary, report: run.reportPath };
    passes.push(entry);
    emit({ name: 'status', message: run.ok ? 'Audit pass complete ✅' : 'Audit pass complete (issues remain) ⚠️', summary: run.summary });
    const hasIssues = !run.ok || (run.summary && ((run.summary.consoleErrors||0) > 0 || (run.summary.networkFailures||0) > 0 || (run.summary.httpIssues||0) > 0));
    if (!hasIssues) {
      emit({ name: 'audit_and_heal_complete', success: true });
      return { success: true, passes, message: 'Green' };
    }

    // Parse report for targeted fixes
    try {
      if (run.reportPath && fs.existsSync(run.reportPath)){
        const rep = JSON.parse(fs.readFileSync(run.reportPath, 'utf8'));
        const failures = rep.network?.failures || [];
        const httpIssues = rep.network?.httpIssues || [];
        const responses = rep.network?.responses || [];
        const consoleErrors = rep.console?.errors || [];
        const pageErrors = rep.console?.pageErrors || [];

        // Check for Next.js auth errors (app-level, not proxy)
        const authErrors = [
          ...consoleErrors.filter(e => 
            e.text && (
              /\[next-auth\].*CLIENT_FETCH_ERROR/.test(e.text) ||
              /Unexpected token '<'.*<!DOCTYPE/.test(e.text) ||
              /\/api\/auth\/_log.*500/.test(e.text)
            )
          ),
          ...pageErrors.filter(e => 
            typeof e === 'string' && /next-auth|auth.*session|auth.*JSON/.test(e)
          )
        ];

        if (authErrors.length > 0) {
          emit({ 
            name: 'app_level_issue_detected', 
            message: '⚠️ Detected Next.js auth configuration errors - these are app-level issues', 
            authErrors: authErrors.length 
          });
        }

        const urls = new Set([
          ...failures.map(f=>f.url).filter(Boolean),
          ...httpIssues.map(h=>h.url).filter(Boolean)
        ]);

        const needsRootDirs = [...urls].some(u => /\/(icons|art)\/?$/.test(u));
        const missingPrefix = responses.some((r)=>{
          try {
            const u = new URL(r.url);
            const p = u.pathname || '';
            return (/^\/(icons|art)\//.test(p)) && (r.status >= 400) && !p.startsWith(`${routePrefix}/`);
          } catch { return false; }
        });

        if (needsRootDirs || missingPrefix){
          // Apply guards and ensure subpath routing resilience
          emit({ name: 'healing', message: 'Applying safe directory guards for subpath assets…', routePrefix });
          await applyGenericDirectoryGuards({ routePrefix, reportPath: run.reportPath || '' });
          // Ensure forwarded prefix on app root and add /<prefix>/_next support
          try { emit({ name: 'healing', message: 'Ensuring forwarded prefix and Next.js dev paths…', routePrefix }); await ensureRouteForwardedPrefixAndNext({ routePrefix }); } catch {}
          emit({ name: 'healing', message: 'Improving subpath absolute routing…', routePrefix });
          await fixSubpathAbsoluteRouting({ routePrefix });
          continue; // next pass
        }

        // Detect Storybook/Vite SDK issues and apply overrides
        // No route-specific edits
      }
    } catch {}

    // If no targeted action detected, still try best practices once
    if (i === 0) { emit({ name: 'healing', message: 'Applying safe directory guards…', routePrefix }); await applyGenericDirectoryGuards({ routePrefix, reportPath: run.reportPath||'' }); continue; }
    break; // avoid infinite loop
  }
  emit({ name: 'status', message: 'Could not reach green within pass limit', success: false });
  return { success: false, passes, message: 'Could not reach green within pass limit' };
}

/**
 * Find an appropriate healing strategy for the detected issue
 */
async function findHealingStrategy(issue) {
  // Implement logic to find the best healing strategy based on the issue
  if (!issue || !issue.pattern) return null;
  
  // Get the solutions from the pattern
  const solutions = issue.pattern.solutions || [];
  if (solutions.length === 0) return null;
  
  // Find solutions that can be automated
  const automatedSolutions = solutions.filter(s => (s.implementation && (s.implementation.type === 'automated' || s.implementation.type === 'semi-automated')));
  
  if (automatedSolutions.length === 0) return null;
  
  // Return the first automated solution
  return automatedSolutions[0];
}

/**
 * Apply a healing strategy
 */
async function applyHealingStrategy(strategy, issue) {
  if (!strategy || !strategy.implementation) return null;
  
  const { function: fnName, params = [] } = strategy.implementation;
  
  // Map functions to their implementations
  const functionMap = {
    fixDuplicateLocationBlocks,
    forceNgrokDiscovery,
    recreateSymlinks,
    improveProxyResilience,
    restartProxyAfterUpstreams,
    ensureRouteForwardedPrefixAndNext,
    applyStorybookViteProxyGuards,
    fixNginxAbsoluteRedirects,
    fixXForwardedProto,
    runMixedContentTest,
    fixRedirectLoop
  };
  
  // Check if the function exists
  if (!functionMap[fnName]) {
    return { success: false, message: `Healing function ${fnName} not found` };
  }
  
  // Process parameters based on issue details if needed
  const processedParams = params.map(param => {
    if (param.startsWith('$') && issue.match) {
      const key = param.substring(1);
      return issue.match[key] || null;
    }
    return param;
  }).filter(Boolean);
  
  // Call the function with the parameters
  const fn = functionMap[fnName];
  const result = await fn(...processedParams);
  
  // Log the healing attempt
  logHealingAttempt(issue.pattern.id, strategy.id, result.success, {
    strategy,
    result,
    params: processedParams
  });
  
  return result;
}

/**
 * Advanced self-heal function that leverages the knowledge base
 */
async function advancedSelfHeal(options = {}) {
  const result = {
    startedAt: new Date().toISOString(),
    steps: [],
    success: false,
    detectedIssues: [],
    appliedStrategies: [],
    originalOptions: options
  };
  
  // Proactively ensure generic patterns are loaded
  try { ensureGenericPatterns(); } catch {}

  const routeFocus = (options && options.routeKey) || '';
  const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : ()=>{};

  // Optional proactive site audit+heal if URL is provided
  if (options.url) {
    result.steps.push({ name: 'audit_and_heal_route', status: 'running', url: options.url, routePrefix: options.routePrefix || '' });
    try {
      const healed = await auditAndHealRoute({ url: options.url, routePrefix: options.routePrefix || '/', maxPasses: options.maxPasses || 3, wait: options.wait || 1500, timeout: options.timeout || 45000 });
      result.steps.push({ name: 'audit_and_heal_route', status: 'completed', healed });
      if (healed && healed.success) {
        result.success = true;
        result.finishedAt = new Date().toISOString();
        return result;
      }
    } catch (e) {
      result.steps.push({ name: 'audit_and_heal_route', status: 'failed', error: e.message });
    }
  }

  // Step 1: Run diagnostics to gather signals
  result.steps.push({ name: 'run_diagnostics', status: 'running' });
  onUpdate({ name: 'run_diagnostics', status: 'running' });
  const diagnostics = await runDiagnostics();
  result.steps.push({ 
    name: 'run_diagnostics', 
    status: 'completed',
    diagnostics: {
      containerCount: Object.keys(diagnostics.containers).length,
      signalCount: diagnostics.signals.length,
    }
  });
  onUpdate({ name: 'run_diagnostics', status: 'completed' });
  result.diagnostics = diagnostics;

  // No app-specific prechecks
  
  // Step 2: Detect issues
  result.steps.push({ name: 'detect_issues', status: 'running' });
  onUpdate({ name: 'detect_issues', status: 'running' });
  const detectedIssues = await detectIssuesFromSignals(diagnostics.signals);
  result.steps.push({ 
    name: 'detect_issues', 
    status: 'completed',
    issueCount: detectedIssues.length,
  });
  onUpdate({ name: 'detect_issues', status: 'completed', issueCount: detectedIssues.length });
  result.detectedIssues = detectedIssues;
  
  // If no issues detected, first try with OpenAI if key available, then run regeneration
  if (detectedIssues.length === 0) {
    // Try using OpenAI to analyze if available
    if (OPENAI_API_KEY) {
      result.steps.push({ name: 'ai_analysis', status: 'running' });
      try {
        const aiAnalysis = await analyzeWithOpenAI(diagnostics);
        if (aiAnalysis && aiAnalysis.success) {
          result.steps.push({ 
            name: 'ai_analysis', 
            status: 'completed',
            analysis: {
              rootCause: aiAnalysis.analysis.rootCause,
              fixSteps: aiAnalysis.analysis.fixSteps
            }
          });
          
          // Add the learned pattern to the knowledge base
          const patternId = `ai_detected_${Date.now()}`;
          const learnedDetails = {
            signals: aiAnalysis.analysis.detectionPattern.signals,
            effects: aiAnalysis.analysis.detectionPattern.effects,
            diagnosis: aiAnalysis.analysis.fixSteps,
            context: aiAnalysis.analysis.analysis,
            fix: aiAnalysis.analysis.fixImplementation
          };
          
          addPatternFromHealing(patternId, { 
            id: `ai_solution_${Date.now()}`,
            description: aiAnalysis.analysis.rootCause 
          }, true, learnedDetails);
          
          result.aiAnalysis = aiAnalysis.analysis;
        } else {
          result.steps.push({ 
            name: 'ai_analysis', 
            status: 'failed', 
            error: aiAnalysis ? aiAnalysis.error : 'AI analysis returned no results' 
          });
        }
      } catch (e) {
        result.steps.push({ 
          name: 'ai_analysis', 
          status: 'failed', 
          error: e.message 
        });
      }
    }
    
    // Run regeneration as a fallback (inside container when possible)
    result.steps.push({ name: 'regenerate_artifacts', status: 'running' });
    try {
      // Prefer running locally first (mounted volume in dev-calliope-api)
      try { await exec('node test/scanApps.js', { cwd: ROOT }); } catch (_) {
        await exec('docker run --rm --network devproxy -v ' + ROOT + ':/app -w /app node:18-alpine node test/scanApps.js');
      }
      // Run health check
      try { await exec('node test/run.js', { cwd: ROOT }); } catch (_) {
        await exec('docker run --rm --network devproxy -v ' + ROOT + ':/app -w /app node:18-alpine node test/run.js');
      }

      // Recreate symlinks
      await recreateSymlinks();
      
      result.steps.push({ name: 'regenerate_artifacts', status: 'completed', ok: true });
    } catch (e) {
      result.steps.push({ 
        name: 'regenerate_artifacts', 
        status: 'failed', 
        error: e.message 
      });
    }
    
    result.success = true;
    result.message = result.aiAnalysis ? 
      `AI analysis: ${result.aiAnalysis.rootCause}. Regenerated artifacts as precaution.` : 
      "No specific issues detected, regenerated artifacts as precaution.";
    result.finishedAt = new Date().toISOString();
    return result;
  }
  
  // Step 3: For each detected issue, find and apply healing strategy
  for (const issue of detectedIssues) {
    const issueName = issue.pattern.id;
    result.steps.push({ name: `heal_${issueName}`, status: 'running' });
    onUpdate({ name: `heal_${issueName}`, status: 'running' });
    
    // Find healing strategy
    const strategy = await findHealingStrategy(issue);
    if (!strategy) {
      result.steps.push({ 
        name: `heal_${issueName}`, 
        status: 'skipped', 
        reason: 'No automated strategy available'
      });
      onUpdate({ name: `heal_${issueName}`, status: 'skipped', reason: 'No automated strategy available' });
      continue;
    }
    
    // Apply healing strategy
    const healResult = await applyHealingStrategy(strategy, issue);
    result.appliedStrategies.push({
      issue: issueName,
      strategy: strategy.id,
      result: healResult
    });
    
    if (healResult.success) {
      result.steps.push({ 
        name: `heal_${issueName}`, 
        status: 'completed', 
        strategy: strategy.id,
        message: healResult.message
      });
      onUpdate({ name: `heal_${issueName}`, status: 'completed', strategy: strategy.id, message: healResult.message });
    } else {
      result.steps.push({ 
        name: `heal_${issueName}`, 
        status: 'failed', 
        strategy: strategy.id,
        error: healResult.message,
        details: healResult.details
      });
      onUpdate({ name: `heal_${issueName}`, status: 'failed', strategy: strategy.id, error: healResult.message });
    }
  }
  
  // Step 4: Final check to make sure things are working
  result.steps.push({ name: 'final_check', status: 'running' });
  onUpdate({ name: 'final_check', status: 'running' });
  const finalDiagnostics = await runDiagnostics();
  const newIssues = await detectIssuesFromSignals(finalDiagnostics.signals);
  
  if (newIssues.length === 0) {
    result.steps.push({ name: 'final_check', status: 'completed', ok: true });
    result.success = true;
    onUpdate({ name: 'final_check', status: 'completed', ok: true });
  } else {
    result.steps.push({ 
      name: 'final_check', 
      status: 'warning', 
      remainingIssues: newIssues.length
    });
    result.success = result.appliedStrategies.some(s => s.result.success);
    result.remainingIssues = newIssues;
    onUpdate({ name: 'final_check', status: 'warning', remainingIssues: newIssues.length });
  }
  
  result.finishedAt = new Date().toISOString();
  return result;
}

/**
 * Use OpenAI to analyze and solve novel issues
 */
async function analyzeWithOpenAI(diagnostics, issues = []) {
  if (!OPENAI_API_KEY) {
    console.log('No OpenAI API key available for advanced analysis');
    return null;
  }
  
  try {
    // Prepare context for OpenAI
    const context = {
      diagnostics,
      issues,
      containerStatus: diagnostics.containers,
      signals: diagnostics.signals.slice(0, 5), // First 5 signals
      configStatus: diagnostics.configs,
    };
    
    // Build the prompt
    const systemPrompt = `You are Calliope, an AI assistant specialized in diagnosing and fixing issues in a Docker-based Nginx reverse proxy system.
Given the diagnostics information, your task is to:
1. Identify the most likely root cause of the issue
2. Suggest specific steps to fix it
3. Provide a pattern for future automatic detection of this issue

Return your response in the following JSON format:
{
  "analysis": "Your detailed analysis of the problem",
  "rootCause": "The likely root cause in one sentence",
  "fixSteps": ["Step 1", "Step 2", ...],
  "detectionPattern": {
    "signals": ["regex1", "regex2", ...],
    "effects": ["effect1", "effect2", ...]
  },
  "fixImplementation": "Pseudocode or shell commands to implement the fix"
}`;

    const userPrompt = `Here is the diagnostic information about an issue with the dev-tunnel-proxy system:
${JSON.stringify(context, null, 2)}

Please analyze this issue and suggest a fix.`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      }),
    });
    
    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return null;
    }
    
    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);
    
    return {
      success: true,
      analysis
    };
  } catch (e) {
    console.error('Error analyzing with OpenAI:', e);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Ensure Storybook (SB9) + Vite dev endpoints work behind proxy at / and /sdk/
 * - Adds regex locations for /@vite, /@id, /node_modules, /@fs (and /sdk equivalents)
 * - Normalizes Host header to localhost:6006 for Vite endpoints
 * - Ensures proxy_pass preserves full request URI by pointing to host only (no path)
 * - Fixes sb-common-assets to preserve URI and correct Host
 */
async function fixStorybookViteProxyConfig() {
  const confPath = path.join(ROOT, 'apps', 'encast.conf');
  try {
    if (!fs.existsSync(confPath)) {
      return { success: false, message: 'No specific app config available in generic mode' };
    }
    // App-specific changes should be avoided in generic mode.
    return { success: false, message: 'Skipped app-specific Storybook config in generic mode' };
  } catch (e) {
    return { success: false, message: `fixStorybookViteProxyConfig failed: ${e.message}` };
  }
}

/**
 * Fix React bundle serving issues for subpath deployments
 */
async function fixReactBundleSubpathIssues(routePrefix = '/') {
  return { success: false, message: 'Generic mode: React bundle fix requires app-specific context; skipped' };
}

/**
 * Fix React static asset routing issues with proper path handling
 */
async function fixReactStaticAssetRouting(routePrefix = '/') {
  return { success: false, message: 'Generic mode: React static asset fix requires app-specific context; skipped' };
}

/**
 * Fix mxtk API absolute-path routing and Next dev helper endpoints
 */
async function fixMxtkApiRouting() { return { success:false, message:'Generic mode: app-specific API fix is disabled' }; }

/**
 * Generic subpath absolute-routing fixer.
 * Ensures that when an app is mounted at routePrefix,
 * - API requests under `${routePrefix}/api/...` are forwarded upstream with the prefix stripped
 * - Optional dev overlay and asset helpers under `${routePrefix}` are present
 * Config file is detected via routes.json metadata unless explicitly provided.
 */
async function fixSubpathAbsoluteRouting({ routePrefix = '', apiPrefix = '/api/', devPaths = ['/__nextjs_original-stack-frames'] , configFile = '' } = {}) {
  try {
    if (!routePrefix || !routePrefix.startsWith('/')) {
      return { success: false, message: 'routePrefix starting with / is required' };
    }

    // Locate config file if not provided
    let targetConf = configFile;
    try {
      if (!targetConf) {
        const routesPath = path.join(ROOT, 'routes.json');
        if (fs.existsSync(routesPath)) {
          const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
          const meta = routes && routes.metadata && routes.metadata[`${routePrefix}/`];
          const src = meta && meta.sourceFile;
          if (src) {
            if (path.isAbsolute(src)) targetConf = src;
            else if (/^(apps|overrides)\//.test(src)) targetConf = path.join(ROOT, src);
            else targetConf = path.join(ROOT, 'apps', src);
          }
        }
      }
    } catch {}

    if (!targetConf) return { success: false, message: 'Could not determine app config file for routePrefix' };
    if (!fs.existsSync(targetConf)) return { success: false, message: `Config file not found: ${path.relative(ROOT, targetConf)}` };

    let content = fs.readFileSync(targetConf, 'utf8');

    // Discover an upstream variable name used in this conf (fallback to direct upstream later)
    const varMatch = content.match(/set\s+\$([A-Za-z0-9_]+)\s+([^;]+);/);
    const upstreamVar = varMatch ? varMatch[1] : null;
    const setDirective = varMatch ? varMatch[0] : null;

    // Ensure API subpath block exists and strips prefix
    const safePrefix0 = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const safeApi0 = apiPrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const apiBlockRegex = new RegExp('location\\s*\\^~\\s*' + safePrefix0 + safeApi0 + '\\s*\\{[\\s\\S]*?\\}', 'm');
    if (!apiBlockRegex.test(content)) {
      const passLine = upstreamVar ? `proxy_pass http://$${upstreamVar}${apiPrefix};` : `proxy_pass http://host.docker.internal${apiPrefix};`;
      const block = `\nlocation ^~ ${routePrefix}${apiPrefix} {\n  proxy_http_version 1.1;\n  proxy_set_header Host $host;\n  proxy_set_header X-Forwarded-Proto $scheme;\n  proxy_set_header X-Forwarded-Host $host;\n  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n  proxy_set_header X-Forwarded-Prefix ${routePrefix};\n  proxy_buffering off;\n  proxy_request_buffering off;\n  resolver 127.0.0.11 ipv6=off;\n  resolver_timeout 5s;\n  ${upstreamVar ? '' : '# Fallback direct upstream used if no variable was detected'}\n  ${passLine}\n}\n`;

      // Insert near the end of file for clarity
      content += block;
    }

    // Ensure dev overlay paths under subpath exist (upstream should use ROOT path, not prefixed)
    for (const p of devPaths) {
      const full = `${routePrefix}${p}`;
      const safeFull = full.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const devRegex = new RegExp('location\\s*=\\s*' + safeFull + '\\s*\\{[\\s\\S]*?\\}', 'm');
      if (!devRegex.test(content)) {
        // Upstream dev paths should not include the subpath prefix
        const passLine = upstreamVar ? `proxy_pass http://$${upstreamVar}${p};` : `proxy_pass http://host.docker.internal${p};`;
        const block = `\nlocation = ${full} {\n  proxy_http_version 1.1;\n  proxy_set_header Host $host;\n  proxy_set_header X-Forwarded-Proto $scheme;\n  proxy_set_header X-Forwarded-Host $host;\n  resolver 127.0.0.11 ipv6=off;\n  resolver_timeout 5s;\n  ${passLine}\n}\n`;
        content += block;
      }
    }

    // Write and reload
    const backup = `${targetConf}.backup.${Date.now()}`;
    fs.copyFileSync(targetConf, backup);
    fs.writeFileSync(targetConf, content, 'utf8');

    // Regenerate bundle and reload nginx using resilient helper
    await regenerateNginxBundle();

    return { success: true, message: 'Applied generic subpath routing fixes', details: { routePrefix, apiPrefix, configFile: path.relative(ROOT, targetConf) } };
  } catch (e) {
    return { success: false, message: `fixSubpathAbsoluteRouting failed: ${e.message}` };
  }
}

/**
 * Ensure a subpath app mounted at routePrefix forwards X-Forwarded-Prefix and has
 * a dedicated `${routePrefix}/_next/` location forwarding to upstream `/_next/` with HMR.
 * Idempotent and conservative (prefers overrides/ before apps/).
 */
async function ensureRouteForwardedPrefixAndNext({ routePrefix = '', configFile = '' } = {}) {
  try {
    if (!routePrefix || !routePrefix.startsWith('/')) {
      return { success: false, message: 'routePrefix starting with / is required' };
    }

    // Pick target config containing the route block
    const findConfByPrefix = (baseDir) => {
      try {
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.conf'));
        for (const f of files) {
          const p = path.join(baseDir, f);
          const txt = fs.readFileSync(p, 'utf8');
          const safe = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const rx = new RegExp('location\\s*\\^~\\s*' + safe + '\\/');
          if (rx.test(txt)) return p;
        }
      } catch {}
      return null;
    };

    let targetConf = '';
    if (configFile && fs.existsSync(configFile)) {
      targetConf = configFile;
    } else {
      targetConf = findConfByPrefix(path.join(ROOT, 'overrides')) || findConfByPrefix(path.join(ROOT, 'apps')) || '';
    }
    if (!targetConf) return { success: false, message: 'No config found containing routePrefix block' };

    let content = fs.readFileSync(targetConf, 'utf8');
    const original = content;

    // Ensure X-Forwarded-Prefix inside the routePrefix block
    const safe1 = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const locRe = new RegExp('(location\\s*\\^~\\s*' + safe1 + '\\/\\s*\\{)([\\s\\S]*?)(\\n\\})', 'm');
    const locMatch = content.match(locRe);
    if (!locMatch) return { success: false, message: 'Route block not found in config' };

    const blockStart = locMatch[1];
    const blockBody = locMatch[2];
    const blockEnd = locMatch[3];
    let updatedBody = blockBody;
    if (!/\bproxy_set_header\s+X-Forwarded-Prefix\b/.test(blockBody)) {
      const lines = blockBody.split(/\n/);
      let inserted = false;
      for (let i = 0; i < lines.length; i++) {
        if (/\bproxy_set_header\s+X-Forwarded-Host\b/.test(lines[i]) || /\bproxy_set_header\s+Host\b/.test(lines[i])) {
          lines.splice(i + 1, 0, `  proxy_set_header X-Forwarded-Prefix ${routePrefix};`);
          inserted = true;
          break;
        }
      }
      if (!inserted) lines.unshift(`  proxy_set_header X-Forwarded-Prefix ${routePrefix};`);
      updatedBody = lines.join('\n');
    }

    // Try to detect upstream variable within the file
    let upstreamVar = null;
    const bodyVar = updatedBody.match(/proxy_pass\s+http:\/\/\$([A-Za-z0-9_]+)/);
    if (bodyVar && bodyVar[1]) upstreamVar = bodyVar[1];
    if (!upstreamVar) {
      const setVar = content.match(/set\s+\$([A-Za-z0-9_]+)\s+[^;]+;/);
      if (setVar && setVar[1]) upstreamVar = setVar[1];
    }

    content = content.replace(locRe, blockStart + updatedBody + blockEnd);

    // Ensure `${routePrefix}/_next/` block exists (with rewrite to /_next/ and HMR headers)
    const safe2 = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const nextLocRe = new RegExp('location\\s*\\^~\\s*' + safe2 + '\\/_next\\/\\s*\\{[\\s\\S]*?\\}', 'm');
    if (!nextLocRe.test(content)) {
      if (!upstreamVar) return { success: false, message: 'Could not determine upstream variable for _next block' };
      const rewriteSafe = routePrefix.replace(/\//g, '\\/');
      const block = [
        `location ^~ ${routePrefix}/_next/ {`,
        '  proxy_http_version 1.1;',
        '  proxy_set_header Host $host;',
        '  proxy_set_header X-Forwarded-Proto https;',
        '  proxy_set_header X-Forwarded-Host $host;',
        '  proxy_set_header Upgrade $http_upgrade;',
        '  proxy_set_header Connection "upgrade";',
        '  proxy_read_timeout 300s;',
        '  proxy_send_timeout 300s;',
        '  resolver 127.0.0.11 ipv6=off;',
        '  resolver_timeout 5s;',
        `  rewrite ^${rewriteSafe}\/_next\/(.*)$ \/_next/$1 break;`,
        `  proxy_pass http://$${upstreamVar};`,
        '  add_header Content-Security-Policy "upgrade-insecure-requests" always;',
        '}'
      ].join('\n');
      content += (content.endsWith('\n') ? '' : '\n') + block + '\n';
    }

    if (content !== original) {
      const backup = `${targetConf}.backup.${Date.now()}`;
      fs.copyFileSync(targetConf, backup);
      fs.writeFileSync(targetConf, content, 'utf8');
      await regenerateNginxBundle();
      return { success: true, message: 'Ensured X-Forwarded-Prefix and /_next block', details: { file: path.relative(ROOT, targetConf), routePrefix } };
    }
    return { success: true, message: 'No changes needed (already ensured)', details: { file: path.relative(ROOT, targetConf), routePrefix } };
  } catch (e) {
    return { success: false, message: `ensureRouteForwardedPrefixAndNext failed: ${e.message}` };
  }
}

/**
 * Ensure the `${routePrefix}/_next/` location proxies to the same upstream as the route prefix.
 * Corrects cases where it points to an unrelated upstream (e.g., API) by rewriting proxy_pass.
 */
async function fixPrefixedNextBlockUpstream({ routePrefix = '', configFile = '' } = {}) {
  try {
    if (!routePrefix || !routePrefix.startsWith('/')) {
      return { success: false, message: 'routePrefix starting with / is required' };
    }
    const findConfByPrefix = (baseDir) => {
      try {
        const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.conf'));
        for (const f of files) {
          const p = path.join(baseDir, f);
          const txt = fs.readFileSync(p, 'utf8');
          const safe = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const rx = new RegExp('location\\s*\\^~\\s*' + safe + '\\/');
          if (rx.test(txt)) return p;
        }
      } catch {}
      return null;
    };
    let targetConf = '';
    if (configFile && fs.existsSync(configFile)) {
      targetConf = configFile;
    } else {
      targetConf = findConfByPrefix(path.join(ROOT, 'overrides')) || findConfByPrefix(path.join(ROOT, 'apps')) || '';
    }
    if (!targetConf) return { success: false, message: 'No config found containing routePrefix block' };

    let content = fs.readFileSync(targetConf, 'utf8');

    // Detect upstream variable by checking the routePrefix block first
    const safePrefix = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const locRe = new RegExp('(location\\s*\\^~\\s*' + safePrefix + '\\/\\s*\\{)([\\s\\S]*?)(\\n\\})', 'm');
    const locMatch = content.match(locRe);
    if (!locMatch) return { success: false, message: 'Route block not found in config' };
    const routeBody = locMatch[2] || '';

    let upstreamVar = null;
    const bodyVar = routeBody.match(/proxy_pass\s+http:\/\/\$([A-Za-z0-9_]+)/);
    if (bodyVar && bodyVar[1]) upstreamVar = bodyVar[1];
    if (!upstreamVar) {
      const setVar = content.match(/set\s+\$([A-Za-z0-9_]+)\s+[^;]+;/);
      if (setVar && setVar[1]) upstreamVar = setVar[1];
    }
    if (!upstreamVar) return { success: false, message: 'Could not determine upstream variable for route' };

    // Now ensure the `${routePrefix}/_next/` block exists and proxies to that upstreamVar
    const nextRe = new RegExp('(location\\s*\\^~\\s*' + safePrefix + '\\/_next\\/\\s*\\{)([\\s\\S]*?)(\\n\\})', 'm');
    if (!nextRe.test(content)) {
      // Let ensureRouteForwardedPrefixAndNext create it if missing
      await ensureRouteForwardedPrefixAndNext({ routePrefix, configFile: targetConf });
      content = fs.readFileSync(targetConf, 'utf8');
    }
    if (!nextRe.test(content)) return { success: false, message: 'Next block still not present' };

    content = content.replace(nextRe, (m, a, b, c) => {
      // Replace any proxy_pass inside with the correct upstreamVar form
      let body = b;
      body = body.replace(/proxy_pass\s+http:\/\/\$[A-Za-z0-9_]+\s*;/, `proxy_pass http://$${upstreamVar};`);
      // Also fix cases where it used a bare variable without scheme
      body = body.replace(/proxy_pass\s+\$[A-Za-z0-9_]+\s*;/, `proxy_pass http://$${upstreamVar};`);
      return a + body + c;
    });

    const backup = `${targetConf}.backup.${Date.now()}`;
    fs.copyFileSync(targetConf, backup);
    fs.writeFileSync(targetConf, content, 'utf8');
    await regenerateNginxBundle();
    return { success: true, message: 'Fixed _next upstream', details: { file: path.relative(ROOT, targetConf), upstreamVar, routePrefix } };
  } catch (e) {
    return { success: false, message: `fixPrefixedNextBlockUpstream failed: ${e.message}` };
  }
}

/**
 * Ensure root-level Vite pass-throughs are static and minimal in config/default.conf
 * - Enforce named upstream or direct sdk:6006 target for /@id, /@vite, /@fs
 * - Remove resolver, Referer/Origin headers, and variable proxy_pass forms
 */
async function ensureStaticViteRootPassThroughs() {
  try {
    const conf = path.join(ROOT, 'config', 'default.conf');
    if (!fs.existsSync(conf)) return { success:false, message:'config/default.conf not found' };
    let src = fs.readFileSync(conf, 'utf8');
    const original = src;

    // Normalize /@id/, /@vite/, /@fs/ to static upstream block usage
    const blocks = ['/@id/', '/@vite/', '/@fs/'];
    for (const b of blocks){
      const rx = new RegExp(`(location\\s*\^~\\s*${b.replace(/[\/?+*.^$|(){}[\]\\]/g,'\\$&')}[\s\S]*?\})`, 'g');
      src = src.replace(rx, (m)=>{
        // Build a minimal static block
        const isHmr = b === '/@vite/';
        const lines = [
          `location ^~ ${b} {`,
          '  proxy_http_version 1.1;',
          '  proxy_set_header Host $host;',
          '  proxy_set_header X-Forwarded-Proto $scheme;',
          ...(isHmr ? [
            '  proxy_set_header Upgrade $http_upgrade;',
            '  proxy_set_header Connection "upgrade";',
          ] : []),
          '  proxy_read_timeout 86400;',
          '  proxy_pass http://storybook_sdk;',
          '}',
        ];
        return lines.join('\n');
      });
    }

    // Remove any resolver/Referer/Origin lines inside these blocks if they lingered outside replace
    src = src.replace(/\n\s*resolver\s+127\.0\.0\.11[\s\S]*?;\n/g, '\n');
    src = src.replace(/\n\s*proxy_set_header\s+(Referer|Origin)\b[^;]*;\n/g, '\n');
    // Remove variable proxy_pass for these blocks
    src = src.replace(/proxy_pass\s+http:\/\/\$[A-Za-z0-9_]+;?/g, 'proxy_pass http://storybook_sdk;');

    if (src !== original){
      fs.writeFileSync(conf, src, 'utf8');
      await regenerateNginxBundle();
      return { success:true, message:'Enforced static Vite root pass-throughs in config/default.conf' };
    }
    return { success:true, message:'Static Vite root pass-throughs already enforced' };
  } catch (e) {
    return { success:false, message:`ensureStaticViteRootPassThroughs failed: ${e.message}` };
  }
}

/**
 * Run scripts/test_storybook_proxy.sh inside host context to validate proxy config
 */
async function runStorybookProxyTests() {
  try {
    const script = path.join(ROOT, 'scripts', 'test_storybook_proxy.sh');
    if (!fs.existsSync(script)) return { success:false, message:'scripts/test_storybook_proxy.sh not found' };
    execSync(`bash ${JSON.stringify(script)}`, { cwd: ROOT, stdio: 'pipe' });
    return { success:true, message:'storybook proxy tests passed' };
  } catch (e) {
    return { success:false, message:`storybook proxy tests failed: ${e.message}` };
  }
}

/**
 * Add a new pattern to the knowledge base for future healing.
 */
function addPatternFromHealing(patternId, solution, isNew, details = {}) {
  const kb = loadKnowledgeBase();
  const patternIndex = kb.patterns.findIndex(p => p.id === patternId);

  if (patternIndex === -1) {
    kb.patterns.push({
      id: patternId,
      detection: {
        signals: details.signals || [],
        effects: details.effects || []
      },
      solutions: [solution],
      lastUpdated: new Date().toISOString()
    });
  } else {
    // Update existing pattern
    kb.patterns[patternIndex].detection.signals = [...new Set([...kb.patterns[patternIndex].detection.signals, ...(details.signals || [])])];
    kb.patterns[patternIndex].detection.effects = [...new Set([...kb.patterns[patternIndex].detection.effects, ...(details.effects || [])])];
    kb.patterns[patternIndex].solutions.push(solution);
    kb.patterns[patternIndex].lastUpdated = new Date().toISOString();
  }
  saveKnowledgeBase(kb);
}

/**
 * Apply generic directory guards to ensure assets are served correctly.
 * This is a fallback for routes that might be missing specific guards.
 */
async function applyGenericDirectoryGuards({ routePrefix = '/', reportPath = '' } = {}) {
  try {
    const findConf = (baseDir) => {
      if (!fs.existsSync(baseDir)) return null;
      const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.conf'));
      for (const f of files){
        const p = path.join(baseDir, f);
        const txt = fs.readFileSync(p, 'utf8');
        const safeRoute = routePrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const rx = new RegExp('location\\s+[^}]*' + safeRoute);
        if (rx.test(txt)) return p;
      }
      return null;
    };
    let target = findConf(path.join(ROOT, 'overrides')) || findConf(path.join(ROOT, 'apps'));
    if (!target) return { success: false, message: 'No config found for route' };
    let content = fs.readFileSync(target, 'utf8');
    const original = content;
    const ensure = (re, block) => { if (!re.test(content)) content += (content.endsWith('\n')?'':'\n') + block + '\n'; };
    ensure(/location\s*=\s*\/_next\s*\{\s*return\s+204;\s*\}/m, 'location = /_next { return 204; }');
    ensure(/location\s*=\s*\/_next\/\s*\{\s*return\s+204;\s*\}/m, 'location = /_next/ { return 204; }');
    const dirs = new Set();
    if (reportPath && fs.existsSync(reportPath)){
      try {
        const rep = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const fails = (rep.network && rep.network.failures) || [];
        for (const f of fails){
          try{ const u = new URL(f.url); if (/\/$/.test(u.pathname)) dirs.add(u.pathname); }catch{}
        }
      } catch {}
    }
    for (const d of dirs){
      const isIcons = /\/icons\/?$/.test(d);
      const reEq = new RegExp(`location\\s*=\\s*${d.replace(/\//g, '\\/')}\\s*\\{[\\s\\S]*?\\}`, 'm');
      const reEqSlash = new RegExp(`location\\s*=\\s*${(d.endsWith('/')?d:d+'/').replace(/\//g,'\\/')}\\s*\\{[\\s\\S]*?\\}`, 'm');
      const handler = isIcons ? 'empty_gif;' : 'return 204;';
      if (!reEq.test(content)) content += `\nlocation = ${d} { ${handler} }\n`;
      const d2 = d.endsWith('/') ? d : (d + '/');
      if (!reEqSlash.test(content)) content += `\nlocation = ${d2} { ${handler} }\n`;
    }
    if (content !== original){
      fs.writeFileSync(target, content, 'utf8');
      await regenerateNginxBundle();
      return { success: true, message: 'Applied generic directory guards', file: path.relative(ROOT, target) };
    }
    return { success: true, message: 'No changes needed' };
  } catch (e) {
    return { success: false, message: `applyGenericDirectoryGuards failed: ${e.message}` };
  }
}

/**
 * Fix nginx absolute_redirect setting to prevent HTTP URLs in redirects
 * This fixes mixed content errors when nginx issues 301/308 redirects
 */
async function fixNginxAbsoluteRedirects() {
  try {
    const defaultConf = path.join(ROOT, 'config', 'default.conf');
    if (!fs.existsSync(defaultConf)) {
      return { success: false, message: 'config/default.conf not found' };
    }

    let content = fs.readFileSync(defaultConf, 'utf8');
    
    // Check if already has absolute_redirect off
    if (/absolute_redirect\s+off\s*;/.test(content)) {
      return { success: true, message: 'absolute_redirect already set to off' };
    }

    // Add absolute_redirect off and port_in_redirect off after server_name
    const serverBlock = /server\s*\{[^}]*server_name\s+[^;]+;/;
    if (serverBlock.test(content)) {
      content = content.replace(
        /(server\s*\{[^}]*server_name\s+[^;]+;)/,
        `$1\n  \n  # Prevent nginx from issuing absolute HTTP URLs in redirects\n  # This fixes mixed content errors when accessed via HTTPS (ngrok)\n  absolute_redirect off;\n  port_in_redirect off;`
      );
      
      fs.writeFileSync(defaultConf, content, 'utf8');
      await regenerateNginxBundle();
      
      return { 
        success: true, 
        message: 'Added absolute_redirect off and port_in_redirect off to default.conf to prevent HTTP URLs in redirects' 
      };
    }

    return { success: false, message: 'Could not find server block in default.conf' };
  } catch (e) {
    return { success: false, message: `fixNginxAbsoluteRedirects failed: ${e.message}` };
  }
}

/**
 * Fix X-Forwarded-Proto headers in app configs to use https
 * This ensures apps generate HTTPS URLs for assets when behind ngrok
 */
async function fixXForwardedProto(route) {
  try {
    const appsDir = path.join(ROOT, 'apps');
    const overridesDir = path.join(ROOT, 'overrides');
    
    const fixes = [];
    let fixed = false;

    // If route specified, target that specific config
    const targetFiles = [];
    if (route) {
      const routeName = route.replace(/^\//, '').replace(/\/$/, '');
      const appFile = path.join(appsDir, `${routeName}.conf`);
      const overrideFile = path.join(overridesDir, `${routeName}.conf`);
      if (fs.existsSync(appFile)) targetFiles.push(appFile);
      if (fs.existsSync(overrideFile)) targetFiles.push(overrideFile);
    } else {
      // Fix all app configs
      if (fs.existsSync(appsDir)) {
        fs.readdirSync(appsDir)
          .filter(f => f.endsWith('.conf'))
          .forEach(f => targetFiles.push(path.join(appsDir, f)));
      }
      if (fs.existsSync(overridesDir)) {
        fs.readdirSync(overridesDir)
          .filter(f => f.endsWith('.conf'))
          .forEach(f => targetFiles.push(path.join(overridesDir, f)));
      }
    }

    for (const file of targetFiles) {
      let content = fs.readFileSync(file, 'utf8');
      const original = content;

      // Replace proxy_set_header X-Forwarded-Proto $scheme with "https"
      content = content.replace(
        /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme\s*;/g,
        'proxy_set_header X-Forwarded-Proto "https";'
      );

      if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        fixes.push(path.relative(ROOT, file));
        fixed = true;
      }
    }

    if (fixed) {
      await regenerateNginxBundle();
      return { 
        success: true, 
        message: `Fixed X-Forwarded-Proto in ${fixes.length} config(s): ${fixes.join(', ')}` 
      };
    }

    return { success: true, message: 'No X-Forwarded-Proto issues found' };
  } catch (e) {
    return { success: false, message: `fixXForwardedProto failed: ${e.message}` };
  }
}

/**
 * Run mixed content test using Puppeteer
 * Detects HTTP resources on HTTPS pages
 */
async function runMixedContentTest(url) {
  try {
    const testScript = path.join(ROOT, 'test', 'mixed-content-test.js');
    if (!fs.existsSync(testScript)) {
      return { success: false, message: 'test/mixed-content-test.js not found' };
    }

    const output = execSync(`node ${testScript}`, { 
      cwd: ROOT, 
      encoding: 'utf8',
      env: { ...process.env, TEST_URL: url }
    });

    const hasMixedContent = output.includes('Mixed Content Errors:') && !output.includes('Mixed Content Errors: 0');
    const httpRequests = output.match(/HTTP Requests: (\d+)/);
    const httpCount = httpRequests ? parseInt(httpRequests[1]) : 0;

    return {
      success: httpCount === 0,
      message: hasMixedContent 
        ? `Found ${httpCount} mixed content issues - see output` 
        : 'No mixed content errors detected',
      output: output.slice(-1000) // Last 1000 chars
    };
  } catch (e) {
    // Test script returns exit code 1 on failure
    const output = e.stdout || e.message;
    const httpRequests = output.match(/HTTP Requests: (\d+)/);
    const httpCount = httpRequests ? parseInt(httpRequests[1]) : 0;
    
    return {
      success: false,
      message: `Mixed content test failed: ${httpCount} HTTP requests on HTTPS page`,
      output: output.slice(-1000)
    };
  }
}

async function fixRedirectLoop(route) {
  try {
    const routeKey = route || '/lyra';
    const appName = routeKey.replace(/^\//, '');
    const confPath = path.join(ROOT, 'apps', `${appName}.conf`);
    
    if (!fs.existsSync(confPath)) {
      return { success: false, message: `Config file not found: ${confPath}` };
    }

    let content = fs.readFileSync(confPath, 'utf8');
    let changed = false;

    // Fix pattern 1: location block for /_next/ with full path in proxy_pass
    // BAD: proxy_pass http://upstream:4000/route/_next/;
    // GOOD: proxy_pass http://upstream:4000;
    const nextProxyPassRegex = new RegExp(`proxy_pass\\s+http://([^/]+)/${appName}/_next/`, 'g');
    if (nextProxyPassRegex.test(content)) {
      content = content.replace(
        new RegExp(`(location\\s+[^{]*\\/${appName}\\/_next\\/[^{]*\\{[^}]*proxy_pass\\s+)(http://[^/]+)\\/${appName}\\/_next\\/`, 'g'),
        '$1$2'
      );
      changed = true;
    }

    // Fix pattern 2: regex location with $request_uri
    // Convert regex to simple prefix location
    const regexLocationPattern = new RegExp(`location\\s+~\\s+\\^\/${appName}\\/_next`, 'g');
    if (regexLocationPattern.test(content)) {
      content = content.replace(
        new RegExp(`location\\s+~\\s+\\^\/${appName}\\/_next[^{]*\\{([^}]*proxy_pass\\s+http://[^$]+)\\$request_uri[^;]*;`, 'g'),
        `location /${appName}/_next/ {$1;`
      );
      changed = true;
    }

    if (!changed) {
      return { success: false, message: 'No redirect loop pattern found in config' };
    }

    // Write the fixed config
    fs.writeFileSync(confPath, content, 'utf8');

    // Regenerate nginx bundle
    const bundleScript = path.join(ROOT, 'utils', 'generateAppsBundle.js');
    execSync(`node ${bundleScript}`, { cwd: ROOT, encoding: 'utf8' });

    // Reload nginx
    execSync('docker exec dev-proxy nginx -s reload', { encoding: 'utf8' });

    return {
      success: true,
      message: `Fixed redirect loop in ${appName}.conf and reloaded nginx`,
      details: { configPath: confPath, regenerated: true }
    };
  } catch (e) {
    return { success: false, message: `Error fixing redirect loop: ${e.message}` };
  }
}

module.exports = {
  loadKnowledgeBase,
  saveKnowledgeBase,
  detectIssuesFromSignals,
  runDiagnostics,
  runSiteAuditor,
  advancedSelfHeal,
  analyzeWithOpenAI,
  addPatternFromHealing,
  auditAndHealRoute,
  applyStorybookViteProxyGuards,
  // Snapshot/Analysis
  snapshotProjectToResources,
  analyzeSnapshotForProxyCompatibility,
  backupAndAnalyzeProject,
  snapshotContainerProject,
  backupAndAnalyzeContainerProject,
  
  // Healing strategies
  fixDuplicateLocationBlocks,
  forceNgrokDiscovery,
  recreateSymlinks,
  improveProxyResilience,
  restartProxyAfterUpstreams,
  fixSubpathAbsoluteRouting,
  ensureRouteForwardedPrefixAndNext,
  fixPrefixedNextBlockUpstream,
  ensureStaticViteRootPassThroughs,
  runStorybookProxyTests,
  
  // Mixed content healing
  fixNginxAbsoluteRedirects,
  fixXForwardedProto,
  runMixedContentTest,
  
  // Redirect loop healing
  fixRedirectLoop,
  
  // Core infrastructure
  regenerateNginxBundle
};
