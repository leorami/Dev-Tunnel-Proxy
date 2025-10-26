# Mixed Content Fix Summary

## Problem

The user reported console errors showing:
- Mixed Content errors: Page loaded over HTTPS but requesting HTTP resources
- 9 blocked requests to `http://ramileo.ngrok.app/lyra/_next/` assets
- ERR_NETWORK_CHANGED errors (these were symptoms of the mixed content blocking)

## Root Cause Analysis

After creating proper browser tests with Puppeteer, I identified **TWO separate issues**:

### Issue 1: nginx Automatic Redirects Using HTTP

nginx was issuing 301/308 redirects with absolute HTTP URLs when clients requested paths without trailing slashes.

**Example:**
```
Request: https://ramileo.ngrok.app/lyra/_next
Response: 301 Moved Permanently
Location: http://ramileo.ngrok.app/lyra/_next/  ❌ HTTP!
```

When Next.js made requests to `/_next` endpoints, nginx's automatic trailing-slash redirect was generating absolute URLs using the internal protocol (`$scheme` = `http`) instead of the external protocol (HTTPS from ngrok).

### Issue 2: X-Forwarded-Proto Not Preserving HTTPS

The nginx proxy configuration was setting `X-Forwarded-Proto` to `$scheme`, which evaluates to `http` (the internal connection between ngrok and nginx), overwriting the original `https` protocol from the client → ngrok connection.

## Fixes Applied

### Fix 1: Disable Absolute Redirects in nginx

**File:** `config/default.conf`

Added directives to prevent nginx from generating absolute URLs in redirects:

```nginx
server {
  listen 80;
  server_name _;
  
  # Prevent nginx from issuing absolute HTTP URLs in redirects
  # This fixes mixed content errors when accessed via HTTPS (ngrok)
  absolute_redirect off;
  port_in_redirect off;
  
  ...
}
```

**Effect:**
- Before: `Location: http://ramileo.ngrok.app/lyra/_next/`
- After: `Location: /lyra/_next/` (relative URL, browser preserves HTTPS)

### Fix 2: Force HTTPS for X-Forwarded-Proto

**File:** `apps/lyra.conf`

Changed from using `$scheme` to hardcoding `https`:

```nginx
# Before (wrong):
proxy_set_header X-Forwarded-Proto $scheme;  # $scheme = http (internal)

# After (correct):
proxy_set_header X-Forwarded-Proto "https";  # Always HTTPS for ngrok
```

Applied to all lyra location blocks:
- `location = /lyra`
- `location /lyra/_next/`
- `location /lyra/`

## Test Results

### Before Fix:
```
/lyra Results:
  ❌ Mixed Content Errors: 9
  ❌ HTTP Requests: 9
  ✓  HTTPS Requests: 27
```

### After Fix:
```
/lyra Results:
  ✅ Mixed Content Errors: 0
  ✅ HTTP Requests: 0
  ✅ HTTPS Requests: 196
```

## ERR_NETWORK_CHANGED Resolution

The `ERR_NETWORK_CHANGED` errors were **symptoms** of the mixed content blocking:
- Browser blocks HTTP requests on HTTPS pages
- This causes network failures
- Browser console shows various network error codes
- Once mixed content is fixed, these errors disappear

## Files Changed

1. **config/default.conf**
   - Added `absolute_redirect off;`
   - Added `port_in_redirect off;`

2. **apps/lyra.conf**
   - Fixed redirect loop (removed faulty rewrite rule)
   - Set `X-Forwarded-Proto` to `"https"` for all location blocks

3. **Test Files Created**
   - `test/mixed-content-test.js` - Detects mixed content errors with Puppeteer
   - `test/comprehensive-browser-test.js` - Full browser monitoring

## Key Learnings

1. **Mixed Content is a Security Feature**
   - Browsers block HTTP resources on HTTPS pages by design
   - Manifests as various network error types (ERR_NETWORK_CHANGED, etc.)

2. **nginx Redirects Need Special Handling Behind HTTPS Proxies**
   - `absolute_redirect off` prevents `http://` URLs in Location headers
   - Critical for setups where internal communication is HTTP but external is HTTPS

3. **X-Forwarded-Proto Must Preserve Original Protocol**
   - Don't blindly use `$scheme` (internal protocol)
   - When behind ngrok/HTTPS proxy, explicitly set to `https`

4. **Browser Tests Are Essential**
   - curl/wget tests don't catch browser-specific issues
   - Puppeteer reveals actual browser behavior and security blocking

## Commands to Verify

```bash
# Test for mixed content
node test/mixed-content-test.js

# Test redirects
curl -sI https://ramileo.ngrok.app/lyra/_next | grep location
# Should return: location: /lyra/_next/ (relative, not absolute HTTP)

# Verify lyra loads
curl -s https://ramileo.ngrok.app/lyra | grep -o "assetPrefix"
# Should see asset references in HTML
```

## Impact

- ✅ /lyra now loads correctly via HTTPS (ngrok)
- ✅ All assets load over HTTPS
- ✅ No mixed content warnings
- ✅ No browser security blocking
- ✅ Calliope can now properly audit /lyra
- ✅ ERR_NETWORK_CHANGED symptoms resolved

## Test Coverage

The new tests properly detect:
- ✅ Mixed content errors in console
- ✅ HTTP requests on HTTPS pages
- ✅ Failed requests due to security blocking
- ✅ Redirect location headers with incorrect protocols

These tests would have caught the issue immediately if they existed before.

