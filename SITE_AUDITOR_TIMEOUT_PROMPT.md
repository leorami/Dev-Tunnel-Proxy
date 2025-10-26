# Fix Site Auditor Timeout Issue

## Problem Statement

The site auditor (Puppeteer-based crawler in Docker) times out after ~30-60 seconds when trying to audit pages through the dev-tunnel-proxy. This causes `audit-and-heal` operations to hang indefinitely, preventing full integration testing of Calliope's real-time UI updates.

**Current Behavior:**
```
TimeoutError: Timed out after waiting 30000ms
at file:///tmp/auditor/node_modules/puppeteer-core/lib/esm/puppeteer/common/util.js:225:19
```

**Expected Behavior:**
- Site auditor should complete within timeout period
- Should capture console errors, network failures, and HTTP issues
- Should return audit report successfully
- Should work for both simple paths (/) and complex paths (/lyra, /lyra/_next/)

---

## Project Context

### Repository Structure
```
/Users/leorami/Development/dev-tunnel-proxy/
├── docker-compose.yml           # Main services: proxy, ngrok, config-api, auto-scan
├── smart-build.sh              # Dev build script with test commands
├── config/
│   └── default.conf            # Main nginx configuration
├── apps/                       # App-specific nginx configs
│   ├── lyra.conf              # Next.js app config (has redirect issues)
│   └── encast.conf
├── overrides/                  # Override configs
│   └── mxtk.conf
├── utils/
│   ├── proxyConfigAPI.js      # Calliope API (real-time thoughts system)
│   └── calliopeHealing.js     # Healing logic with audit functions
├── site-auditor-debug/         # Puppeteer-based auditor (THE PROBLEM)
│   ├── src/
│   │   ├── crawler.ts         # Main crawler logic
│   │   ├── cli.ts             # CLI interface
│   │   └── types.ts           # Type definitions
│   └── dist/                  # Compiled JS
└── test/
    ├── REALTIME_UI_WORKING.md # Documentation on what works
    └── *.js                   # Test suite (all passing except auditor-dependent tests)
```

### Docker Services
```yaml
services:
  proxy:              # nginx:1.25-alpine (port 80)
  ngrok:              # ngrok/ngrok:latest (exposes via HTTPS)
  proxy-config-api:   # node:18-alpine (port 3001) - Calliope's backend
  auto-scan:          # node:18-alpine - periodic health checks
  
Network: devproxy (bridge)
```

---

## Project Rules & Requirements

### 1. Development Environment
- **Docker-only for services**: All services must run in Docker containers
- **Local Node.js for tests**: Tests run on host machine using local Node.js
- **Network**: All containers on `devproxy` network
- **HTTPS via ngrok**: External access through ngrok tunnel (https://ramileo.ngrok.app)

### 2. Build & Test Commands
```bash
# Setup and start
./smart-build.sh setup       # First-time setup
./smart-build.sh up          # Start all containers
./smart-build.sh status      # Check health + access info

# Testing
./smart-build.sh test:all           # Run all tests
./smart-build.sh test:thoughts      # Test real-time thoughts
./smart-build.sh test:calliope      # Test Calliope AI

# Development
./smart-build.sh logs proxy         # Watch nginx logs
./smart-build.sh logs config-api    # Watch API logs
./smart-build.sh reload             # Hot reload nginx config
```

### 3. Testing Philosophy
- **TDD always**: Write tests first, see them fail, then fix
- **No manual testing claims**: All assertions must be verified by automated tests
- **Real browser testing**: Use Puppeteer for actual browser behavior
- **Docker logs**: Always check container logs for debugging

### 4. Site Auditor Usage
The auditor is invoked from `utils/calliopeHealing.js`:

```javascript
async function runSiteAuditor(url, { wait = 2000, timeout = 60000 } = {}) {
  // Runs: docker run --rm --platform linux/amd64 --network devproxy 
  //   --volumes-from dev-proxy-config-api 
  //   ghcr.io/puppeteer/puppeteer:latest 
  //   sh -lc "... node dist/cli.js URL --headless --timeout TIMEOUT ..."
  
  // Returns: { ok, summary, reportPath, stdout, stderr }
}
```

**Auditor Command:**
```bash
docker run --rm --platform linux/amd64 --network devproxy \
  --volumes-from dev-proxy-config-api \
  ghcr.io/puppeteer/puppeteer:latest \
  sh -lc "cp -r /app/site-auditor-debug /tmp/auditor && \
    cd /tmp/auditor && \
    npm install --no-audit --no-fund && \
    npx puppeteer browsers install chrome && \
    node dist/cli.js 'http://dev-proxy/lyra' \
      --headless true \
      --waitUntil load \
      --timeout 45000 \
      --wait 1500 \
      --styles-mode off \
      --output /app/.artifacts/audits"
```

---

## What's Already Working

### ✅ Real-Time Thoughts System
- Operations return 202 immediately (non-blocking)
- Thoughts pushed to queue in real-time
- GET /api/ai/thoughts?since=timestamp for incremental polling
- Status chip updates (Auditing → Happy)
- All verified with passing tests

### ✅ Calliope AI Features
- App-level diagnosis (Next.js auth errors)
- Mixed content detection and fixes
- Redirect loop detection and fixes
- Healing strategies for common issues

### ✅ All Core Tests Passing
```bash
$ ./smart-build.sh test:all
Test 1 (Thoughts Endpoint): ✅ PASS
Test 2 (App-Level Diagnosis): ✅ PASS
Test 3 (Health Endpoint): ✅ PASS
Status Chip Mechanism: ✅ PASS
```

---

## What's Broken

### ❌ Site Auditor Hangs
**Symptoms:**
1. Puppeteer times out after 30 seconds in Docker
2. Never completes page load for any URL
3. Works on host machine but not in Docker container
4. Affects both simple (/) and complex (/lyra) routes

**Error Output:**
```
TimeoutError: Timed out after waiting 30000ms
    at file:///tmp/auditor/node_modules/puppeteer-core/lib/esm/puppeteer/common/util.js:225:19
    ...
```

**Test Failures:**
- `test/calliope-real-time-ui-test.js` - Can't complete because audit hangs
- Any test relying on `auditAndHealRoute()` function

---

## Known Issues & Attempts

### Possible Causes
1. **Docker networking**: Puppeteer can't reach `http://dev-proxy/` from container
2. **Chrome in container**: Missing dependencies or sandbox issues
3. **Timeout configuration**: Not enough time for page load in container
4. **Volume mounting**: `/tmp/auditor` may have permission issues
5. **Next.js redirect loops**: /lyra/_next/ causes infinite redirects (partially fixed in nginx)

### What's Been Tried
- ✅ Fixed nginx redirect loops for /lyra/_next/
- ✅ Added proper X-Forwarded-Proto headers
- ✅ Increased timeout values
- ✅ Made operations non-blocking (so UI isn't blocked)
- ❌ Haven't investigated Docker networking in detail
- ❌ Haven't checked Puppeteer Chrome sandbox settings
- ❌ Haven't verified if `dev-proxy` is reachable from Puppeteer container

---

## Debug Steps to Try

### 1. Verify Docker Network Connectivity
```bash
# Can the Puppeteer container reach dev-proxy?
docker run --rm --network devproxy alpine:latest ping -c 3 dev-proxy

# Can it reach the proxy on port 80?
docker run --rm --network devproxy alpine:latest wget -O- http://dev-proxy/health.json

# Try from within the actual Puppeteer container
docker run --rm --network devproxy \
  --volumes-from dev-proxy-config-api \
  ghcr.io/puppeteer/puppeteer:latest \
  sh -c "curl -v http://dev-proxy/ 2>&1 | head -30"
```

### 2. Check Puppeteer Chrome Configuration
The auditor should disable sandbox mode for Docker:

```typescript
// site-auditor-debug/src/crawler.ts
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',              // REQUIRED in Docker
    '--disable-setuid-sandbox',  // REQUIRED in Docker
    '--disable-dev-shm-usage',   // Prevents /dev/shm issues
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
  ]
});
```

### 3. Test Simpler URLs First
```bash
# Try the simplest possible URL first
docker run --rm --network devproxy \
  --volumes-from dev-proxy-config-api \
  ghcr.io/puppeteer/puppeteer:latest \
  sh -lc "cd /tmp && \
    npx puppeteer browsers install chrome 2>&1 | grep -E 'chrome@|already' && \
    node -e \"
      const puppeteer = require('puppeteer');
      (async () => {
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.goto('http://dev-proxy/health.json', { 
          waitUntil: 'networkidle0',
          timeout: 10000
        });
        console.log('SUCCESS: Page loaded');
        await browser.close();
      })().catch(console.error);
    \""
```

### 4. Check Auditor Source Code
Review `site-auditor-debug/src/crawler.ts`:
- Line where timeout occurs
- Browser launch options
- Navigation options (waitUntil, timeout)
- Error handling

### 5. Add Verbose Logging
Add debug output to see where it hangs:

```typescript
// In crawler.ts
console.log('[AUDITOR] Launching browser...');
const browser = await puppeteer.launch({ ... });

console.log('[AUDITOR] Creating new page...');
const page = await browser.newPage();

console.log(`[AUDITOR] Navigating to ${url}...`);
await page.goto(url, { ... });

console.log('[AUDITOR] Page loaded successfully');
```

---

## Testing Requirements

### Test Structure
All tests should:
1. Be runnable via `./smart-build.sh test:<name>`
2. Output clear PASS/FAIL status
3. Not hang indefinitely (use timeouts)
4. Log to console what they're testing

### Example Test
```javascript
#!/usr/bin/env node
const { runSiteAuditor } = require('../utils/calliopeHealing');

async function test() {
  console.log('Testing site auditor on simple route...');
  
  const result = await runSiteAuditor('http://dev-proxy/', {
    wait: 1000,
    timeout: 15000  // Reasonable timeout
  });
  
  if (result.ok) {
    console.log('✅ PASS: Auditor completed');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Auditor failed');
    console.log(result.stderr);
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
```

---

## Success Criteria

The fix is complete when:

1. ✅ Site auditor completes successfully for `http://dev-proxy/`
2. ✅ Site auditor completes successfully for `http://dev-proxy/lyra`
3. ✅ Audit returns valid report with console/network data
4. ✅ `audit-and-heal` operation completes without hanging
5. ✅ All tests pass including auditor-dependent tests
6. ✅ Test execution time is reasonable (< 20 seconds per audit)
7. ✅ Works consistently (not flaky)

---

## Important Files to Check

### Configuration
- `docker-compose.yml` - Service definitions
- `config/default.conf` - Main nginx config
- `apps/lyra.conf` - Next.js app config (known redirect issues)

### Auditor Source
- `site-auditor-debug/src/crawler.ts` - Main crawler logic
- `site-auditor-debug/src/cli.ts` - CLI interface
- `site-auditor-debug/package.json` - Dependencies

### Utilities
- `utils/calliopeHealing.js` - Line ~1200: `runSiteAuditor()` function
- `utils/proxyConfigAPI.js` - Line ~1320: `audit-and-heal` endpoint

### Tests
- `test/calliope-real-time-ui-test.js` - Currently fails due to auditor
- `test/verify-thoughts-pushed.js` - Works (doesn't need auditor)

---

## Helpful Commands

```bash
# Check if services are running
docker ps

# Watch auditor activity in real-time
docker logs dev-proxy-config-api --tail 50 -f | grep -i audit

# Test nginx directly
curl -I http://localhost:80/
curl http://localhost:80/health.json

# Check ngrok tunnel
curl https://ramileo.ngrok.app/health.json

# Run specific test
node test/calliope-simple-test.js

# Manual auditor test (will hang currently)
node -e "require('./utils/calliopeHealing').runSiteAuditor('http://dev-proxy/', {timeout:10000}).then(console.log).catch(console.error)"
```

---

## Additional Context

### Nginx Routes
The proxy has these main routes:
- `/` - Status page
- `/health.json`, `/status.json`, `/routes.json` - Health endpoints
- `/lyra` - Next.js app (complex, has auth issues)
- `/api/ai/*` - Calliope API endpoints

### Next.js App Issues (Already Documented)
The `/lyra` route has:
- Next-auth configuration errors (app-level, not proxy)
- Previous redirect loop on `/_next/` (fixed in nginx)
- Requires `X-Forwarded-Proto: https` header
- Needs `basePath: /lyra` in Next.js config

These are **app-level issues** that Calliope can detect and recommend fixes for, but the auditor should still be able to load the page even if the app has errors.

---

## Project Documentation

Reference these files for more context:
- `test/REALTIME_UI_WORKING.md` - Real-time UI system documentation
- `test/TEST_RESULTS_HONEST.md` - What works vs what doesn't
- `README.md` - Project overview
- `docs/TROUBLESHOOTING.md` - Common issues
- `TaskBoard.md` - Outstanding tasks

---

## Your Mission

Fix the site auditor timeout issue so that:
1. Puppeteer can successfully load pages through the proxy
2. Audits complete within reasonable time
3. All tests pass
4. System is reliable and not flaky

**Remember:**
- TDD always (write test first)
- Use Docker for services, local Node for tests
- Check Docker logs for debugging
- Test incrementally (simple URLs first)
- Document what you find and fix

Good luck! 🚀

