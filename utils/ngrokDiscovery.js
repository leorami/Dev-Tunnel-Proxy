const { execSync } = require('child_process');

/**
 * Discover the ngrok public URL by querying the container logs or API.
 * Tries:
 * 1) docker exec dev-ngrok curl http://localhost:4040/api/tunnels
 * 2) docker logs dev-ngrok and regex the URL
 */
function discoverNgrokUrl() {
  // 0) Try static domain via container env
  try {
    const envDomain = execSync('docker exec dev-ngrok sh -c "printenv NGROK_STATIC_DOMAIN || true"', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
    if (envDomain) return `https://${envDomain}`;
  } catch (e) {}

  try {
    const cmd = 'docker exec dev-ngrok sh -c "if command -v curl >/dev/null 2>&1; then curl -sf http://localhost:4040/api/tunnels; elif command -v wget >/dev/null 2>&1; then wget -qO- http://localhost:4040/api/tunnels; else cat /dev/null; fi"';
    const json = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    if (json && json.trim().startsWith('{')) {
      const data = JSON.parse(json);
      const proxy = (data.tunnels || []).find(t => (t.name || '').includes('proxy') || (t.config && (t.config.addr || '').includes('proxy:80')));
      if (proxy && proxy.public_url) return proxy.public_url;
    }
  } catch (e) {}

  try {
    const logs = execSync('docker logs dev-ngrok 2>&1 | cat', { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    // Explicit static domain hint from our entrypoint
    const mStatic = logs.match(/ngrok:\s+using static domain '([^']+)'/i);
    if (mStatic && mStatic[1]) return `https://${mStatic[1]}`;
    // Generic ngrok public URL pattern
    const m = logs.match(/(https:\/\/[-a-z0-9.]+\.ngrok(?:-free)?\.app)/i);
    if (m) return m[1];
  } catch (e) {}

  return null;
}

module.exports = { discoverNgrokUrl };


