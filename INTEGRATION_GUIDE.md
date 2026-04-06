# Dev Tunnel Proxy Integration Guide

This guide helps external projects integrate with the dev-tunnel-proxy.

## Quick Reference

### Correct API Endpoints

All management API endpoints are namespaced under `/devproxy/api/`:

| Endpoint | URL | Auth Required |
|----------|-----|---------------|
| Install config | `POST http://localhost:8080/devproxy/api/apps/install` | ✅ Yes |
| List apps | `GET http://localhost:8080/devproxy/api/apps/list` | ✅ Yes |
| Create route | `POST http://localhost:8080/devproxy/api/apps/create-route` | ✅ Yes |
| AI health | `GET http://localhost:8080/devproxy/api/ai/health` | ❌ No |
| AI stats | `GET http://localhost:8080/devproxy/api/ai/stats` | ❌ No |

### Ports

- **8080** - Nginx proxy (HTTP) - **Use this for API calls**
- **443** - Nginx proxy (HTTPS)
- **3001** - Config API (direct access, not recommended)

## Authentication Flow

Most management endpoints require authentication. Follow this flow:

### 1. Login

```bash
curl -c cookies.txt -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}'
```

The `ADMIN_PASSWORD` is stored in the proxy's `.env` file. To view it from localhost:

```bash
curl http://localhost:8080/admin/show-password
# or
open http://localhost:8080/admin/show-password
```

### 2. Discover API Base Path

```bash
curl http://localhost:8080/config
```

Response:
```json
{
  "apiBasePath": "/devproxy/api",
  "version": "1.0.0"
}
```

### 3. Make Authenticated Requests

```bash
curl -b cookies.txt -X POST http://localhost:8080/devproxy/api/apps/install \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "myapp",
    "content": "location ^~ /myapp/ { proxy_pass http://myapp:3000/; }"
  }'
```

## Integration Options

### Option 1: API Install (Recommended for CI/CD)

Use the authenticated API flow above. See `examples/api-upload-config.js` for a complete Node.js example.

**Pros:**
- Programmatic
- Works from containers
- Validates config before applying

**Cons:**
- Requires authentication
- More complex setup

### Option 2: File Copy (Recommended for Local Development)

Copy your config file directly to the proxy's `apps/` directory and reload:

```bash
#!/bin/bash
PROXY_ROOT="/path/to/dev-tunnel-proxy"

# Copy config
cp myapp.conf "$PROXY_ROOT/apps/"

# Reload nginx
docker exec dev-proxy nginx -s reload
```

**Pros:**
- Simple
- No authentication needed
- Fast for local iteration

**Cons:**
- Requires filesystem access
- Manual reload needed

### Option 3: Docker Network Connect

If your app runs in Docker, connect to the `devproxy` network:

```bash
docker network connect devproxy myapp-container
```

Then your app can reach the proxy at `http://dev-proxy:8080`.

## Common Mistakes

### ❌ Wrong API Path

```bash
# WRONG - Missing /devproxy prefix
curl http://localhost:8080/api/apps/install

# WRONG - Using port 3001 without /devproxy
curl http://localhost:3001/api/apps/install
```

### ✅ Correct API Path

```bash
# CORRECT - Full path with /devproxy prefix
curl http://localhost:8080/devproxy/api/apps/install
```

### ❌ Missing Authentication

```bash
# WRONG - No session cookie
curl -X POST http://localhost:8080/devproxy/api/apps/install \
  -d '{"name":"app","content":"..."}'
# Returns: 401 Unauthorized
```

### ✅ With Authentication

```bash
# CORRECT - Include session cookie
curl -b cookies.txt -X POST http://localhost:8080/devproxy/api/apps/install \
  -d '{"name":"app","content":"..."}'
```

## Example: Node.js Integration Script

```javascript
#!/usr/bin/env node
const http = require('http');
const fs = require('fs');

const PROXY_HOST = process.env.PROXY_HOST || 'localhost';
const PROXY_PORT = process.env.PROXY_PORT || '8080';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function installConfig(appName, configContent) {
  // 1. Login
  const loginRes = await fetch(`http://${PROXY_HOST}:${PROXY_PORT}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD })
  });
  
  if (!loginRes.ok) {
    throw new Error('Authentication failed');
  }
  
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  
  // 2. Get API base path
  const configRes = await fetch(`http://${PROXY_HOST}:${PROXY_PORT}/config`);
  const config = await configRes.json();
  const apiBasePath = config.apiBasePath; // "/devproxy/api"
  
  // 3. Install config
  const installRes = await fetch(
    `http://${PROXY_HOST}:${PROXY_PORT}${apiBasePath}/apps/install`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie
      },
      body: JSON.stringify({
        name: appName,
        content: configContent
      })
    }
  );
  
  const result = await installRes.json();
  
  if (!installRes.ok) {
    throw new Error(`Install failed: ${result.error}`);
  }
  
  return result;
}

// Usage
const configContent = fs.readFileSync('./myapp.conf', 'utf8');
installConfig('myapp', configContent)
  .then(result => console.log('✅ Installed:', result.installed))
  .catch(err => console.error('❌ Error:', err.message));
```

## Docker Compose Integration

Add this to your app's `docker-compose.yml`:

```yaml
services:
  myapp:
    # ... your app config ...
    networks:
      - devproxy

networks:
  devproxy:
    external: true
    name: devproxy
```

Then your app can install its config on startup:

```yaml
services:
  myapp:
    # ... your app config ...
    depends_on:
      - myapp-config-installer
  
  myapp-config-installer:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./infra/dev-proxy:/app
    environment:
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    command: node install-config-api.mjs
    networks:
      - devproxy
```

## Troubleshooting

### 404 Not Found

**Cause:** Wrong API path (missing `/devproxy` prefix)

**Fix:** Use `http://localhost:8080/devproxy/api/apps/install`

### 401 Unauthorized

**Cause:** Missing or invalid session cookie

**Fix:** Login first and include the session cookie in subsequent requests

### 500 Internal Server Error on /api/apps/list

**Cause:** Using old `/api/` path instead of `/devproxy/api/`

**Fix:** Update to `/devproxy/api/apps/list`

### Connection Refused (port 3001)

**Cause:** Config API container not running

**Fix:** 
```bash
docker ps | grep dev-proxy-config-api
docker logs dev-proxy-config-api
```

## Environment Variables

Set these in your `.env` or CI/CD environment:

```bash
# Required for API authentication
ADMIN_PASSWORD=your-secure-password

# Optional - customize proxy location
PROXY_HOST=localhost
PROXY_PORT=8080

# Optional - for direct API access (not recommended)
PROXY_API_BASE_PATH=/devproxy/api
```

## Testing Your Integration

```bash
# 1. Check proxy is running
curl http://localhost:8080/health.json

# 2. Check API is accessible
curl http://localhost:8080/devproxy/api/ai/health

# 3. Test authentication
curl -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"test"}' \
  -v

# 4. Test config install (with auth)
# ... see examples above ...
```

## Further Reading

- **[API Documentation](docs/API.md)** - Complete API reference
- **[User Guide](docs/USER_GUIDE.md)** - Comprehensive usage guide
- **[Examples](examples/)** - Sample configurations and scripts
