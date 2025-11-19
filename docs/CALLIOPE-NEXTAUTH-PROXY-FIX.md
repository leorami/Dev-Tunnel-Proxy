# Calliope Training: Fixing NextAuth 308 Redirects Under Subpath Proxy

## Problem Symptoms

When a Next.js app with NextAuth is proxied under a subpath (e.g., `/lyra`), API routes return:
- **308 Permanent Redirect** to the base path (e.g., `/lyra`)
- Error in browser: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- Console errors: `[next-auth][error][CLIENT_FETCH_ERROR]`
- Requests to `/lyra/api/auth/session` redirect instead of returning JSON

## Root Cause

NextAuth validates that incoming requests match the configured `NEXTAUTH_URL`. When there's a mismatch between:
1. The configured `NEXTAUTH_URL` (e.g., `http://localhost:4000/lyra/`)
2. The actual request protocol/host (e.g., `https://ramileo.ngrok.app`)

NextAuth returns a 308 redirect to what it thinks is the correct URL.

## Diagnostic Process

### Step 1: Verify the Symptoms
```bash
# Test the API endpoint through the proxy
curl -v https://your-domain.ngrok.app/lyra/api/auth/session

# Look for:
# < HTTP/2 308 
# < location: /lyra
# < refresh: 0;url=/lyra
```

### Step 2: Check Direct Backend Access
```bash
# Test backend directly (from inside nginx container)
docker exec dev-proxy curl -v http://lyra-dev:4000/lyra/api/auth/session

# If this returns 200 OK with JSON, the backend works fine
# The issue is in how the proxy forwards requests
```

### Step 3: Check Environment Variables
```bash
# Check what NEXTAUTH_URL is set to
docker exec lyra-dev env | grep NEXTAUTH

# Common issue: NEXTAUTH_URL=http://localhost:4000/lyra/
# But requests come via HTTPS with different host
```

### Step 4: Test with Proper Headers
```bash
# Test if backend works with correct forwarded headers
docker exec dev-proxy curl -v \
  -H "X-Forwarded-Proto: https" \
  -H "X-Forwarded-Host: your-domain.ngrok.app" \
  http://lyra-dev:4000/lyra/api/auth/session

# If this returns 200 OK, nginx config is fine
# If this returns 308, NEXTAUTH_URL mismatch is confirmed
```

## The Fix

### Option 1: Update Docker Environment Variable (Recommended)

Update the `NEXTAUTH_URL` to match the public URL:

```yaml
# In docker-compose.yml or container config
environment:
  - NEXTAUTH_URL=https://your-domain.ngrok.app/lyra
  # Or for dynamic ngrok URLs:
  - NEXTAUTH_URL=${NGROK_URL}/lyra
```

### Option 2: Use NEXTAUTH_URL_INTERNAL (NextAuth v4)

For apps that need different internal vs external URLs:

```yaml
environment:
  - NEXTAUTH_URL=https://your-domain.ngrok.app/lyra  # External
  - NEXTAUTH_URL_INTERNAL=http://localhost:4000/lyra # Internal
```

### Option 3: Modify Auth Config (Less Preferred)

In `app/api/auth/[...nextauth]/route.ts`, you can add URL normalization:

```typescript
// Force NEXTAUTH_URL to match X-Forwarded headers
if (process.env.NEXTAUTH_URL) {
  const url = new URL(process.env.NEXTAUTH_URL);
  // This allows any host/protocol to work
  url.protocol = 'https:'; // Match X-Forwarded-Proto
  process.env.NEXTAUTH_URL = url.toString();
}
```

## Verification

After applying the fix:

```bash
# 1. Restart the container to pick up new env vars
docker restart lyra-dev

# 2. Wait for Next.js to start
sleep 15

# 3. Test the endpoint
curl -s https://your-domain.ngrok.app/lyra/api/auth/session

# Expected: {"user":null} or similar JSON (not a redirect!)
```

## Prevention

When setting up new Next.js apps with NextAuth under a subpath:

1. **Always set `NEXTAUTH_URL` to the public-facing URL** (not localhost)
2. **Use environment variables** so it's easy to change per deployment
3. **Test auth endpoints specifically** - they have different requirements than pages
4. **Check nginx forwards required headers**: `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-For`

## Nginx Configuration Requirements

Ensure your nginx location block includes:

```nginx
location ^~ /lyra/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto "https";  # Critical!
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Prefix /lyra;
  
  proxy_pass http://lyra-dev:4000/lyra/;
}
```

Note:
- Use `^~` prefix for priority matching (prevents other locations from intercepting)
- Set `X-Forwarded-Proto` to `"https"` (not `$scheme` which would be `http` internally)
- Set `X-Forwarded-Host` to `$host` (the public hostname)

## Related Issues

- **Symptom**: `/api/auth/_log` returns 500 errors
  - **Cause**: Same NEXTAUTH_URL mismatch
  - **Fix**: Same as above

- **Symptom**: Google OAuth callback fails with `redirect_uri_mismatch`
  - **Cause**: NEXTAUTH_URL doesn't match OAuth redirect URI configured in Google Console
  - **Fix**: Update Google OAuth settings to match actual NEXTAUTH_URL

- **Symptom**: Session cookies not being set
  - **Cause**: Secure cookie settings mismatch with X-Forwarded-Proto
  - **Fix**: Ensure `X-Forwarded-Proto` is set correctly to `https`

## Testing with Site Auditor

Use the generic test to verify the fix:

```bash
node test/nextjs-auth-test.js https://your-domain.ngrok.app/lyra next-auth
```

This will:
1. Load the page in Playwright
2. Capture all console errors
3. Monitor network requests to `/api/auth/*`
4. Report any 308 redirects or JSON parsing errors

## Summary

- **Root Cause**: `NEXTAUTH_URL` environment variable mismatch
- **Quick Fix**: Update `NEXTAUTH_URL` in Docker config to match public URL
- **Not a Proxy Issue**: Nginx configuration was correct; this is app-level config
- **Lesson**: Always verify environment variables match the actual request URL

