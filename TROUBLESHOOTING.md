# Dev Tunnel Proxy Troubleshooting Guide

## Common Configuration Issues & Solutions

This guide documents common problems and their solutions when integrating apps with the dev tunnel proxy.

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

### 3. Next.js basePath Trailing Slash Issues

**Problem**: Next.js apps with `basePath` have specific URL canonicalization behavior.

**Symptoms**:
- Infinite redirect loops
- 308 Permanent Redirect responses
- App works in direct access but not through proxy

**Understanding Next.js Behavior**:
- Next.js prefers canonical URLs (usually without trailing slash for routes)
- `/myapp/` often redirects to `/myapp` 
- HMR and assets expect exact path matching

**Solution**: Handle both slash variants in nginx.

```nginx
# Handle both /myapp and /myapp/ 
location ~ ^/myapp/?$ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp;
}

# Handle sub-routes /myapp/anything
location ~ ^/myapp/.+ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream;
}
```

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
