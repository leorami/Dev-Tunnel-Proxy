# Endpoint Structure and Namespacing

## Overview

The proxy uses **two separate namespaces** for different types of endpoints:

1. **Authentication & Config** - Fixed paths at root level
2. **Management API** - Configurable namespace (default: `/devproxy/api/`)

## Endpoint Categories

### 1. Authentication Endpoints (Fixed Paths)

These endpoints handle user authentication and are **NOT** affected by `PROXY_API_BASE_PATH`.

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `/admin/login` | GET | No | Serve login page |
| `/admin/login` | POST | No | Authenticate user, create session |
| `/admin/logout` | POST | Yes | Destroy session |
| `/admin/check` | GET | Internal | Used by nginx `auth_request` directive |
| `/admin/show-password` | GET | Localhost only | Display auto-generated password |

**Why fixed paths?**
- These are infrastructure endpoints used by nginx's `auth_request` mechanism
- Changing them would require nginx config changes
- Standard practice is to keep auth separate from API

**Example:**
```bash
# Login (always at /admin/login regardless of PROXY_API_BASE_PATH)
curl -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}' \
  -c cookies.txt
```

### 2. Configuration Endpoint (Fixed Path)

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `/config` | GET | No | Returns API base path and version |

**Why fixed path?**
- Clients need a known endpoint to discover the API base path
- Chicken-and-egg problem: can't query configurable endpoint without knowing the config

**Example:**
```bash
# Discover API base path
curl http://localhost:8080/config

# Response:
{
  "apiBasePath": "/devproxy/api",
  "version": "1.0.0"
}
```

### 3. Management API Endpoints (Configurable Namespace)

These endpoints are all prefixed with `PROXY_API_BASE_PATH` (default: `/devproxy/api/`).

**Configuration Management:**
- `POST /devproxy/api/apps/install` - Install app configuration
- `POST /devproxy/api/overrides/promote` - Promote to override
- `GET /devproxy/api/config/:file` - Get config file
- `POST /devproxy/api/config/:file` - Update config file

**AI Assistant (Calliope):**
- `GET /devproxy/api/ai/health` - Check AI status (public)
- `GET /devproxy/api/ai/stats` - Get embedding stats (public)
- `GET /devproxy/api/ai/thoughts` - Get thought stream (public)
- `POST /devproxy/api/ai/ask` - Ask Calliope (protected)
- `POST /devproxy/api/ai/self-check` - Run self-check (protected)
- `POST /devproxy/api/ai/audit` - Audit URL (protected)
- `POST /devproxy/api/ai/reindex` - Reindex knowledge (protected)

**Conflict Resolution:**
- `GET /devproxy/api/overrides/conflicts` - List conflicts (public)
- `POST /devproxy/api/resolve-conflict` - Resolve conflict (protected)
- `POST /devproxy/api/rename-route` - Rename route (protected)

**Reports:**
- `GET /devproxy/api/reports/list` - List reports (protected)
- `POST /devproxy/api/reports/prune` - Prune old reports (protected)

**Example:**
```bash
# Discover the base path first
API_BASE=$(curl -s http://localhost:8080/config | jq -r .apiBasePath)

# Then use it for API calls
curl -b cookies.txt "${API_BASE}/apps/install" \
  -H 'Content-Type: application/json' \
  -d '{"name":"myapp","content":"..."}'
```

## Changing the API Namespace

To change the management API namespace:

```bash
# In .env
PROXY_API_BASE_PATH=/custom/api
```

**What changes:**
- ✅ All management API endpoints move to `/custom/api/*`
- ✅ `/config` endpoint returns the new path
- ❌ Authentication endpoints stay at `/admin/*`
- ❌ Config endpoint stays at `/config`

**Important:** You must also update nginx config's `location` blocks to match!

## Complete URL Examples

### Default Configuration

```
# Authentication (fixed)
http://localhost:8080/admin/login
http://localhost:8080/admin/logout
http://localhost:8080/admin/show-password

# Configuration (fixed)
http://localhost:8080/config

# Management API (configurable, default /devproxy/api/)
http://localhost:8080/devproxy/api/apps/install
http://localhost:8080/devproxy/api/ai/health
http://localhost:8080/devproxy/api/overrides/conflicts
```

### Custom Configuration (PROXY_API_BASE_PATH=/api)

```
# Authentication (fixed)
http://localhost:8080/admin/login
http://localhost:8080/admin/logout

# Configuration (fixed)
http://localhost:8080/config

# Management API (now at /api/)
http://localhost:8080/api/apps/install
http://localhost:8080/api/ai/health
http://localhost:8080/api/overrides/conflicts
```

## Best Practices

### For Client Applications

**1. Always discover the API base path:**
```javascript
// Don't hardcode!
const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());
const apiBase = config.apiBasePath;

// Use it
const response = await fetch(`http://dev-proxy:8080${apiBase}/apps/install`, {
  method: 'POST',
  body: JSON.stringify({ name: 'myapp', content: config })
});
```

**2. Authentication flow:**
```javascript
// Step 1: Login (fixed path)
const loginRes = await fetch('http://dev-proxy:8080/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  credentials: 'include'
});

// Step 2: Get API config
const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());

// Step 3: Use API (with cookie from step 1)
const response = await fetch(`http://dev-proxy:8080${config.apiBasePath}/apps/install`, {
  method: 'POST',
  credentials: 'include',  // Include session cookie
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

### For Scripts

```bash
#!/bin/bash

# 1. Login
curl -c cookies.txt -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}"

# 2. Get API base path
API_BASE=$(curl -s http://localhost:8080/config | jq -r .apiBasePath)

# 3. Use API
curl -b cookies.txt -X POST "http://localhost:8080${API_BASE}/apps/install" \
  -H 'Content-Type: application/json' \
  -d @config.json
```

## Architecture Rationale

### Why Two Namespaces?

**Authentication endpoints at root level:**
- Industry standard (e.g., `/auth/login`, `/admin/login`)
- Used by nginx infrastructure (`auth_request`)
- Decoupled from API versioning concerns

**Management API under configurable prefix:**
- Prevents conflicts with application APIs
- Allows multi-tenant scenarios
- Supports API versioning in future

### Comparison to Other Systems

**GitHub API:**
```
https://github.com/login              (auth)
https://api.github.com/v3/repos       (API)
```

**AWS:**
```
https://console.aws.amazon.com/login  (auth)
https://api.aws.amazon.com/ec2        (API)
```

**Our Proxy:**
```
http://localhost:8080/admin/login     (auth)
http://localhost:8080/devproxy/api/*  (API)
```

## See Also

- [API Migration Guide](./API-MIGRATION-V1.md) - Migrating from old paths
- [Centralized Configuration](./CENTRALIZED-API-CONFIG.md) - Implementation details
- [Configuration Guide](./CONFIGURATION.md) - API endpoint documentation

