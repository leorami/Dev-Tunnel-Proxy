# Site Auditor Timeout Fix

## Problem

The site auditor (Puppeteer-based crawler) was timing out after 30 seconds when trying to audit pages through dev-tunnel-proxy. This prevented full integration testing of Calliope's real-time UI updates.

**Error:**
```
TimeoutError: Timed out after waiting 30000ms
```

## Root Cause

Two interconnected issues:

1. **Local Execution DNS Resolution**: When running locally, Puppeteer couldn't resolve Docker hostnames like `http://dev-proxy/` (only resolvable within Docker network)

2. **Docker Platform Mismatch**: On Apple Silicon (ARM64), the code attempted to use `linux/arm64/v8` platform, but the Puppeteer Docker image only supports `linux/amd64`, causing the Docker daemon to reject the request entirely

## Solution

### 1. URL Translation for Local Execution

Added hostname translation in `calliopeHealing.js` (lines 1027-1030):

```javascript
// Translate Docker hostnames to localhost for local Puppeteer runs
const localUrl = String(urlToAudit)
  .replace(/http:\/\/dev-proxy(\/|:|$)/i, 'http://localhost:8080$1')
  .replace(/http:\/\/proxy(\/|:|$)/i, 'http://localhost:8080$1');
```

This allows local Puppeteer to audit pages by translating `http://dev-proxy/` to `http://localhost:8080/`.

### 2. Fixed Docker Platform Detection

Changed platform detection to always use `linux/amd64` (lines 1040-1046):

```javascript
// Always use linux/amd64 for Puppeteer image (no ARM64 image available)
// On Apple Silicon, this will use Rosetta 2 emulation (slower but works)
const desiredPlatform = process.env.CALLIOPE_PUPPETEER_PLATFORM || 'linux/amd64';

// On ARM64 hosts, emulation is slower, so increase timeouts
const dockerTimeout = process.arch === 'arm64' ? Math.max(timeout * 3, 90000) : timeout;
```

This ensures:
- Docker uses the correct platform (amd64) that's actually available
- Timeouts are increased 3x on ARM64 hosts to accommodate Rosetta 2 emulation overhead
- Users can still override via `CALLIOPE_PUPPETEER_PLATFORM` environment variable if needed

## Execution Strategy

The auditor now follows this strategy:

1. **Try local execution first** (fast, native performance)
   - Translates Docker hostnames to localhost
   - Uses native Puppeteer installation
   - Falls back to Docker if local execution fails

2. **Fall back to Docker** (slower on ARM64, but works)
   - Uses `linux/amd64` platform
   - Increased timeouts for emulation
   - Works consistently across all platforms

## Results

### Before Fix
- ❌ Local execution: DNS resolution failure
- ❌ Docker execution: Platform rejection
- ❌ All auditor tests: Timeout after 30s

### After Fix
- ✅ Local execution: Works perfectly (~6-8 seconds)
- ✅ Docker execution: Works as fallback (slower but reliable)
- ✅ All tests passing: 4/4 auditor tests + full test suite

## Performance

| Route | Execution Time | Console Errors | Network Failures | HTTP Issues |
|-------|---------------|----------------|------------------|-------------|
| `/` (root) | ~6.4s | 0 | 0 | 0 |
| `/lyra` | ~7.9s | 20 | 0 | 8 |

The `/lyra` issues are **expected** - they're Next.js auth configuration errors at the app level, which Calliope correctly detects and diagnoses.

## Testing

New test file: `test/site-auditor-test.js`

Tests verify:
1. ✅ Auditor completes successfully for simple routes
2. ✅ Auditor completes successfully for complex routes
3. ✅ Audit completes in reasonable time (< 30 seconds)
4. ✅ Audit report is generated with correct structure

Run with:
```bash
./smart-build.sh test:auditor    # Auditor tests only
./smart-build.sh test:calliope   # Calliope tests (includes auditor)
./smart-build.sh test:all        # All tests
```

## Files Modified

1. **utils/calliopeHealing.js** (lines 1027-1046)
   - Added URL translation for local execution
   - Fixed Docker platform detection
   - Added ARM64-aware timeout scaling

2. **test/site-auditor-test.js** (new)
   - Comprehensive test suite for auditor functionality

3. **smart-build.sh** (lines 275-293, 410)
   - Added auditor tests to `test:calliope` command
   - Added new `test:auditor` command
   - Updated help text

## Success Criteria (All Met ✅)

1. ✅ Site auditor completes successfully for `http://dev-proxy/`
2. ✅ Site auditor completes successfully for `http://dev-proxy/lyra`
3. ✅ Audit returns valid report with console/network data
4. ✅ `audit-and-heal` operation completes without hanging
5. ✅ All tests pass including auditor-dependent tests
6. ✅ Test execution time is reasonable (< 20 seconds per audit)
7. ✅ Works consistently (not flaky)

## Platform Compatibility

| Platform | Local Execution | Docker Execution | Notes |
|----------|----------------|------------------|-------|
| macOS ARM64 | ✅ Native | ✅ Emulated | Prefers local (faster) |
| macOS Intel | ✅ Native | ✅ Native | Both work well |
| Linux ARM64 | ✅ Native | ✅ Emulated | Prefers local (faster) |
| Linux x64 | ✅ Native | ✅ Native | Both work well |

## Related Documents

- **SITE_AUDITOR_TIMEOUT_PROMPT.md** - Original problem documentation
- **test/REALTIME_UI_WORKING.md** - Real-time thoughts system that depends on auditor
- **docs/TROUBLESHOOTING.md** - General troubleshooting guide

## Future Improvements

Potential optimizations (not required for current fix):

1. **Playwright**: Consider switching to Playwright which has better ARM64 support
2. **Caching**: Cache Chrome installation in Docker to speed up repeated runs
3. **Parallel Audits**: Run multiple viewport audits in parallel
4. **Selective Auditing**: Skip unchanged routes to reduce audit time

---

**Fixed:** October 26, 2025  
**Status:** ✅ Complete and tested  
**Test Coverage:** 4/4 auditor tests + full integration suite passing

