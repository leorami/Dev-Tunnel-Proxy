# Centralized API Configuration

## Overview

The proxy now uses a **centralized configuration system** for API endpoint paths. Instead of hardcoding `/api/` or `/devproxy/api/` in dozens of files, we have a single source of truth.

## Architecture

### Backend (Node.js)

**File:** `utils/proxyConfigAPI.js`

```javascript
// Single source of truth for API base path
const PROXY_API_BASE_PATH = process.env.PROXY_API_BASE_PATH || '/devproxy/api';

// Helper function to build API paths
function apiPath(path) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${PROXY_API_BASE_PATH}/${cleanPath}`;
}

// Usage throughout the codebase
const publicEndpoints = [
  apiPath('ai/health'),
  apiPath('ai/stats'),
  apiPath('ai/thoughts'),
  apiPath('overrides/conflicts')
];
```

### Frontend (JavaScript)

**File:** `status/config.js`

```javascript
// Loads configuration from backend /config endpoint
await window.DTP.config.load();

// Use in API calls
const healthUrl = window.DTP.config.apiPath('ai/health');
fetch(healthUrl);
```

### Configuration Endpoint

**Endpoint:** `GET /config` (public, no auth required)

**Response:**
```json
{
  "apiBasePath": "/devproxy/api",
  "version": "1.0.0"
}
```

## Benefits

### 1. Single Point of Change
Change the API namespace once in `.env`:
```bash
PROXY_API_BASE_PATH=/custom/api
```

### 2. No Hardcoded Paths
**Before (Bad):**
```javascript
// Scattered across 50+ files
fetch('/api/ai/health')
fetch('/api/apps/install')
fetch('/api/overrides/promote')
```

**After (Good):**
```javascript
// Backend
apiPath('ai/health')
apiPath('apps/install')

// Frontend
window.DTP.config.apiPath('ai/health')
```

### 3. Environment-Specific Configuration
Different environments can use different paths:
```bash
# Development
PROXY_API_BASE_PATH=/devproxy/api

# Production
PROXY_API_BASE_PATH=/proxy-mgmt/api

# Testing
PROXY_API_BASE_PATH=/test/api
```

### 4. Type Safety & Consistency
The helper function ensures:
- No double slashes (`//`)
- Consistent path format
- Easy to grep/search

## Implementation Details

### Files Modified

**Backend:**
- `utils/proxyConfigAPI.js` - Added `PROXY_API_BASE_PATH` constant and `apiPath()` helper
- All endpoint checks now use `apiPath()` instead of hardcoded strings

**Frontend:**
- `status/config.js` - New configuration module
- `status/common.js` - Updated to use `window.DTP.config.apiPath()`
- `status/status.html` - Updated all `fetch()` calls to use config

**Examples:**
- `examples/api-upload-config.js` - Updated to use new path

**Documentation:**
- `docs/API-MIGRATION-V1.md` - Migration guide
- `docs/CONFIGURATION.md` - Updated endpoint documentation
- `README.md` - Added configuration section

### Nginx Configuration

The nginx `config/default.conf` still has hardcoded paths in `location` blocks. This is intentional because:

1. Nginx doesn't support environment variables in `location` directives
2. The `proxy_pass` backend URL uses the env var via the Node.js service
3. Changing nginx paths requires manual edit + reload (documented in migration guide)

**Future Enhancement:** Could use `envsubst` in nginx-entrypoint.sh to template the config file.

## Usage Examples

### Backend API Handler

```javascript
// Check if path is protected
const protectedPaths = [
  apiPath('apps/'),
  apiPath('config/'),
  apiPath('overrides/')
];

if (protectedPaths.some(path => u.pathname.startsWith(path))) {
  requireAuth(req, res);
}
```

### Frontend API Call

```javascript
// Load config first (auto-loaded on page load)
await window.DTP.config.load();

// Make API calls
const response = await fetch(
  window.DTP.config.apiPath('apps/install'),
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'myapp', content: config })
  }
);
```

### Client Application

```javascript
// From your app container
const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());
const apiBase = config.apiBasePath;

// Install your app's config
await fetch(`http://dev-proxy:8080${apiBase}/apps/install`, {
  method: 'POST',
  body: JSON.stringify({ name: 'myapp', content: nginxConfig })
});
```

## Testing

### Verify Configuration

```bash
# Check current config
curl http://localhost:8080/config

# Should return:
# {"apiBasePath":"/devproxy/api","version":"1.0.0"}
```

### Change Configuration

1. Edit `.env`:
```bash
PROXY_API_BASE_PATH=/custom/api
```

2. Restart services:
```bash
./smart-build.sh restart
```

3. Verify:
```bash
curl http://localhost:8080/config
# {"apiBasePath":"/custom/api","version":"1.0.0"}
```

4. **Important:** Update nginx config to match:
```nginx
location /custom/api/apps/ {
  proxy_pass http://$config_api/custom/api/apps/;
}
```

## Best Practices

### DO ✅
- Use `apiPath()` helper in backend code
- Use `window.DTP.config.apiPath()` in frontend code
- Document any path changes in migration guides
- Test configuration changes thoroughly

### DON'T ❌
- Hardcode `/api/` or `/devproxy/api/` anywhere
- Forget to update nginx config when changing `PROXY_API_BASE_PATH`
- Use string concatenation for API paths
- Skip the `/config` endpoint check in client code

## Future Enhancements

1. **Nginx Templating:** Use `envsubst` to generate nginx config from template
2. **Validation:** Add startup validation to ensure nginx and Node.js configs match
3. **Hot Reload:** Auto-reload nginx when `PROXY_API_BASE_PATH` changes
4. **TypeScript:** Add type definitions for `apiPath()` and config structure

## Related Documentation

- [API Migration Guide](./API-MIGRATION-V1.md) - How to update your code
- [Configuration Guide](./CONFIGURATION.md) - Full API endpoint documentation
- [Architecture](./ARCHITECTURE.md) - System design overview

