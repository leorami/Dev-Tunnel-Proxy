# Proxy Resilience and Error Handling

**Version**: 1.1  
**Last Updated**: December 2025

## Overview

The Dev Tunnel Proxy is designed to be resilient and gracefully handle unavailable upstream services. This document explains the resilience features and how they work.

## Problem Statement

In development environments, services frequently start and stop. Without proper resilience:

- **Nginx won't start** if any configured upstream is unavailable
- **Hard failures** with cryptic error messages confuse developers
- **Cascading failures** where one service being down breaks the entire proxy
- **Manual intervention** required to restart proxy after fixing upstream issues

## Solution Architecture

### 1. Variable-Based Upstream Resolution

**What**: All `proxy_pass` directives use nginx variables instead of hardcoded hostnames.

**Why**: Defers DNS resolution from config-load time to request time.

**Example**:
```nginx
# Before (fails at startup if service is down)
location /myapp/ {
  proxy_pass http://myapp:3000/;
}

# After (starts successfully, resolves at request time)
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  proxy_pass http://$myapp_upstream/;
}
```

**Benefits**:
- Nginx starts even if all app services are offline
- Services can be started in any order
- DNS resolution happens per-request using Docker's internal DNS
- Failed DNS lookups don't prevent proxy startup

### 2. Graceful Error Handling

**What**: Intercept upstream errors and return friendly JSON responses.

**Why**: Users get helpful error messages instead of nginx error pages.

**Example**:
```nginx
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  
  # Intercept errors from upstream
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$myapp_upstream/;
}

# Global error handler
location @upstream_unavailable {
  add_header Content-Type application/json;
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  return 503 '{"error":"Service Unavailable","message":"The requested application is not currently running. Please start the service and try again.","status":503}';
}
```

**Error Codes Handled**:
- **502 Bad Gateway** - Service exists but returned invalid response
- **503 Service Unavailable** - Service is temporarily down
- **504 Gateway Timeout** - Service didn't respond in time

**Response Format**:
```json
{
  "error": "Service Unavailable",
  "message": "The requested application is not currently running. Please start the service and try again.",
  "status": 503
}
```

### 3. Emergency Fallback System

**What**: Multi-stage validation in nginx entrypoint script.

**How**:
1. **First attempt**: Validate full config including app bundle
2. **Fallback**: Disable app bundle if validation fails
3. **Final check**: If still failing, show detailed troubleshooting steps

**Implementation** (`scripts/nginx-entrypoint.sh`):
```bash
# First try: validate current config
if nginx -t; then
  exec nginx -g 'daemon off;'
fi

# Emergency fallback: disable app bundle
if [ -f "/etc/nginx/conf.d/sites-enabled/apps.generated.conf" ]; then
  mv /etc/nginx/conf.d/sites-enabled/apps.generated.conf \
     /etc/nginx/conf.d/sites-enabled/apps.generated.conf.disabled
fi

# Retry with bundle disabled
if nginx -t; then
  echo "⚠ WARNING: App routes are disabled. Check app configs for errors."
  exec nginx -g 'daemon off;'
fi

# Final failure with troubleshooting steps
echo "✗ Fallback still failing; nginx cannot start"
echo "Troubleshooting steps: ..."
exit 1
```

**Benefits**:
- Core proxy UI and API remain accessible even if app configs have errors
- Administrators can diagnose and fix issues via web interface
- Clear error messages guide troubleshooting

### 4. Automatic Hardening

**What**: The `generateAppsBundle.js` script automatically adds resilience directives.

**Process**:
1. Reads app configs from `apps/` and `overrides/`
2. Parses each `location` block
3. Detects `proxy_pass` directives
4. Adds resolver and error handling if missing
5. Normalizes variable usage
6. Generates hardened bundle

**Example Transformation**:
```nginx
# Input (apps/myapp.conf)
location /myapp/ {
  proxy_pass http://myapp:3000/;
}

# Output (build/sites-enabled/apps.generated.conf)
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $up_myapp_3000_1 myapp:3000;
  # Graceful error handling for unavailable upstream
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  proxy_pass http://$up_myapp_3000_1/;
}
```

**Automatic Features**:
- Unique variable names per location block
- Resolver configuration
- Error page directives
- Global error handler injection
- Variable normalization (removes `http://` from variable definitions)

## Configuration Examples

### Basic App Proxy

```nginx
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$myapp_upstream/;
}
```

### API with Path Rewriting

```nginx
location /api/ {
  rewrite ^/api/(.*)$ /$1 break;
  
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $api_upstream api:8000;
  
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$api_upstream;
}
```

### WebSocket Support (HMR)

```nginx
location ^~ /myapp/_next/ {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$myapp_upstream;
}
```

## Testing Resilience

### Test 1: Proxy Starts with Services Down

```bash
# Stop all app services
docker-compose stop myapp api

# Restart proxy
docker-compose restart proxy

# Check proxy is running
docker ps | grep dev-proxy

# Test error handling
curl http://localhost:8080/myapp/
# Should return: {"error":"Service Unavailable",...}
```

### Test 2: Services Can Start After Proxy

```bash
# Start proxy first
docker-compose up -d proxy

# Start app later
docker-compose up -d myapp

# Test app is accessible
curl http://localhost:8080/myapp/
# Should return: app content
```

### Test 3: Emergency Fallback

```bash
# Create invalid app config
echo 'location /bad/ { invalid_directive; }' > apps/bad.conf

# Regenerate bundle
node utils/generateAppsBundle.js

# Restart proxy
docker-compose restart proxy

# Check logs
docker logs dev-proxy
# Should show: "WARNING: App routes are disabled"

# Core UI should still work
curl http://localhost:8080/
# Should return: status page HTML
```

## Monitoring and Debugging

### Check Nginx Config Validity

```bash
docker exec dev-proxy nginx -t
```

### View DNS Resolution Logs

```bash
docker logs dev-proxy 2>&1 | grep "could not be resolved"
```

### Test Upstream Connectivity

```bash
# From proxy container
docker exec dev-proxy nslookup myapp

# From host
docker exec dev-proxy wget -qO- http://myapp:3000/
```

### Check Error Handler Responses

```bash
# Stop a service
docker-compose stop myapp

# Test error response
curl -i http://localhost:8080/myapp/
# Should return: HTTP/1.1 503 Service Unavailable
# Content-Type: application/json
# {"error":"Service Unavailable",...}
```

## Best Practices

### 1. Always Use Variables

❌ **Don't**:
```nginx
proxy_pass http://myapp:3000/;
```

✅ **Do**:
```nginx
resolver 127.0.0.11 ipv6=off;
resolver_timeout 5s;
set $myapp_upstream myapp:3000;
proxy_pass http://$myapp_upstream/;
```

### 2. Add Error Handling

❌ **Don't**:
```nginx
proxy_pass http://$upstream/;
```

✅ **Do**:
```nginx
proxy_intercept_errors on;
error_page 502 503 504 = @upstream_unavailable;
proxy_pass http://$upstream/;
```

### 3. Use Descriptive Variable Names

❌ **Don't**:
```nginx
set $u myapp:3000;
```

✅ **Do**:
```nginx
set $myapp_upstream myapp:3000;
```

### 4. Document Intent

✅ **Do**:
```nginx
# CRITICAL: Use variables for upstream resolution to allow
# nginx to start even if myapp service is not running yet
resolver 127.0.0.11 ipv6=off;
resolver_timeout 5s;
set $myapp_upstream myapp:3000;
proxy_pass http://$myapp_upstream/;
```

## Troubleshooting

### Issue: "host not found in upstream"

**Cause**: Hardcoded upstream in config

**Solution**: Convert to variable-based resolution

### Issue: "invalid URL prefix in http://"

**Cause**: Variable contains `http://` prefix

**Solution**: Remove `http://` from variable definition:
```nginx
# Wrong
set $upstream http://myapp:3000;

# Correct
set $upstream myapp:3000;
```

### Issue: Nginx returns error page instead of JSON

**Cause**: Missing `proxy_intercept_errors on`

**Solution**: Add error interception:
```nginx
proxy_intercept_errors on;
error_page 502 503 504 = @upstream_unavailable;
```

### Issue: Error handler not found

**Cause**: Missing global error handler location block

**Solution**: Add to config or regenerate bundle:
```bash
node utils/generateAppsBundle.js
docker-compose restart proxy
```

## Version History

### v1.1 (December 2025)
- Added automatic error handling to `generateAppsBundle.js`
- Implemented `@upstream_unavailable` error handler
- Enhanced nginx entrypoint with emergency fallback
- Updated all core configs to use variable resolution
- Added comprehensive documentation

### v0.9 (Prior)
- Initial variable-based upstream resolution
- Basic resolver configuration

## See Also

- [Architecture Documentation](ARCHITECTURE.md) - System design and component interaction
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [Known Issues](KNOWN_ISSUES.md) - Current limitations and workarounds
- [Configuration Management Guide](CONFIG-MANAGEMENT-GUIDE.md) - How to manage app configs
