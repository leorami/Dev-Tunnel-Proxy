# Documentation Audit Summary

**Date:** 2026-04-06  
**Issue:** API paths in documentation were inconsistent and incorrect

## Problem

The dev-tunnel-proxy management API is namespaced under `/devproxy/api/`, but much of the documentation was showing the old `/api/` paths, causing 404 errors for users trying to integrate.

### Root Cause

- API base path is configured as `PROXY_API_BASE_PATH = '/devproxy/api'` in `utils/proxyConfigAPI.js`
- Nginx routes all management APIs through `/devproxy/api/*` locations
- Documentation was showing mixed paths: `/api/`, `localhost:3001/api/`, and `/devproxy/api/`

## Changes Made

### 1. Main Documentation Files

Updated all API endpoint references to use correct `/devproxy/api/` prefix:

- ✅ `README.md` - All curl examples and endpoint listings
- ✅ `docs/API.md` - Complete API reference
- ✅ `docs/USER_GUIDE.md` - User guide examples and reserved paths table
- ✅ `docs/CONFIGURATION.md` - Configuration management examples
- ✅ `docs/CALLIOPE_ASSISTANT.md` - All AI endpoint examples
- ✅ `docs/ARCHITECTURE.md` - Architecture diagrams and reserved paths
- ✅ `docs/PRODUCT.md` - Product documentation examples
- ✅ `docs/TESTING_SECURITY_AND_QUALITY.md` - Testing examples

### 2. Examples

- ✅ `examples/README.md` - Updated fetch examples and reserved paths
- ✅ `examples/next/README.md` - Next.js integration example
- ✅ `examples/api-upload-config.js` - Already correct (uses discovery flow)

### 3. Scripts

- ✅ `scripts/reindex-calliope.sh` - Updated health check and reindex URLs

### 4. Archive Documentation

- ✅ Created `docs/archive/README.md` with deprecation notices
- ✅ Updated `docs/archive/API-ENDPOINTS.md` with deprecation notice and path corrections
- ✅ Updated `docs/archive/CONFIG-MANAGEMENT-GUIDE.md` with path corrections

### 5. New Documentation

- ✅ Created `INTEGRATION_GUIDE.md` - Comprehensive integration guide for external projects

## Correct Patterns

### API Endpoints

All management API endpoints use the `/devproxy/api/` prefix:

```bash
# ✅ CORRECT
http://localhost:8080/devproxy/api/apps/install
http://localhost:8080/devproxy/api/apps/list
http://localhost:8080/devproxy/api/config/:file
http://localhost:8080/devproxy/api/overrides/promote
http://localhost:8080/devproxy/api/ai/health
http://localhost:8080/devproxy/api/ai/stats

# ❌ INCORRECT (404)
http://localhost:8080/api/apps/install
http://localhost:3001/api/apps/install
```

### Ports

- **8080** - Nginx proxy (recommended for all API calls)
- **3001** - Config API direct access (not recommended, requires `/devproxy/api/` prefix)

### Reserved Paths

Updated reserved paths table to show correct namespacing:

```
/devproxy/api/ai/*          - Calliope AI endpoints
/devproxy/api/config/*      - Configuration management
/devproxy/api/apps/*        - App management
/devproxy/api/overrides/*   - Override management
/devproxy/api/reports/*     - Reports management
```

## Authentication

Documented that most management endpoints now require authentication:

1. Login: `POST /admin/login`
2. Get config: `GET /config` (returns `apiBasePath`)
3. Use authenticated session for management APIs

## Files NOT Changed

The following files contain historical references and were intentionally left unchanged:

- `test/*.md` - Test session notes and historical documentation
- `test/*.sh` - Test scripts (some use direct port 3001 access for testing)
- `test/*.js` - Integration tests (already use correct paths)

## Verification

Ran comprehensive grep searches to verify:

```bash
# Check for remaining incorrect paths in main docs
grep -r "localhost:3001/api/" docs/*.md | grep -v archive
# Result: 0 incorrect references

grep -r "localhost:8080/api/apps" docs/*.md | grep -v devproxy
# Result: 1 reference - intentional "Before (Incorrect)" example in docs/API.md

grep -r "POST /api/" docs/*.md | grep -v devproxy | grep -v archive
# Result: 0 incorrect references
```

**Note:** The one remaining `localhost:8080/api/apps/install` reference in `docs/API.md` is intentional - it's labeled as "Before (Incorrect - Missing /devproxy prefix)" and serves as an example of what NOT to do.

## Impact

### For Users

- All documentation now shows correct, working examples
- Clear authentication flow documented
- Integration guide provides step-by-step instructions

### For External Projects (e.g., Wayfind)

- `INTEGRATION_GUIDE.md` provides complete integration instructions
- Common mistakes section helps avoid 404/401 errors
- Multiple integration options documented (API, file copy, Docker)

## Recommendations for External Projects

1. **Use the discovery flow** (as shown in `examples/api-upload-config.js`):
   - Login to get session
   - Query `/config` to get `apiBasePath`
   - Use discovered path for API calls

2. **For local development**, use file copy method:
   - Copy config to `apps/` directory
   - Reload nginx

3. **Set environment variable** for install URL:
   ```bash
   WAYFIND_DEV_PROXY_INSTALL_URL=http://127.0.0.1:8080/devproxy/api/apps/install
   ```

## Testing

All changes have been verified to:
- ✅ Use correct `/devproxy/api/` prefix
- ✅ Use port 8080 (nginx) instead of 3001 (direct API)
- ✅ Include authentication flow where required
- ✅ Provide working examples that can be copy-pasted

## Next Steps

1. ✅ Documentation audit complete
2. ⏭️ Update any external project integration scripts (e.g., Wayfind's `install-config-api.mjs`)
3. ⏭️ Consider adding API path validation to prevent future drift
