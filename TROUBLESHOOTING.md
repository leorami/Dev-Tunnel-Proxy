# Dev Tunnel Proxy Troubleshooting Guide

## Common Configuration Issues & Solutions

This guide documents common problems and their solutions when integrating apps with the dev tunnel proxy. Updated to include troubleshooting for the **enhanced Status Dashboard** with route grouping and promotion features.

### 0. Critical: proxy_pass Trailing Slash Behavior

**Problem**: Adding a trailing slash to `proxy_pass` directives can break apps that expect their URL prefix preserved.

**Wrong Configuration:**
```nginx
location /myapp/ {
    proxy_pass http://upstream:3000/;  # ❌ Strips /myapp/ prefix
}
```

**Correct Configuration:**
```nginx
location /myapp/ {
    proxy_pass http://upstream:3000;   # ✅ Preserves /myapp/ prefix
}
```

**Why This Matters:**
- With trailing slash: Request to `/myapp/api/data` becomes `/api/data` to upstream
- Without trailing slash: Request to `/myapp/api/data` stays `/myapp/api/data` to upstream
- Apps expecting their prefix (like React apps with `PUBLIC_URL` or Next.js with `basePath`) break when prefix is stripped
- JavaScript bundles return HTML fallback instead of JS, causing `Uncaught SyntaxError: Unexpected token '<'`

**Common Symptoms:**
- App loads but JavaScript fails with syntax errors
- Assets return HTML instead of expected content (JS/CSS)
- API calls fail with 404 because paths don't match
- Bundle size unexpectedly small (~2KB instead of ~MB)

**Prevention:**
- Always comment why trailing slash is/isn't used
- Test immediately after changing proxy_pass directives
- Check that bundles return correct Content-Type

```nginx
# Example with clear intent
location /myapp/ {
    set $myapp_upstream myapp-service:3000;
    proxy_pass http://$myapp_upstream;  # no trailing slash preserves /myapp/
}
```

### 1. Container Name Mismatches

**Problem**: Nginx config references wrong container names, causing connection failures.

**Symptoms**:
- `proxy_pass` returns 502 Bad Gateway
- DNS resolution errors in nginx logs
- Container exists but proxy can't connect

**Solution**: Verify actual container names match nginx configuration.

```bash
# Check actual container names on the devproxy network
docker network inspect devproxy --format='{{json .Containers}}' | jq

# Common mistake: using generic names instead of actual container names
# ❌ Wrong:  proxy_pass http://myapp:3000;
# ✅ Correct: proxy_pass http://myapp-site-dev-myapp:3000;
```

### 2. Missing Variable Resolution for Upstreams

**Problem**: Nginx fails to start when upstream services aren't available at startup.

**Symptoms**:
- `nginx: [emerg] host not found in upstream "service-name"`
- Container exits with code 1
- Proxy works when all services are running, fails on restart

**Solution**: Always use nginx variables for upstream resolution.

```nginx
# ❌ Wrong: Hardcoded upstream (fails if service is down)
location /myapp/ {
  proxy_pass http://myapp-service:3000/;
}

# ✅ Correct: Variable resolution (defers DNS lookup)
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:3000;
  proxy_pass http://$myapp_upstream/;
}
```

### 3. Next.js Redirect Loop Issues (Critical)

**Problem**: Next.js apps with `basePath` can cause redirect loops, especially with `/_next/` assets.

**Common Symptoms**:
- **308 Permanent Redirects** on `/_next/` directory requests
- Infinite redirect loops between `/myapp` and `/myapp/`  
- Assets fail to load with redirect errors
- HMR connections fail

**Root Cause**: Competing nginx rules and improper trailing slash handling.

**❌ Problematic Patterns**:
```nginx
# This causes 308 redirects
location /myapp/_next/ {
  proxy_pass http://upstream/myapp/_next/;  # trailing slash problematic
}

# This can cause redirect loops
location = /myapp { rewrite ^ /myapp/ last; }
```

**✅ Proven Solutions (from MXTK success)**:

**1. Use Regex for Route Variants**
```nginx
# Handles both /myapp and /myapp/ without redirects
location ~ ^/myapp/?$ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp;  # no trailing slash
}
```

**2. Split _next/ Handling**
```nginx
# Handle bare directory (prevents 308)
location = /myapp/_next/ {
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp/_next;  # no trailing slash!
}

# Handle specific files
location ~ ^/myapp/_next/(.+)$ {
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp/_next/$1;
}
```

**3. Handle Root Assets**  
```nginx
# Many Next.js apps reference /icons/ without basePath
location /icons/ {
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/icons/;
}
```

**Prevention**: Always test both `/myapp` and `/myapp/_next/` for redirects after configuration changes.

### 4. Essential Proxy Headers

**Problem**: Missing headers cause issues with WebSocket connections, HTTPS redirects, etc.

**Required Headers**:

```nginx
location /myapp/ {
  # Basic forwarding
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  
  # WebSocket support (for HMR)
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  # Development helpers
  proxy_set_header ngrok-skip-browser-warning "true";
  
  # Timeouts for development
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
}
```

### 5. Docker Network Connectivity

**Problem**: Containers can't communicate even when on the same network.

**Verification Steps**:

```bash
# 1. Check if container is on devproxy network
docker network inspect devproxy

# 2. Test DNS resolution from proxy container
docker exec dev-proxy nslookup myapp-service

# 3. Test direct connectivity
docker exec dev-proxy wget -qO- --timeout=5 http://myapp-service:3000/

# 4. Check what ports the service is actually listening on
docker exec myapp-service netstat -tlnp
```

### 6. Configuration Validation

Before deploying nginx changes:

```bash
# Test nginx syntax
docker exec dev-proxy nginx -t

# Reload safely (won't fail if upstreams are down)
./scripts/reload.sh

# Check proxy logs
docker-compose logs proxy --tail=20
```

### 7. Generated Bundle & Overrides (🆕)

**Symptoms**:
- A prior fix seems overwritten when another project updates its snippet
- Changes in `apps/*.conf` don't apply after restart

**Explanation**:
- Nginx now serves a generated bundle from `build/sites-enabled/apps.generated.conf`.
- Proxy-owned `overrides/*.conf` win over app snippets.

**Actions**:
- Inspect the generated file to see what was composed.
- Put persistent proxy-side fixes into `overrides/*.conf`.
- Regenerate explicitly if needed:
  ```bash
  node utils/generateAppsBundle.js
  ./scripts/reload.sh
  ```

## Enhanced Status Dashboard Issues (🆕)

### 8. Route Grouping Problems

**Problem**: Routes not appearing in expected upstream groups or missing from status dashboard.

**Common Causes & Solutions**:

**Routes appear ungrouped or in wrong groups**:
```bash
# Check actual upstream values in your config
grep -r "proxy_pass" apps/*.conf

# Ensure consistent upstream naming
# ❌ Wrong: Mixed upstream formats
# apps/myapp.conf: proxy_pass http://myapp-service:3000/;
# apps/myapp2.conf: proxy_pass http://myapp-service:3000;

# ✅ Correct: Consistent upstream format  
# Both configs should use identical upstream strings
```

**Routes missing from status entirely**:
- **Check config syntax**: Invalid nginx configs are ignored
- **Verify file names**: Only `*.conf` files in `apps/` are scanned
- **Run manual scan**: `node test/scanApps.js` to see parsing errors

### 9. Open Button URL Problems  

**Problem**: "Open" buttons not using correct ngrok URLs or opening wrong pages.

**Symptoms**:
- Opens localhost URLs instead of ngrok tunnel
- Opens wrong subdirectory (e.g., opens `/app` instead of `/app/admin`)
- 404 errors when clicking Open button

**Solutions**:
```bash
# 1. Check ngrok URL detection
curl http://localhost:8080/status.json | jq '.ngrok'

# 2. Verify route paths match expectations
# Open button constructs: ngrok_url + route_path
# For route "/api/", URL becomes "https://xyz.ngrok.app/api/"

# 3. Check for trailing slash consistency
# Your app should handle both /api and /api/ correctly
```

### 10. Route Promotion Issues

**Problem**: Cannot promote routes or promotion state not persisting.

**Debugging Steps**:
```bash
# Check localStorage persistence
# In browser console on /status page:
localStorage.getItem('routePromotions')

# Should show: {"http://upstream:port":"/promoted/route"}

# Clear corrupted promotion data if needed:
localStorage.removeItem('routePromotions')
```

**Common Issues**:
- **Routes with variables**: Routes using nginx variables (like `$upstream`) are treated as literal strings for grouping
- **Multiple identical upstreams**: All routes pointing to the same upstream will be grouped together
- **Broken localStorage**: Clear browser data if promotion state is corrupted

### 11. Live Reload Button Problems

**Problem**: Reload button shows errors or doesn't refresh data.

**Expected Behavior**: 
- Click reload → Shows spinning icon → Success checkmark → Data refreshes

**Troubleshooting**:
```bash
# 1. Check if auto-scan service is running
docker-compose ps auto-scan

# 2. Manual config regeneration
node test/scanApps.js
./scripts/smart-build.sh

# 3. Check browser console for JavaScript errors
# Should show: "✅ Routes data refreshed"
```

**Common Reload Issues**:
- **Stale data**: Browser cache preventing updates
- **Config syntax errors**: Invalid nginx configs prevent successful reload
- **File permissions**: Cannot write updated route data

## Project Integration Checklist

When adding a new app to the dev tunnel proxy:

- [ ] **Verify container name**: Check actual running container name vs nginx config
- [ ] **Use variable resolution**: Never hardcode upstream hosts
- [ ] **Include essential headers**: Host, forwarding, WebSocket support  
- [ ] **Join devproxy network**: Ensure container is connected to shared network
- [ ] **Handle trailing slashes**: Especially for Next.js apps with basePath
- [ ] **Test both endpoints**: Verify both localhost:8080 and ngrok URL work
- [ ] **Check HMR/WebSocket**: Ensure development features work through proxy

## Emergency Recovery

If the proxy is completely broken:

```bash
# 1. Check what went wrong
docker-compose ps
docker-compose logs proxy

# 2. Restore default configuration (if corrupted)
git checkout HEAD -- config/default.conf

# 3. Restart proxy
docker-compose restart proxy

# 4. Verify basic health
curl http://localhost:8080/health.json
```

## When to Contact Dev Tunnel Proxy Maintainer

Contact the proxy maintainer if you encounter:
- Core health endpoints (`/health.json`, `/status`) returning 404
- `default.conf` missing essential proxy infrastructure
- Docker network `devproxy` not existing or misconfigured
- `hardenUpstreams.js` utility causing configuration corruption

These indicate proxy infrastructure problems, not app configuration issues.
