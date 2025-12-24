# API Reference

**Last Updated**: December 2025  
**Version**: 1.0

Complete reference for Dev Tunnel Proxy's REST API, including endpoint structure, authentication, and configuration management.

---

## Table of Contents

1. [Endpoint Structure](#endpoint-structure)
2. [Authentication](#authentication)
3. [Configuration Discovery](#configuration-discovery)
4. [Configuration Management](#configuration-management)
5. [Conflict Resolution](#conflict-resolution)
6. [Calliope AI](#calliope-ai)
7. [Reports Management](#reports-management)
8. [Status & Health](#status--health)
9. [Client Integration](#client-integration)
10. [Migration Guide](#migration-guide)

---

## Endpoint Structure

The proxy uses **two separate namespaces** for different types of endpoints:

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

### 2. Configuration Endpoint (Fixed Path)

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `/config` | GET | No | Returns API base path and version |

**Why fixed path?**
- Clients need a known endpoint to discover the API base path
- Chicken-and-egg problem: can't query configurable endpoint without knowing the config

**Response:**
```json
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

### Changing the API Namespace

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

---

## Authentication

### Overview

All admin pages (`/status`, `/health`, `/reports`) and management API endpoints are password-protected.

### Login Flow

**Step 1: Authenticate**
```bash
curl -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}' \
  -c cookies.txt
```

**Step 2: Use Session Cookie**
```bash
curl -b cookies.txt http://localhost:8080/devproxy/api/apps/list
```

### Password Management

**View Auto-Generated Password** (localhost only):
```bash
curl http://localhost:8080/admin/show-password
```

**Set Custom Password:**
```bash
# In .env
ADMIN_PASSWORD=your-secure-password-here
```

---

## Configuration Discovery

### Best Practice: Always Discover API Path

**Don't hardcode paths!** Use the `/config` endpoint to discover the current API base path.

```javascript
// Step 1: Login (fixed path)
const loginRes = await fetch('http://dev-proxy:8080/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  credentials: 'include'
});

// Step 2: Discover API base path (fixed path)
const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());
const apiBase = config.apiBasePath;  // "/devproxy/api" by default

// Step 3: Use discovered path
const result = await fetch(`http://dev-proxy:8080${apiBase}/apps/install`, {
  method: 'POST',
  credentials: 'include',  // Include session cookie
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

---

## Configuration Management

### Install App Configuration

Allows apps to programmatically upload their Nginx configuration files to the proxy.

**Endpoint:** `POST /devproxy/api/apps/install`

**Request Body:**
```json
{
  "name": "app-name",
  "content": "# Nginx configuration content\nlocation ^~ /app-name/ {\n  proxy_pass http://app-container:3000/;\n}"
}
```

**Parameters:**
- `name`: (Required) The name of the app without the `.conf` extension. Must be alphanumeric with hyphens and underscores only.
- `content`: (Required) The Nginx configuration content as a string.

**Response:**
```json
{
  "ok": true,
  "installed": "app-name.conf"
}
```

**Error Responses:**
- `400 Bad Request`: If name or content is missing or invalid
- `422 Unprocessable Entity`: If the Nginx configuration fails validation
- `500 Internal Server Error`: For other errors

**Processing:**
1. The configuration is saved to the `apps/` directory as `{name}.conf`
2. The `hardenUpstreams.js` script is run to transform proxy_pass directives for resilience
3. The bundle is regenerated with `generateAppsBundle.js`
4. Nginx configuration is tested and reloaded

### Promote App Configuration to Override

Promotes an existing app configuration to an override.

**Endpoint:** `POST /devproxy/api/overrides/promote`

**Request Body:**
```json
{
  "filename": "app-name.conf"
}
```

**Response:**
```json
{
  "ok": true,
  "promoted": "app-name.conf"
}
```

### Get Configuration File

Retrieves the content of a configuration file.

**Endpoint:** `GET /devproxy/api/config/:file`

**Response:**
```json
{
  "file": "apps/app-name.conf",
  "content": "# Configuration content..."
}
```

### Update Configuration File

Updates the content of an existing configuration file.

**Endpoint:** `POST /devproxy/api/config/:file`

**Request Body:**
```json
{
  "content": "# Updated configuration content..."
}
```

**Response:**
```json
{
  "ok": true,
  "file": "apps/app-name.conf"
}
```

### List App Configurations

**Endpoint:** `GET /devproxy/api/apps/list`

Returns list of all app configuration files sorted by modification time.

### View Active Locations

**Endpoint:** `GET /devproxy/api/apps/active`

Shows final active location blocks with order and source information.

### Get Bundle Diagnostics

**Endpoint:** `GET /devproxy/api/apps/diagnostics`

Returns detailed information about included/skipped routes with reasons.

### Force Regenerate Bundle

**Endpoint:** `POST /devproxy/api/apps/regenerate`

**Request Body:**
```json
{
  "reload": true
}
```

Forces regeneration of nginx bundle and optionally reloads nginx.

---

## Conflict Resolution

### Resolve Route Conflict

**Endpoint:** `POST /devproxy/api/resolve-conflict`

**Request Body:**
```json
{
  "route": "/api/",
  "winner": "app2.conf"
}
```

Chooses which configuration file wins for a conflicting route.

### Rename Route in Config

**Endpoint:** `POST /devproxy/api/rename-route`

**Request Body:**
```json
{
  "oldRoute": "/api/",
  "newRoute": "/app2-api/",
  "configFile": "app2.conf"
}
```

Renames a route within a specific configuration file.

### List Override Conflicts

**Endpoint:** `GET /devproxy/api/overrides/conflicts`

Returns list of conflicts between app configs and overrides.

---

## Calliope AI

### Health Check

**Endpoint:** `GET /devproxy/api/ai/health`

Check if Calliope is available and healthy.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

### Get Embedding Stats

**Endpoint:** `GET /devproxy/api/ai/stats`

Get embedding index statistics.

**Response:**
```json
{
  "exists": true,
  "model": "text-embedding-3-small",
  "chunks": 85,
  "dim": 1536
}
```

### Ask Calliope

**Endpoint:** `POST /devproxy/api/ai/ask`

Ask Calliope a question about your setup.

**Request Body:**
```json
{
  "query": "Why is /myapp returning 502?"
}
```

**Response:**
```json
{
  "ok": true,
  "answer": "I checked /myapp and found...",
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

### Self-Check with Healing

**Endpoint:** `POST /devproxy/api/ai/self-check`

Request focused health check with optional healing.

**Request Body:**
```json
{
  "heal": true,
  "route": "/myapp/"
}
```

**Options:**
- `heal` (boolean) - Whether to apply fixes automatically
- `advanced` (boolean) - Use advanced healing strategies
- `route` (string) - Specific route to check

### Advanced Healing

**Endpoint:** `POST /devproxy/api/ai/advanced-heal`

Trigger advanced step-by-step healing process.

**Request Body:**
```json
{
  "route": "/api/",
  "hint": "nginx test failed"
}
```

### Site Audit

**Endpoint:** `POST /devproxy/api/ai/audit`

Run a one-off site audit and return a summary.

**Request Body:**
```json
{
  "url": "http://dev-proxy/myapp",
  "wait": 2000
}
```

**Options:**
- `url` (string) - URL to audit
- `wait` (number) - Milliseconds to wait before capturing (default: 2000)

### Audit and Heal

**Endpoint:** `POST /devproxy/api/ai/audit-and-heal`

Iterate audit → heal → re-audit until green or limit reached.

**Request Body:**
```json
{
  "url": "http://dev-proxy/myapp",
  "maxPasses": 3
}
```

### Get Thinking Events

**Endpoint:** `GET /devproxy/api/ai/thoughts`

Get thinking events for real-time UI updates (polling).

**Response:**
```json
{
  "events": [
    {
      "id": 12345,
      "ts": 1673894400000,
      "message": "Auditing /myapp...",
      "details": {"chip": "Auditing"}
    }
  ]
}
```

**Note**: Events auto-expire after 10 seconds.

### Cancel Operation

**Endpoint:** `POST /devproxy/api/ai/cancel`

Cancel current long-running operation.

### Reindex Knowledge Base

**Endpoint:** `POST /devproxy/api/ai/reindex`

Rebuild Calliope's knowledge base from documentation.

**Response:**
```json
{
  "ok": true,
  "chunks": 85,
  "model": "text-embedding-3-small",
  "dim": 1536
}
```

---

## Reports Management

### List Reports

**Endpoint:** `GET /devproxy/api/reports/list`

Returns list of all available health reports.

### Prune Old Reports

**Endpoint:** `POST /devproxy/api/reports/prune`

**Request Body:**
```json
{
  "keep": 10
}
```

Removes old reports, keeping only the specified number of most recent ones.

---

## Status & Health

### Human-Readable Dashboards

- `GET /status` - Enhanced status dashboard
- `GET /health` - Health dashboard
- `GET /reports` - Reports browser

### JSON Endpoints

- `GET /status.json` - Latest health report
- `GET /health.json` - Basic health check
- `GET /routes.json` - Latest route scan
- `GET /ngrok.json` - Ngrok tunnel info

---

## Client Integration

### Example: Node.js Client

```javascript
async function installAppConfig(name, content) {
  // Step 1: Login
  const loginRes = await fetch('http://dev-proxy:8080/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    credentials: 'include'
  });

  if (!loginRes.ok) {
    throw new Error('Login failed');
  }

  // Step 2: Get API config
  const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());

  // Step 3: Install config
  const response = await fetch(`http://dev-proxy:8080${config.apiBasePath}/apps/install`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content })
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Failed to install config: ${result.error}`);
  }

  return result;
}

// Example usage
const nginxConfig = `
# My app configuration
location ^~ /myapp/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://my-app-container:3000/;
}
`;

installAppConfig('myapp', nginxConfig)
  .then(result => console.log('Config installed:', result))
  .catch(err => console.error('Installation failed:', err));
```

### Example: Shell Script

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

---

## Migration Guide

### From Legacy `/api/` Path

If you're migrating from the old `/api/` path to the new `/devproxy/api/` default:

**Step 1: Update Your Application Code**

**Before (hardcoded paths - bad):**
```javascript
fetch('http://dev-proxy:8080/api/apps/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

**After (discover API path - recommended):**
```javascript
// Step 1: Login (fixed path)
const loginRes = await fetch('http://dev-proxy:8080/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  credentials: 'include'
});

// Step 2: Discover API base path (fixed path)
const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());
const apiBase = config.apiBasePath;  // "/devproxy/api" by default

// Step 3: Use discovered path
const result = await fetch(`http://dev-proxy:8080${apiBase}/apps/install`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

**Step 2: Update Scripts**

If you're using the example upload script:

```bash
# The script has been updated - just pull latest changes
node examples/api-upload-config.js myapp ./myapp.conf
```

**Step 3: Update cURL Commands**

**Before:**
```bash
curl -X POST http://localhost:8080/api/apps/install \
  -H 'Content-Type: application/json' \
  -d '{"name":"myapp","content":"..."}'
```

**After:**
```bash
curl -X POST http://localhost:8080/devproxy/api/apps/install \
  -H 'Content-Type: application/json' \
  -d '{"name":"myapp","content":"..."}'
```

### Backwards Compatibility

If you need to maintain backwards compatibility temporarily, you can:

1. Set `PROXY_API_BASE_PATH=/api` in your `.env` (not recommended)
2. Update your app to use a different API path (e.g., `/myapp/api/`)

### Testing Your Migration

**1. Check Configuration Endpoint**

```bash
curl http://localhost:8080/config
```

Should return:
```json
{
  "apiBasePath": "/devproxy/api",
  "version": "1.0.0"
}
```

**2. Test API Endpoint**

```bash
# With authentication
curl -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}' \
  -c cookies.txt

curl http://localhost:8080/devproxy/api/ai/health \
  -b cookies.txt
```

**3. Verify Your App's API Still Works**

```bash
# Your app's API should work fine now
curl http://localhost:8080/api/whatever-your-app-has
```

---

## Architecture Benefits

### Before (Conflict Risk)
```
/api/apps/install      → Proxy management API
/api/users             → Your Django app's API  ❌ CONFLICT!
```

### After (No Conflicts)
```
/devproxy/api/apps/install  → Proxy management API ✅
/api/users                  → Your Django app's API ✅
```

---

## See Also

- **[Configuration Guide](CONFIGURATION.md)** - Configuration management details
- **[User Guide](USER_GUIDE.md)** - Getting started and daily usage
- **[Calliope Assistant](CALLIOPE_ASSISTANT.md)** - AI assistant capabilities
- **[Architecture](ARCHITECTURE.md)** - System design overview

