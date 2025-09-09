const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Cache mechanism for ngrok URL
let cachedNgrokUrl = null;
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function tryFetch(url){
  try{
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), 700);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json().catch(()=>null);
    return j;
  }catch{ return null; }
}

/**
 * Try to get the ngrok URL from the status.json file first
 * This is more reliable as it's the source used by the status UI
 */
function getNgrokFromStatusJson() {
  try {
    const rootDir = path.resolve(__dirname, '..');
    const statusJsonPath = path.join(rootDir, 'status.json');
    const healthJsonPath = path.join(rootDir, '.artifacts', 'reports', 'health-latest.json');
    
    // Try status.json first
    if (fs.existsSync(statusJsonPath)) {
      const statusData = JSON.parse(fs.readFileSync(statusJsonPath, 'utf8'));
      if (statusData.ngrok && statusData.ngrok !== 'not discovered') {
        return statusData.ngrok;
      }
    }
    
    // Try health-latest.json next
    if (fs.existsSync(healthJsonPath)) {
      const healthData = JSON.parse(fs.readFileSync(healthJsonPath, 'utf8'));
      if (healthData.ngrok && healthData.ngrok !== 'not discovered') {
        return healthData.ngrok;
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract static domain from logs - this pattern consistently shows up in the logs
 * when a static domain is configured
 */
function getStaticDomainFromLogs() {
  try {
    const logs = execSync('docker logs dev-ngrok 2>&1 | grep "ngrok: using static domain" || true', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    const mStatic = logs.match(/ngrok:\s+using static domain '([^']+)'/i);
    if (mStatic && mStatic[1]) {
      return `https://${mStatic[1]}`;
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Discover the ngrok public URL by querying the container logs or API.
 * Improved reliability with caching and multiple fallback strategies.
 * 
 * Strategy:
 * 1) Check cache if valid
 * 2) Check status.json and health-latest.json
 * 3) Check for static domain in env var and logs
 * 4) Try the ngrok API over Docker network
 * 5) Try docker exec to query the API inside the container
 * 6) Parse container logs for URL patterns
 */
async function discoverNgrokUrl(forceRefresh = false) {
  // Return cached URL if still valid and not forced to refresh
  if (!forceRefresh && cachedNgrokUrl && Date.now() < cacheExpiry) {
    return cachedNgrokUrl;
  }
  
  // 1) Check status.json and health-latest.json first
  const ngrokFromJson = getNgrokFromStatusJson();
  if (ngrokFromJson) {
    cachedNgrokUrl = ngrokFromJson;
    cacheExpiry = Date.now() + CACHE_DURATION;
    return ngrokFromJson;
  }
  
  // 2) Check for static domain in logs - highly reliable
  const staticDomain = getStaticDomainFromLogs();
  if (staticDomain) {
    cachedNgrokUrl = staticDomain;
    cacheExpiry = Date.now() + CACHE_DURATION;
    return staticDomain;
  }
  
  // 3) Try static domain via container env
  try {
    const envDomain = execSync('docker exec dev-ngrok sh -c "printenv NGROK_STATIC_DOMAIN || true"', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
    if (envDomain) {
      const url = `https://${envDomain}`;
      cachedNgrokUrl = url;
      cacheExpiry = Date.now() + CACHE_DURATION;
      return url;
    }
  } catch (e) {}
  
  // 4) Try hitting the dev-ngrok API directly over the Docker network
  try {
    const json = execSync('sh -lc "wget -qO- http://dev-ngrok:4040/api/tunnels || curl -sf http://dev-ngrok:4040/api/tunnels || true"', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    if (json && json.trim().startsWith('{')) {
      const data = JSON.parse(json);
      const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
      const pick = tunnels.find(t => (t.public_url||'').startsWith('https://')) || tunnels.find(t=>t.public_url);
      if (pick && pick.public_url) {
        cachedNgrokUrl = pick.public_url;
        cacheExpiry = Date.now() + CACHE_DURATION;
        return pick.public_url;
      }
    }
  } catch (e) {}
  
  // 5) Try reaching dev-ngrok API with fetch (for Node environments)
  if (typeof fetch === 'function') {
    try {
      // Try both common hostnames in parallel
      const [result1, result2] = await Promise.all([
        tryFetch('http://dev-ngrok:4040/api/tunnels').catch(() => null),
        tryFetch('http://ngrok:4040/api/tunnels').catch(() => null)
      ]);
      
      const data = result1 || result2;
      if (data && Array.isArray(data.tunnels) && data.tunnels.length > 0) {
        const pick = data.tunnels.find(t => (t.public_url||'').startsWith('https://')) || data.tunnels.find(t=>t.public_url);
        if (pick && pick.public_url) {
          cachedNgrokUrl = pick.public_url;
          cacheExpiry = Date.now() + CACHE_DURATION;
          return pick.public_url;
        }
      }
    } catch (e) {}
  }
  
  // 6) Try docker exec to query the API inside the container
  try {
    const cmd = 'docker exec dev-ngrok sh -c "if command -v curl >/dev/null 2>&1; then curl -sf http://localhost:4040/api/tunnels; elif command -v wget >/dev/null 2>&1; then wget -qO- http://localhost:4040/api/tunnels; else cat /dev/null; fi"';
    const json = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    if (json && json.trim().startsWith('{')) {
      const data = JSON.parse(json);
      const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
      // Prefer https, then http. Prefer ones pointing at dev-proxy/proxy or port 80.
      const score = (t) => {
        let s = 0;
        if ((t.public_url || '').startsWith('https://')) s += 10;
        const addr = (t.config && t.config.addr) || '';
        if (/dev-?proxy|proxy/i.test(addr)) s += 5;
        if (/:80(\b|$)/.test(addr)) s += 3;
        if ((t.name || '').toLowerCase().includes('proxy')) s += 2;
        return s;
      };
      const best = tunnels
        .slice()
        .sort((a,b)=> score(b)-score(a))
        .find(t => t.public_url);
      if (best && best.public_url) {
        cachedNgrokUrl = best.public_url;
        cacheExpiry = Date.now() + CACHE_DURATION;
        return best.public_url;
      }
    }
  } catch (e) {}
  
  // 7) Last resort: parse logs for URL patterns
  try {
    const logs = execSync('docker logs dev-ngrok 2>&1 | tail -n 200', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    // Generic ngrok public URL pattern
    const m = logs.match(/(https:\/\/[-a-z0-9.]+\.ngrok(?:-free)?\.app)/i);
    if (m) {
      cachedNgrokUrl = m[1];
      cacheExpiry = Date.now() + CACHE_DURATION;
      return m[1];
    }
  } catch (e) {}
  
  return null;
}

// Synchronous version for callers that can't use async/await
function discoverNgrokUrlSync() {
  // Use cached value if available
  if (cachedNgrokUrl && Date.now() < cacheExpiry) {
    return cachedNgrokUrl;
  }
  
  // Try the non-async methods in sequence
  const fromJson = getNgrokFromStatusJson();
  if (fromJson) {
    cachedNgrokUrl = fromJson;
    cacheExpiry = Date.now() + CACHE_DURATION;
    return fromJson;
  }
  
  const staticDomain = getStaticDomainFromLogs();
  if (staticDomain) {
    cachedNgrokUrl = staticDomain;
    cacheExpiry = Date.now() + CACHE_DURATION;
    return staticDomain;
  }
  
  // Run the original methods that don't require await
  try {
    // Try static domain via container env
    const envDomain = execSync('docker exec dev-ngrok sh -c "printenv NGROK_STATIC_DOMAIN || true"', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
    if (envDomain) {
      const url = `https://${envDomain}`;
      cachedNgrokUrl = url;
      cacheExpiry = Date.now() + CACHE_DURATION;
      return url;
    }
    
    // Try API via exec
    const cmd = 'docker exec dev-ngrok sh -c "if command -v curl >/dev/null 2>&1; then curl -sf http://localhost:4040/api/tunnels; elif command -v wget >/dev/null 2>&1; then wget -qO- http://localhost:4040/api/tunnels; else cat /dev/null; fi"';
    const json = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    if (json && json.trim().startsWith('{')) {
      const data = JSON.parse(json);
      const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
      const pick = tunnels.find(t => (t.public_url||'').startsWith('https://')) || tunnels.find(t=>t.public_url);
      if (pick && pick.public_url) {
        cachedNgrokUrl = pick.public_url;
        cacheExpiry = Date.now() + CACHE_DURATION;
        return pick.public_url;
      }
    }
    
    // Parse logs
    const logs = execSync('docker logs dev-ngrok 2>&1 | cat', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    const m = logs.match(/(https:\/\/[-a-z0-9.]+\.ngrok(?:-free)?\.app)/i);
    if (m) {
      cachedNgrokUrl = m[1];
      cacheExpiry = Date.now() + CACHE_DURATION;
      return m[1];
    }
  } catch (e) {}
  
  return null;
}

module.exports = { discoverNgrokUrl, discoverNgrokUrlSync };


