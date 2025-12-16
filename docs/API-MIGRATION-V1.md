# API Endpoint Migration Guide - v1.0

## Summary

The proxy's **management API** endpoints have been moved from `/api/` to `/devproxy/api/` to prevent conflicts with application APIs. This change is **configurable** via environment variable for maximum flexibility.

**Important:** Authentication endpoints (`/admin/*`) remain at fixed paths and are NOT affected by this change.

## Breaking Changes

### Management API Endpoints

**Old paths:**
```
/api/apps/install
/api/overrides/promote
/api/config/:file
/api/ai/ask
... etc
```

**New paths (default):**
```
/devproxy/api/apps/install
/devproxy/api/overrides/promote
/devproxy/api/config/:file
/devproxy/api/ai/ask
... etc
```

### Authentication Endpoints (UNCHANGED)

These remain at fixed paths:
```
/admin/login       ← NOT affected by PROXY_API_BASE_PATH
/admin/logout      ← NOT affected by PROXY_API_BASE_PATH
/admin/check       ← NOT affected by PROXY_API_BASE_PATH
/config            ← NOT affected by PROXY_API_BASE_PATH (used to discover API path)
```

## Configuration

### Environment Variable

Add to your `.env` file (optional - already defaults to `/devproxy/api`):

```bash
# Proxy API base path (default: /devproxy/api)
PROXY_API_BASE_PATH=/devproxy/api
```

**Important:** If you don't set this variable, it **defaults to `/devproxy/api`** (NOT `/api`). This prevents conflicts by default.

**Options:**
- `/devproxy/api` (default, recommended) - Clearly namespaced, no conflicts
- `/api` - Legacy behavior, **may conflict with app APIs** (not recommended)
- `/proxy/api` or any other path - Custom namespace

### Trailing Slashes

Both with and without trailing slashes work:
- ✅ `/devproxy/api/apps/install`
- ✅ `/devproxy/api/apps/install/`

The backend normalizes paths automatically.

### Why This Change?

**Problem:** Apps that define `/api/` routes (like Django or Express APIs) would conflict with the proxy's own management API, causing the "Not found" errors you experienced.

**Solution:** Give the proxy its own namespace (`/devproxy/api/`) that no app would ever accidentally use.

## Migration Steps

### 1. Update Your Application Code

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
  credentials: 'include',  // Include session cookie
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

**After (hardcoded new path - works but not recommended):**
```javascript
fetch('http://dev-proxy:8080/devproxy/api/apps/install', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

### 2. Update Scripts

If you're using the example upload script:

```bash
# The script has been updated - just pull latest changes
node examples/api-upload-config.js myapp ./myapp.conf
```

### 3. Update cURL Commands

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

### 4. Frontend/Dashboard

The status dashboard automatically loads the configuration from `/config` endpoint and uses it for all API calls. No manual changes needed if you're using the provided UI.

## Testing Your Migration

### 1. Check Configuration Endpoint

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

### 2. Test API Endpoint

```bash
# With authentication
curl -X POST http://localhost:8080/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"your-password"}' \
  -c cookies.txt

curl http://localhost:8080/devproxy/api/ai/health \
  -b cookies.txt
```

### 3. Verify Your App's API Still Works

```bash
# Your app's API should work fine now
curl http://localhost:8080/api/whatever-your-app-has
```

## Backwards Compatibility

If you need to maintain backwards compatibility temporarily, you can:

1. Set `PROXY_API_BASE_PATH=/api` in your `.env` (not recommended)
2. Update your app to use a different API path (e.g., `/myapp/api/`)

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

## Full Endpoint List

All these endpoints are now prefixed with `/devproxy/api/`:

**Configuration Management:**
- `POST /devproxy/api/apps/install` - Install app configuration
- `POST /devproxy/api/overrides/promote` - Promote to override
- `GET /devproxy/api/config/:file` - Get config file
- `POST /devproxy/api/config/:file` - Update config file

**AI Assistant (Calliope):**
- `GET /devproxy/api/ai/health` - Check AI status (public)
- `GET /devproxy/api/ai/stats` - Get embedding stats (public)
- `POST /devproxy/api/ai/ask` - Ask Calliope
- `POST /devproxy/api/ai/self-check` - Run self-check
- `GET /devproxy/api/ai/thoughts` - Get thought stream (public)

**Conflict Resolution:**
- `GET /devproxy/api/overrides/conflicts` - List conflicts (public)
- `POST /devproxy/api/resolve-conflict` - Resolve conflict
- `POST /devproxy/api/rename-route` - Rename route

**Reports:**
- `GET /devproxy/api/reports/list` - List reports
- `POST /devproxy/api/reports/prune` - Prune old reports

## Questions?

See the full documentation:
- [Configuration Guide](./CONFIGURATION.md)
- [User Guide](./USER_GUIDE.md)
- [Architecture](./ARCHITECTURE.md)

## Rollback

If you need to rollback temporarily:

1. Set `PROXY_API_BASE_PATH=/api` in `.env`
2. Restart services: `./smart-build.sh restart`

**Note:** This brings back the conflict risk with app APIs.

