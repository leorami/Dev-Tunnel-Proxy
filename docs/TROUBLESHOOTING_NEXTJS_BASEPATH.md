# Troubleshooting Next.js Apps with basePath

## Issue: Public ngrok URL returns 503 JSON; localhost app port works

### Symptoms

- `http://localhost:3100/myapp` (or your dev port) works.
- `http://localhost:8080/myapp` or `https://your-domain.ngrok.app/myapp` returns **503** with body:
  `{"error":"Service Unavailable","message":"The requested application is not currently running..."}`.
- `https://your-domain.ngrok.app/health.json` or `/status` may still work (tunnel and proxy are up).

### Root Cause

Nginx in **`dev-proxy`** proxies to Docker service names (e.g. `myapp-web:3100`). Those names only resolve if the app containers are on the **`devproxy`** network. Host port mapping (`3100:3100`) does not put the container on `devproxy`. After **`docker compose up`** recreates containers, a previous manual `docker network connect` is **gone**.

### Solution

```bash
docker network connect devproxy myapp-web
# repeat for each upstream hostname in apps/*.conf (e.g. myapp-api)
```

Make it permanent with `networks: devproxy: external: true` in your app compose (see [INTEGRATION_GUIDE.md](../INTEGRATION_GUIDE.md)).

### Verify

```bash
docker network inspect devproxy --format '{{range .Containers}}{{.Name}} {{end}}' | tr ' ' '\n' | grep myapp
docker exec dev-proxy getent hosts myapp-web
```

## Issue: 503 Service Unavailable or 308 Redirect Loop

### Symptoms

- App config is installed in `apps/` directory
- Containers are running (`docker ps` shows them up)
- Getting 503 or 308 redirect errors when accessing the route
- Nginx logs show no upstream connection

### Root Cause

**Missing Docker Network Connection**: App containers must be on the `devproxy` network for nginx to reach them.

### Solution

```bash
# Connect your app containers to the devproxy network
docker network connect devproxy your-web-container
docker network connect devproxy your-api-container

# Verify connection
docker network inspect devproxy --format '{{range .Containers}}{{.Name}} {{end}}'
```

## Issue: 308 Permanent Redirect Loop with Next.js basePath

### Symptoms

- App works at `/myapp` but returns 308 at `/myapp/`
- Or vice versa - redirect loop between with/without trailing slash
- Browser shows "Too many redirects" error

### Root Cause

Next.js apps with `basePath` configuration have specific trailing slash requirements:

- **Without `trailingSlash: true`**: Next.js expects `/myapp`, `/myapp/page` (NO trailing slash on basePath)
- **With `trailingSlash: true`**: Next.js expects `/myapp/`, `/myapp/page/` (trailing slash everywhere)

Common nginx config adds `location = /myapp { return 302 /myapp/; }` which conflicts with Next.js's default behavior.

### Solution

#### Option 1: Proxy the bare path (Recommended)

Instead of redirecting `/myapp` to `/myapp/`, proxy it directly to the Next.js app:

```nginx
# Proxy bare /myapp to Next.js app (it will handle routing)
location = /myapp {
  resolver 127.0.0.11 ipv6=off valid=10s;
  resolver_timeout 5s;
  set $myapp_web myapp-web:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_pass http://$myapp_web;
}

# Main location for all other paths
location ^~ /myapp/ {
  # ... same proxy config ...
}
```

#### Option 2: Fix Next.js config

Add `trailingSlash: true` to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/myapp',
  trailingSlash: true,  // ← Add this
  // ... rest of config
}

module.exports = nextConfig
```

Then the nginx redirect will work:

```nginx
location = /myapp {
  return 302 /myapp/;
}
```

### Verification

```bash
# Test without trailing slash
curl -L -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/myapp
# Should return: 200

# Test with trailing slash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/myapp/
# Should return: 200 or 308 (depending on solution chosen)
```

## Issue: API Routes Return 503

### Symptoms

- Web app works at `/myapp`
- API routes like `/myapp/api/health` return 503
- Docker logs show API container crashed or has errors

### Root Cause

API container is not running properly. Common causes:
- Missing dependencies (e.g., `@aws-sdk/client-s3`)
- Database connection failures
- Environment variable issues
- Port conflicts

### Solution

1. **Check API container logs:**

```bash
docker logs your-api-container --tail 50
```

2. **Look for specific errors:**
   - `MODULE_NOT_FOUND` → Missing npm dependencies
   - `ECONNREFUSED` → Database/Redis not accessible
   - `Error: listen EADDRINUSE` → Port conflict

3. **Fix and restart:**

```bash
# If missing dependencies
docker exec your-api-container npm install

# If database connection issue
docker network inspect devproxy  # Verify DB is on network

# Restart container
docker restart your-api-container
```

## Best Practices

### 1. Always Connect to devproxy Network

Add to your `docker-compose.yml`:

```yaml
services:
  myapp-web:
    # ... your config ...
    networks:
      - devproxy

  myapp-api:
    # ... your config ...
    networks:
      - devproxy

networks:
  devproxy:
    external: true
    name: devproxy
```

### 2. Test Both Paths

Always test both with and without trailing slash:

```bash
curl -I http://localhost:8080/myapp
curl -I http://localhost:8080/myapp/
```

### 3. Check Container Health

```bash
# List containers
docker ps --filter "name=myapp"

# Check logs
docker logs myapp-web --tail 20
docker logs myapp-api --tail 20

# Verify network
docker network inspect devproxy | grep -A5 myapp
```

### 4. Use Health Checks

Add health checks to your nginx config:

```nginx
location ^~ /myapp/health {
  # ... proxy to API health endpoint ...
}
```

Then monitor via:

```bash
curl http://localhost:8080/myapp/health
```

## Quick Diagnostic Checklist

When a Next.js app isn't reachable:

- [ ] Config file exists in `apps/` directory
- [ ] Containers are running (`docker ps`)
- [ ] Containers are on `devproxy` network
- [ ] Nginx config regenerated (`node utils/generateAppsBundle.js`)
- [ ] Nginx reloaded (`docker exec dev-proxy nginx -s reload`)
- [ ] Test bare path (`curl http://localhost:8080/myapp`)
- [ ] Test with trailing slash (`curl http://localhost:8080/myapp/`)
- [ ] Check container logs for errors
- [ ] Verify API is running (if applicable)

## Related Documentation

- [Configuration Guide](CONFIGURATION.md) - App config management
- [User Guide](USER_GUIDE.md) - General troubleshooting
- [Integration Guide](INTEGRATION_GUIDE.md) - External project integration
