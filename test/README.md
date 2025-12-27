# Dev Tunnel Proxy Test Suite

Comprehensive test coverage for issues uncovered and fixed during development.

## Test Structure

```
test/
├── unit/                          # Unit tests for isolated logic
│   └── route-promotion-filtering.test.js
├── integration/                   # Integration tests for API endpoints
│   ├── api-reindex.test.js
│   └── api-apps-install.test.js
├── e2e/                          # End-to-end tests
│   └── nginx-proxy-pass.test.js
├── run-all-tests.sh              # Test runner script
└── README.md                     # This file
```

## Running Tests

### Run All Tests
```bash
./test/run-all-tests.sh
```

### Run Individual Test Suites

**Unit Tests:**
```bash
node test/unit/route-promotion-filtering.test.js
```

**Integration Tests:**
```bash
node test/integration/api-reindex.test.js
node test/integration/api-apps-install.test.js
```

**E2E Tests:**
```bash
node test/e2e/nginx-proxy-pass.test.js
```

## Test Coverage

### 1. Route Promotion Child Filtering (Unit)
**Issue:** Child routes were appearing in the configured apps list even when their parent route was promoted.

**Root Cause:** Child routes were being rendered before the promotion logic marked them as processed.

**Fix:** Pre-process all promoted routes and mark their children as processed before rendering any routes.

**Tests:**
- ✅ Hides child routes when parent is promoted with "children" mode
- ✅ Hides all routes from config when promoted with "config" mode
- ✅ Handles multiple promoted routes from different configs
- ✅ Shows all routes when no promotions exist

### 2. API Reindex Endpoint (Integration)
**Issue:** The `/devproxy/api/ai/reindex` endpoint didn't exist, causing startup failures with "Not found" errors.

**Root Cause:** The endpoint was never implemented, but the startup script expected it.

**Fix:** Implemented `POST /devproxy/api/ai/reindex` endpoint in `proxyConfigAPI.js` that:
- Collects documentation files
- Chunks them into manageable pieces
- Generates embeddings using OpenAI
- Saves the index to `.artifacts/ai-embeddings.json`

**Tests:**
- ✅ Returns 503 when OPENAI_API_KEY is not set
- ✅ Is accessible without authentication (public endpoint)
- ✅ Returns proper response structure when successful

### 3. API Apps Install Endpoint (Integration)
**Issue:** Apps were failing to install configs with 500/404 errors.

**Root Causes:**
1. Endpoint existed but had incorrect indentation
2. Nginx `proxy_pass` had trailing slash causing URL rewriting issues

**Fixes:**
1. Fixed indentation in `proxyConfigAPI.js`
2. Removed trailing slash from nginx `proxy_pass` directive

**Tests:**
- ✅ Requires authentication
- ✅ Installs valid config files
- ✅ Rejects invalid app names (path traversal protection)
- ✅ Rejects missing name or content
- ✅ Rejects invalid nginx configurations

### 4. Nginx Proxy Pass Configuration (E2E)
**Issue:** Nginx `proxy_pass` with trailing slash was rewriting URLs incorrectly, causing 404 errors.

**Root Cause:** When `proxy_pass` includes a path with trailing slash, nginx replaces the matched location prefix, which can cause unexpected URL transformations.

**Fix:** Changed `proxy_pass http://$config_api/devproxy/api/apps/;` to `proxy_pass http://$config_api;` (no path component).

**Tests:**
- ✅ Correctly proxies `/devproxy/api/apps/install` through nginx
- ✅ Correctly proxies `/devproxy/api/ai/reindex` through nginx
- ✅ Correctly proxies `/devproxy/api/config/` paths through nginx
- ✅ Verifies nginx config does not have trailing slash on apps proxy_pass
- ✅ Verifies all API proxy_pass directives use deferred DNS resolution

## Prerequisites

- Dev Tunnel Proxy must be running (`./smart-build.sh up`)
- Node.js 18+ installed
- Admin password set in `.env` file

## Test Results

All tests pass:
- **Unit Tests:** 4/4 passed
- **Integration Tests:** 8/8 passed
- **E2E Tests:** 5/5 passed
- **Total:** 17/17 passed ✅

## CI/CD Integration

To integrate these tests into your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    ./smart-build.sh up
    sleep 10  # Wait for services to be ready
    ./test/run-all-tests.sh
```

## Adding New Tests

1. Create test file in appropriate directory (`unit/`, `integration/`, or `e2e/`)
2. Follow the existing test structure:
   ```javascript
   const tests = [];
   function it(name, fn) {
     tests.push({ name, fn });
   }
   
   it('should do something', () => {
     // test code
   });
   ```
3. Add test to `run-all-tests.sh`
4. Run tests to verify

## Troubleshooting

**Tests fail with connection errors:**
- Ensure dev-tunnel-proxy is running: `./smart-build.sh up`
- Check services are healthy: `docker ps`

**Integration tests fail with auth errors:**
- Verify `ADMIN_PASSWORD` is set in `.env`
- Check password has no trailing spaces

**E2E tests fail with nginx errors:**
- Regenerate nginx bundle: `node utils/generateAppsBundle.js`
- Reload nginx: `docker exec dev-proxy nginx -s reload`

## License

Same as dev-tunnel-proxy project.
