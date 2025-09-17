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
      if (/(<img\b[^>]*\ssrc=\s*["']\/(?!mxtk\/)\S+)/i.test(txt)) {
        suggestions.push({ file: projectRel, issue: 'Raw <img> with absolute src', fix: 'Wrap with basePath-aware image/component or prefix properly' });
      }
      if (/(<Image\b[^>]*\ssrc=\s*["']\/(?!mxtk\/)\S+)/i.test(txt)) {
        suggestions.push({ file: projectRel, issue: 'next/image with absolute src', fix: 'Route through basePath-aware helper' });
      }
      if (/\bfetch\(\s*["']\/(api|graphql)\//i.test(txt)) {
        suggestions.push({ file: projectRel, issue: 'Absolute API path', fix: 'Use basePath-aware API URL builder' });
      }

      // Storybook-specific heuristics
      if (hasStorybook && /\.storybook\//.test(projectRel)) {
        if (/manager-head\.html|preview-head\.html|head\.html/.test(projectRel)) {
          if (!/<base\s+href=["']\/sdk\/["']/.test(txt)) {
            suggestions.push({ file: projectRel, issue: 'Storybook missing <base href="/sdk/">', fix: 'Add <base href="/sdk/"> in head to support subpath dev server' });
          }
        }
        if (/main\.(js|ts)$/.test(projectRel)) {
          const mentionsVite = /builder:\s*'@storybook\/builder-vite'|viteFinal\s*\(/.test(txt);
          if (mentionsVite && !/base:\s*['"]\/sdk\/["']/.test(txt)) {
            suggestions.push({ file: projectRel, issue: 'Vite base not set for subpath', fix: 'Set Vite config base: "/sdk/" in Storybook viteFinal or Vite config' });
          }
          if (mentionsVite) {
            if (!/server\s*:\s*\{[\s\S]*host\s*:\s*true/.test(txt)) {
              suggestions.push({ file: projectRel, issue: 'Vite server.host not enabled', fix: 'In viteFinal, set server.host = true (or start with --host) for non-localhost access' });
            }
            if (!/allowedHosts/.test(txt)) {
              suggestions.push({ file: projectRel, issue: 'Vite allowedHosts missing', fix: 'In viteFinal, set server.allowedHosts to include dev-proxy and your ngrok domain' });
            }
            if (!/hmr\s*:\s*\{[\s\S]*path\s*:\s*['"]\/sdk\/@vite\/["'][\s\S]*\}/.test(txt)) {
              suggestions.push({ file: projectRel, issue: 'Vite HMR path not set for subpath', fix: 'In viteFinal, set server.hmr.path = "/sdk/@vite/" and protocol/port for your environment' });
            }
          } else {
            // No viteFinal present; suggest adding a block tailored for subpath + ngrok
            suggestions.push({
              file: projectRel,
              issue: 'Storybook Vite config missing viteFinal',
              fix: 'Add viteFinal with base:"/sdk/", server.host=true, server.allowedHosts for dev-proxy and ngrok, and server.hmr.path="/sdk/@vite/"'
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
    const upstreams = ['encast-api', 'encast-sdk'];
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
      const cmd = `node dist/cli.js ${safeUrl} --headless ${headless} --waitUntil networkidle2 --timeout ${timeout} --wait ${wait} --styles-mode off --output /app/.artifacts/audits`;
      // Prefer reusing volumes from the API container (Docker Desktop file sharing already approved there)
      let apiContainer = 'dev-calliope-api';
      try {
        const names = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
        if (names.includes('dev-calliope-api')) apiContainer = 'dev-calliope-api';
        else if (names.includes('dev-calliope-api')) apiContainer = 'dev-calliope-api';
      } catch {}
      const dockerCmd = [`docker run --rm`, platformFlag, `--network devproxy`, `--volumes-from ${apiContainer}`, `-w /app/site-auditor-debug`, img, `sh -lc ${JSON.stringify(cmd)}`]
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
 * Ensure best-practice Nginx overrides for MXTK when mounted under /mxtk
 * Idempotent: only appends missing blocks. Targets overrides/mxtk.conf.
 */
async function applyMxtkBestPractices() {
  try {
    const overridesPath = path.join(ROOT, 'overrides', 'mxtk.conf');
    if (!fs.existsSync(overridesPath)) {
      return { success: false, message: 'overrides/mxtk.conf not found' };
    }

    let content = fs.readFileSync(overridesPath, 'utf8');
    const original = content;

    const ensureBlock = (testRegex, block) => {
      if (!testRegex.test(content)) {
        content += (content.endsWith('\n') ? '' : '\n') + block + '\n';
      }
    };

    // Ensure CSP for /mxtk and /_next
    content = content.replace(/(location \^~ \/mxtk\/ \{[\s\S]*?)(\n\})/m, (m, a, b)=>{
      return /upgrade-insecure-requests/.test(a) ? m : a + "\n  add_header Content-Security-Policy \"upgrade-insecure-requests\" always;" + b;
    });
    content = content.replace(/(location \^~ \/_next\/ \{[\s\S]*?)(\n\})/m, (m, a, b)=>{
      return /upgrade-insecure-requests/.test(a) ? m : a + "\n  add_header Content-Security-Policy \"upgrade-insecure-requests\" always;" + b;
    });

    // Root helpers
    ensureBlock(/location\s*=\s*\/_next\s*\{\s*return\s+204;\s*\}/m, 'location = /_next { return 204; }');
    ensureBlock(/location\s*=\s*\/_next\/\s*\{\s*return\s+204;\s*\}/m, 'location = /_next/ { return 204; }');

    // Root public mappings for common assets
    ensureBlock(/location\s*=\s*\/logo-horizontal\.png/m, [
      'location = /logo-horizontal.png {',
      '  proxy_set_header Host $host;',
      '  proxy_set_header X-Forwarded-Proto https;',
      '  resolver 127.0.0.11 ipv6=off;',
      '  resolver_timeout 5s;',
      '  set $mxtk_site_dev mxtk-site-dev:2000;',
      '  proxy_pass http://$mxtk_site_dev/logo-horizontal.png;',
      '}'
    ].join('\n'));
    ensureBlock(/location\s*=\s*\/manifest\.json/m, [
      'location = /manifest.json {',
      '  proxy_set_header Host $host;',
      '  proxy_set_header X-Forwarded-Proto https;',
      '  resolver 127.0.0.11 ipv6=off;',
      '  resolver_timeout 5s;',
      '  set $mxtk_site_dev mxtk-site-dev:2000;',
      '  proxy_pass http://$mxtk_site_dev/manifest.json;',
      '}'
    ].join('\n'));

    // Removed app-specific root directories (/art, /icons) – keep proxy generic

    if (content !== original) {
      fs.writeFileSync(overridesPath, content, 'utf8');
      await regenerateNginxBundle();
      return { success: true, message: 'Applied MXTK best practices to overrides/mxtk.conf' };
    }
    return { success: true, message: 'MXTK best practices already present' };
  } catch (e) {
    return { success: false, message: `applyMxtkBestPractices failed: ${e.message}` };
  }
}

/**
 * Ensure /sdk Storybook + Vite overrides in overrides/encast.conf (idempotent), then regenerate Nginx.
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

    // Try to detect upstream variable used in this file; fall back to explicit service
    let upstreamVar = null;
    const bodyVar = content.match(/proxy_pass\s+http:\/\/\$([A-Za-z0-9_]+)/);
    if (bodyVar && bodyVar[1]) upstreamVar = bodyVar[1];
    if (!upstreamVar) {
      const setVar = content.match(/set\s+\$([A-Za-z0-9_]+)\s+[^;]+;/);
      if (setVar && setVar[1]) upstreamVar = setVar[1];
    }
    // Allow continuing even if we couldn't discover a variable

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
        // Normalize Host to SDK container to reduce Storybook/Vite allowedHosts friction
        '  proxy_set_header Host encast-sdk:6006;',
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
          : `  proxy_pass http://encast-sdk:6006/${pass};`),
        '}'
      ].join('\n');
      ensure(re, block);
    }

    // If the app is mounted at /sdk, also create root-level fallbacks for Storybook/Vite
    // This helps when the dev server emits absolute paths like "/@vite/client" instead of prefixing with /sdk
    if (routePrefix === '/sdk') {
      const rootGuards = [
        ['/@vite/', '@vite/'],
        ['/@id/', '@id/'],
        ['/@fs/', '@fs/'],
        ['/node_modules/', 'node_modules/'],
        ['/sb-common-assets/', 'sb-common-assets/'],
      ];
      for (const [loc, pass] of rootGuards){
        const safeLoc = loc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const re = new RegExp('location\\s*\\^~\\s*' + safeLoc, 'm');
        const isViteHmr = /@vite\//.test(pass);
        const block = [
          `location ^~ ${loc} {`,
          '  proxy_http_version 1.1;',
          '  # Normalize Host for dev server to reduce allowedHosts friction',
          '  proxy_set_header Host encast-sdk:6006;',
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
            : `  proxy_pass http://encast-sdk:6006/${pass};`),
          '}'
        ].join('\n');
        ensure(re, block);
      }

      // Discrete root assets that Storybook may request absolutely
      const rootFiles = [
        ['/index.json', '/index.json'],
        ['/vite-inject-mocker-entry.js', '/vite-inject-mocker-entry.js'],
        ['/favicon.svg', '/favicon.svg']
      ];
      for (const [eqPath, upstreamPath] of rootFiles){
        const reEq = new RegExp('location\\s*=\\s*' + eqPath.replace(/\//g,'\\/') + '\\s*\\{[\\s\\S]*?\\}', 'm');
        const block = [
          `location = ${eqPath} {`,
          '  proxy_http_version 1.1;',
          '  proxy_set_header Host encast-sdk:6006;',
          '  proxy_set_header X-Forwarded-Proto $scheme;',
          (upstreamVar
            ? `  proxy_pass http://$${upstreamVar}${upstreamPath};`
            : `  proxy_pass http://encast-sdk:6006${upstreamPath};`),
          '}'
        ].join('\n');
        ensure(reEq, block);
      }
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
    emit({ name: 'audit_pass_start', attempt: i+1, url, routePrefix });
    const run = await runSiteAuditor(url, { wait, timeout });
    const entry = { attempt: i+1, ok: run.ok, summary: run.summary, report: run.reportPath };
    passes.push(entry);
    emit({ name: 'audit_pass_complete', attempt: i+1, ok: run.ok, summary: run.summary });
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
          emit({ name: 'apply_generic_directory_guards', routePrefix });
          await applyGenericDirectoryGuards({ routePrefix, reportPath: run.reportPath || '' });
          // Ensure forwarded prefix on app root and add /<prefix>/_next support
          try { emit({ name: 'ensure_route_forwarded_prefix_and_next', routePrefix }); await ensureRouteForwardedPrefixAndNext({ routePrefix }); } catch {}
          emit({ name: 'fix_subpath_absolute_routing', routePrefix });
          await fixSubpathAbsoluteRouting({ routePrefix });
          continue; // next pass
        }

        // Detect Storybook/Vite SDK issues and apply overrides
        // No route-specific edits
      }
    } catch {}

    // If no targeted action detected, still try best practices once
    if (i === 0) { emit({ name: 'apply_generic_directory_guards', routePrefix }); await applyGenericDirectoryGuards({ routePrefix, reportPath: run.reportPath||'' }); continue; }
    break; // avoid infinite loop
  }
  emit({ name: 'audit_and_heal_complete', success: false });
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
    applyStorybookViteProxyGuards
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
      return { success: false, message: 'apps/encast.conf not found' };
    }
    // Leave as-is; app-specific changes should be avoided in generic mode.
    return { success: false, message: 'Skipped app-specific Storybook config (guardrail)' };
  } catch (e) {
    return { success: false, message: `fixStorybookViteProxyConfig failed: ${e.message}` };
  }
}

/**
 * Fix React bundle serving issues for subpath deployments
 */
async function fixReactBundleSubpathIssues(routePrefix = '/impact') {
  return { success: false, message: 'Skipped app-specific React bundle fix (guardrail)' };
}

/**
 * Fix React static asset routing issues with proper path handling
 */
async function fixReactStaticAssetRouting(routePrefix = '/impact') {
  return { success: false, message: 'Skipped app-specific React static asset fix (guardrail)' };
}

/**
 * Fix mxtk API absolute-path routing and Next dev helper endpoints
 */
async function fixMxtkApiRouting() { return { success:false, message:'Skipped app-specific MXTK API fix (guardrail)' }; }

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
          if (src) targetConf = path.join(ROOT, 'apps', src);
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
  
  // Core infrastructure
  regenerateNginxBundle
};
