# Dev Tunnel Proxy User Guide

**Last Updated**: January 2026  
**Version**: 1.1

Welcome! This guide will help you get started with Dev Tunnel Proxy, from initial setup to daily usage and troubleshooting.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [First Steps](#first-steps)
5. [Adding Your App](#adding-your-app)
6. [Using the Status Dashboard](#using-the-status-dashboard)
7. [Working with Calliope](#working-with-calliope)
8. [Common Workflows](#common-workflows)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Integration](#advanced-integration)
11. [Quick Reference](#quick-reference)

---

## Introduction

### What is Dev Tunnel Proxy?

Dev Tunnel Proxy is a development tool that:
- **Routes multiple apps** through a single proxy (no more port chaos!)
- **Provides a secure tunnel** to share your work with anyone
- **Monitors health** of all your routes automatically
- **Fixes issues automatically** with Calliope, the AI assistant

### When Should I Use It?

Perfect for:
- ✅ Running multiple services locally (microservices, API + frontend)
- ✅ Sharing work-in-progress with teammates or stakeholders
- ✅ Testing apps under subpaths (e.g., `/myapp/` instead of root)
- ✅ Getting help from AI when things break

Not needed for:
- ❌ Single app with no sharing requirements
- ❌ Production deployments (use production-grade proxies)

### Key Concepts

**Proxy**: Acts as a "front door" for all your services  
**Route**: A URL path (e.g., `/myapp/`) that maps to a service  
**Tunnel**: Secure connection to share your proxy publicly  
**Calliope**: AI assistant that monitors and fixes routing issues

---

## Prerequisites

### Required Software

1. **Docker Desktop** (version 20.10+)
   - Download: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version` and `docker-compose --version`

2. **Git** (for cloning the repository)
   - Download: https://git-scm.com/downloads
   - Verify: `git --version`

3. **ngrok Account** (free tier works)
   - Sign up: https://ngrok.com/signup
   - Get auth token from dashboard

### Recommended Tools

- **Node.js** (v18+) - For running helper scripts
- **VS Code** - Convenient for editing configs
- **Terminal** - Bash, Zsh, or PowerShell

### System Requirements

- **OS**: macOS, Linux, or Windows (with WSL2)
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 2GB free space for Docker images

---

## Initial Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/dev-tunnel-proxy.git
cd dev-tunnel-proxy
```

### Step 2: Configure ngrok

Create a `.env` file in the project root:

```bash
# .env
NGROK_AUTHTOKEN=your_authtoken_here

# Optional: Use a static domain (requires paid ngrok plan)
# NGROK_STATIC_DOMAIN=your-subdomain.ngrok.app
```

**Where to find your authtoken**:
1. Log in to https://dashboard.ngrok.com
2. Click "Your Authtoken" in the left sidebar
3. Copy the token

### Step 3: Create Docker Network

```bash
docker network create devproxy
```

This network allows all your services to communicate with the proxy.

### Step 4: Run Setup

```bash
./smart-build.sh setup
```

This command:
- ✅ Installs dependencies
- ✅ Generates TLS certificates
- ✅ Prepares nginx configuration
- ✅ Verifies everything is ready

**Expected output**:
```
Setting up Dev Tunnel Proxy...
✓ Installing workspace dependencies
✓ Generating TLS certificates
✓ Hardening upstream configs
✓ Pre-generating nginx bundle
Setup complete! Run './smart-build.sh up' to start.
```

### Step 5: Start the Proxy

```bash
./smart-build.sh up
```

**What starts**:
- `dev-proxy` - Nginx reverse proxy (port 8080)
- `dev-ngrok` - Secure tunnel
- `dev-proxy-config-api` - Configuration API + Calliope (port 3001)
- `dev-auto-scan` - Health monitoring

**Verify it's running**:
```bash
./smart-build.sh status
```

You should see:
```
Container Status:
✓ dev-proxy (running)
✓ dev-ngrok (running)
✓ dev-proxy-config-api (running)
✓ dev-auto-scan (running)
```

---

## First Steps

### Access the Status Dashboard

Open your browser to:
```
http://localhost:8080/status
```

You should see a dashboard with:
- List of configured routes (may be empty at first)
- Health status indicators
- Filter and search options
- Theme toggle (light/dark mode)

### Get Your Tunnel URL

```bash
./smart-build.sh logs ngrok | grep "https://"
```

Look for a line like:
```
https://abc123.ngrok.app -> http://dev-proxy:80
```

This is your public URL! Anyone with this URL can access your proxy.

**Bookmark it** - It won't change unless you restart ngrok.

### Test the Proxy

```bash
curl http://localhost:8080/health.json
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:34:56.789Z",
  "proxy": "operational",
  "routes": 0
}
```

---

## Adding Your App

### ⚠️ Important: Reserved Paths Restriction

**The root path (`/`) is FORBIDDEN for apps and is reserved exclusively for the Dev Tunnel Proxy landing page.**

#### What This Means

- ❌ **Apps cannot define** `location = /` in their nginx configuration
- ✅ **Apps must use** their own namespaced path (e.g., `/myapp/`, `/api/`, `/service/`)
- 🚫 **Automatic blocking** - Any attempt to define the root path will be silently ignored with a warning

#### Why This Exists

1. The root path serves as the proxy's landing page and brand identity
2. It provides visitors with comprehensive information about the system
3. It prevents conflicts between multiple apps competing for the root
4. It ensures consistent navigation and user experience

#### Reserved Proxy Paths

Avoid using these paths in your app configurations:

| Path | Purpose | Status |
|------|---------|--------|
| `/` | Landing page | **FORBIDDEN** |
| `/status` | Status dashboard | Reserved |
| `/health` | Health page | Reserved |
| `/reports` | Reports page | Reserved |
| `/dashboard` | Dashboard | Reserved |
| `/api/ai/*` | Calliope AI | Reserved |
| `/api/config/*` | Config API | Reserved |
| `/api/apps/*` | Apps API | Reserved |
| `/health.json` | Health JSON | Reserved |
| `/routes.json` | Routes JSON | Reserved |
| `/.artifacts/*` | Artifacts | Reserved |

#### Correct Configuration Examples

```nginx
# ❌ FORBIDDEN - Will be automatically blocked
location = / {
  proxy_pass http://my-app:3000;
}

# ✅ CORRECT - Use your own namespaced path
location ^~ /myapp/ {
  proxy_pass http://my-app:3000/;
}

# ✅ CORRECT - API endpoint with prefix
location ^~ /api/v1/ {
  proxy_pass http://api-service:8000/;
}

# ✅ CORRECT - Service with exact match redirect
location = /service {
  return 301 /service/;
}

location ^~ /service/ {
  proxy_pass http://service:4000/;
}
```

**See [CONFIGURATION.md](./CONFIGURATION.md#reserved-paths) for complete details.**

---

### Method 1: Automatic (Recommended)

If your app is already running in Docker, use the API:

```javascript
// From your app's code or startup script
fetch('http://dev-proxy:8080/api/apps/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'myapp',
    content: `
      location /myapp/ {
        resolver 127.0.0.11 ipv6=off;
        resolver_timeout 5s;
        set $myapp_upstream myapp-service:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://$myapp_upstream/;
      }
    `
  })
});
```

**Or use the helper script**:
```bash
node examples/api-upload-config.js myapp examples/sample-prefix-app.conf
```

### Method 2: Manual

Create a file `apps/myapp.conf`:

```nginx
# apps/myapp.conf
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:3000;
  
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  # Strip /myapp/ prefix before forwarding
  proxy_pass http://$myapp_upstream/;
}
```

Then reload the proxy:
```bash
./smart-build.sh reload
```

### Connect Your App to the Network

In your app's `docker-compose.yml`:

```yaml
networks:
  devproxy:
    external: true
    name: devproxy

services:
  myapp-service:
    # ... your service config
    networks:
      - devproxy
```

Restart your app:
```bash
docker-compose up -d
```

### Verify It Works

```bash
# Local access
curl http://localhost:8080/myapp/

# Tunnel access (replace with your ngrok URL)
curl https://abc123.ngrok.app/myapp/
```

---

## Using the Status Dashboard

### Overview

The status dashboard (`http://localhost:8080/status`) is your command center with a modern, polished interface featuring custom dialogs and improved UX.

### Key Features

#### 1. Route Cards

Each route displays:
- **Path** (e.g., `/myapp/`)
- **Health status** (green=ok, yellow=warn, red=error)
- **Status codes** (200, 404, 502, etc.)
- **Source file** (which config defines this route)
- **Actions** (Diagnose with Calliope, Notifications, etc.)

#### 2. Route Conflicts Management

**New in v1.1**: Enhanced conflict detection and resolution

When multiple configuration files declare the same routes, you'll see:
- **Conflict Detected chip** in Status Overview - Click to scroll to conflicts
- **Route Conflicts card** with:
  - Icon badge and clear title
  - **Help Me button** - Opens Calliope with conflict context pre-populated
  - **Dismiss button** - Hides the card for 7 days
  - Detailed descriptions of each conflict
  - Visual "CONFLICT" badges
  - Winner selection options
  - Actionable suggestions with rename buttons
  - AI Auto-Fix option

The conflicts card provides clear explanations of what's happening and multiple ways to resolve issues.

#### 3. Filtering

**By severity**:
- Click `ok`, `warn`, or `err` chips to filter

**By status code**:
- Click `200`, `404`, `502` chips

**By target**:
- `localhost:200` - Only local 200s
- `ngrok:404` - Only tunnel 404s

**Search**:
- Type in search box to filter by path

#### 3. Collapsing Cards

- Click card header to minimize to compact view
- Click again to expand

#### 4. Grouping

Routes are automatically grouped by upstream service for easier navigation.

#### 5. Theme Toggle

Click the moon/sun icon in top-right to switch between light and dark modes.

#### 6. Modern UI Components (New in v1.1)

The dashboard now features:
- **Custom Modal Dialogs** - Replacing native browser dialogs with branded, consistent modals
- **Toast Notifications** - Non-blocking success/error/info messages that auto-dismiss
- **Custom Prompt Dialogs** - Styled input dialogs for renaming routes and other actions
- **Icon-Based Navigation** - Lucide icons for Reload, View Toggle, and Theme
- **Responsive Design** - Calliope drawer properly fits viewport with consistent gaps

All custom dialogs feature:
- Light/white backgrounds matching the app's style
- Smooth animations and transitions
- Keyboard navigation support (Escape to close, Enter to confirm)
- Proper focus management
- Screen reader compatibility

#### 7. Create Route Tool (New in v1.1)

Access via the **Create Route** link in the header or the plus icon in the Configured Apps card.

Features:
- **Framework Presets** - Quick configs for Next.js, Vite, Rails, Django, Express
- **Auto-configuration** - Generates optimal nginx config with safety rails
- **Instant Install** - One-click deployment to the proxy
- **Download Option** - Get the generated config file
- **Validation** - Ensures proper basePath formatting and upstream URLs
- **Built-in Options**:
  - Trailing slash redirects (recommended)
  - WebSocket support (for HMR)
  - X-Forwarded-Prefix header

The tool automatically:
- Normalizes base paths (ensures leading `/` and trailing `/`)
- Validates upstream URLs
- Checks against reserved proxy paths
- Generates redirect companion blocks
- Adds appropriate proxy headers
- Tests and reloads nginx safely

---

## Working with Calliope

### What is Calliope?

Calliope is your AI assistant who:
- **Answers questions** about the proxy and your routes
- **Diagnoses issues** when things aren't working
- **Fixes problems automatically** (with your permission)
- **Learns from each fix** to handle similar issues faster
- **Helps resolve conflicts** between competing route configurations

### Opening Calliope

**New in v1.1**: Improved drawer behavior
- Click the **Calliope** button (with heart stethoscope icon) in the header
- Or click the diagnostic icon next to any route
- Or click **Help Me** button in the Route Conflicts card

The Calliope drawer now:
- **Completely hides when collapsed** - No visible edges or shadows
- **Aligns perfectly with content** - Top-aligned with Status Overview card
- **Fits within viewport** - Responsive height with 16px gaps top and bottom
- **Smooth transitions** - Visibility transitions properly timed with animations

### Asking Questions

**Example questions**:
- "Why is my /myapp route returning 404?"
- "How do I configure WebSocket support?"
- "What healing capabilities do you have?"
- "Can you check the /api/ route?"

**Type your question** in the input box and click **Ask** or press Enter.

### Getting Route Diagnostics

1. Click the stethoscope icon next to a route
2. Calliope will:
   - Probe the route
   - Analyze the response
   - Check configuration
   - Suggest fixes

### Viewing Thinking Process

When Calliope is working on something complex, you'll see:
- **Animated thinking dots** (💭)
- **Status chips** showing current step
  - "Investigating"
  - "Diagnosing"
  - "Applying Fix"
  - "Testing"

### Understanding Responses

Calliope will:
- ✅ Explain what she found
- ✅ Show what she's doing to fix it
- ✅ Verify the fix worked
- ✅ Give you next steps

**Example response**:
```
I checked /myapp/ and noticed your assets were returning 404s! 
This is usually because React apps need proper basePath configuration.

I've added an override to handle this:
✓ Created overrides/myapp-assets.conf
✓ Regenerated bundle
✓ Reloaded nginx
✓ Verified assets now load correctly (200 OK)

Everything's working now! Let me know if you need anything else. 💖
```

### Clearing Chat History

Click the **Clear** button to start fresh. (History is also saved in localStorage.)

---

## Common Workflows

### Workflow 1: Adding a New App

```bash
# 1. Create your app's docker-compose.yml with devproxy network
# 2. Start your app
docker-compose up -d

# 3. Create nginx config
cat > apps/newapp.conf << 'EOF'
location /newapp/ {
  resolver 127.0.0.11 ipv6=off;
  set $newapp_upstream newapp-service:3000;
  proxy_pass http://$newapp_upstream/;
}
EOF

# 4. Reload proxy
./smart-build.sh reload

# 5. Verify
curl http://localhost:8080/newapp/
```

### Workflow 2: Updating Configuration

```bash
# 1. Edit your config file
vim apps/myapp.conf

# 2. Reload (tests config before applying)
./smart-build.sh reload

# 3. Check status dashboard for health
open http://localhost:8080/status
```

### Workflow 3: Debugging 404 Errors

```bash
# 1. Check status dashboard
# Notice route shows 404

# 2. Ask Calliope
# Click stethoscope icon or open chat:
# "Why is /myapp/ returning 404?"

# 3. Review nginx logs
./smart-build.sh logs proxy

# 4. Check app logs
docker logs myapp-service
```

### Workflow 4: Sharing Work with Team

```bash
# 1. Get tunnel URL
./smart-build.sh logs ngrok | grep https://

# 2. Share with team
# Send: https://abc123.ngrok.app/myapp/

# 3. Monitor access in dashboard
# Watch status dashboard for incoming requests
```

### Workflow 5: Multiple Environments

```bash
# Development
docker-compose up -d

# Staging (use different config)
docker-compose -f docker-compose.staging.yml up -d

# Separate apps/ directories
apps/dev/
apps/staging/
```

---

## Troubleshooting

This section covers common issues and their solutions. For more details, see [CONFIGURATION.md](./CONFIGURATION.md) and [TESTING_SECURITY_AND_QUALITY.md](./TESTING_SECURITY_AND_QUALITY.md).

### Critical: proxy_pass Trailing Slash Behavior

**Problem**: Adding a trailing slash to `proxy_pass` directives can break apps that expect their URL prefix preserved.

**Wrong Configuration:**
```nginx
location /myapp/ {
    proxy_pass http://upstream:3000/;  # ❌ Strips /myapp/ prefix
}
```

**Correct Configuration:**
```nginx
location /myapp/ {
    proxy_pass http://upstream:3000;   # ✅ Preserves /myapp/ prefix
}
```

**Why This Matters:**
- With trailing slash: Request to `/myapp/api/data` becomes `/api/data` to upstream
- Without trailing slash: Request to `/myapp/api/data` stays `/myapp/api/data` to upstream
- Apps expecting their prefix (like React apps with `PUBLIC_URL` or Next.js with `basePath`) break when prefix is stripped
- JavaScript bundles return HTML fallback instead of JS, causing `Uncaught SyntaxError: Unexpected token '<'`

**Common Symptoms:**
- App loads but JavaScript fails with syntax errors
- Assets return HTML instead of expected content (JS/CSS)
- API calls fail with 404 because paths don't match
- Bundle size unexpectedly small (~2KB instead of ~MB)

### Container Name Mismatches

**Problem**: Nginx config references wrong container names, causing connection failures.

**Symptoms**:
- `proxy_pass` returns 502 Bad Gateway
- DNS resolution errors in nginx logs
- Container exists but proxy can't connect

**Solution**: Verify actual container names match nginx configuration.

```bash
# Check actual container names on the devproxy network
docker network inspect devproxy --format='{{json .Containers}}' | jq

# Common mistake: using generic names instead of actual container names
# ❌ Wrong:  proxy_pass http://myapp:3000;
# ✅ Correct: proxy_pass http://myapp-site-dev-myapp:3000;
```

### Missing Variable Resolution for Upstreams

**Problem**: Nginx fails to start when upstream services aren't available at startup.

**Symptoms**:
- `nginx: [emerg] host not found in upstream "service-name"`
- Container exits with code 1
- Proxy works when all services are running, fails on restart

**Solution**: Always use nginx variables for upstream resolution with error handling.

```nginx
# ❌ Wrong: Hardcoded upstream (fails if service is down)
location /myapp/ {
  proxy_pass http://myapp-service:3000/;
}

# ✅ Correct: Variable resolution with graceful error handling
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:3000;
  
  # Graceful error handling for unavailable upstream
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$myapp_upstream/;
}

# Global error handler (add once per config file)
location @upstream_unavailable {
  add_header Content-Type application/json;
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  return 503 '{"error":"Service Unavailable","message":"The requested application is not currently running. Please start the service and try again.","status":503}';
}
```

**How It Works**:
- **Without variables**: nginx resolves DNS at config load time → fails if service is down
- **With variables**: nginx resolves DNS at request time → starts successfully even if service is down
- **Error handling**: Returns friendly JSON error (503) instead of nginx error page when service is unavailable
- **Docker DNS**: Uses Docker's internal DNS (127.0.0.11) for service discovery

### Next.js Redirect Loop Issues

**Problem**: Next.js apps with `basePath` can cause redirect loops, especially with `/_next/` assets.

**Common Symptoms**:
- **308 Permanent Redirects** on `/_next/` directory requests
- Infinite redirect loops between `/myapp` and `/myapp/`  
- Assets fail to load with redirect errors
- HMR connections fail

**Root Cause**: Competing nginx rules and improper trailing slash handling.

**❌ Problematic Patterns**:
```nginx
# This causes 308 redirects
location /myapp/_next/ {
  proxy_pass http://upstream/myapp/_next/;  # trailing slash problematic
}

# This can cause redirect loops
location = /myapp { rewrite ^ /myapp/ last; }
```

**✅ Proven Solutions**:

**1. Use Regex for Route Variants**
```nginx
# Handles both /myapp and /myapp/ without redirects
location ~ ^/myapp/?$ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp;  # no trailing slash
}
```

**2. Split _next/ Handling**
```nginx
# Handle bare directory (prevents 308)
location = /myapp/_next/ {
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp/_next;  # no trailing slash!
}

# Handle specific files
location ~ ^/myapp/_next/(.+)$ {
  set $myapp_upstream myapp-service:2000;
  proxy_pass http://$myapp_upstream/myapp/_next/$1;
}
```

### Essential Proxy Headers

**Problem**: Missing headers cause issues with WebSocket connections, HTTPS redirects, etc.

**Required Headers**:

```nginx
location /myapp/ {
  # Basic forwarding
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  
  # WebSocket support (for HMR)
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  # Development helpers
  proxy_set_header ngrok-skip-browser-warning "true";
  
  # Timeouts for development
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
}
```

### Docker Network Connectivity

**Problem**: Containers can't communicate even when on the same network.

**Verification Steps**:

```bash
# 1. Check if container is on devproxy network
docker network inspect devproxy

# 2. Test DNS resolution from proxy container
docker exec dev-proxy nslookup myapp-service

# 3. Test direct connectivity
docker exec dev-proxy wget -qO- --timeout=5 http://myapp-service:3000/

# 4. Check what ports the service is actually listening on
docker exec myapp-service netstat -tlnp
```

### Configuration Validation

Before deploying nginx changes:

```bash
# Test nginx syntax
docker exec dev-proxy nginx -t

# Reload safely (won't fail if upstreams are down)
./scripts/reload.sh

# Check proxy logs
docker-compose logs proxy --tail=20
```

### Proxy Won't Start

**Symptoms**: `./smart-build.sh up` fails

**Common Causes**:
1. **Port conflict** (8080, 443, or 3001 in use)
   ```bash
   # Find what's using port
   lsof -ti:8080
   ```

2. **Docker network exists**
   ```bash
   docker network ls | grep devproxy
   # If exists, you're good. If not:
   docker network create devproxy
   ```

3. **Invalid ngrok token**
   ```bash
   # Check .env file has correct NGROK_AUTHTOKEN
   cat .env | grep NGROK
   ```

### Route Returns 502 Bad Gateway

**Symptoms**: Status dashboard shows 502 for your route

**Causes**:
1. **App isn't running**
   ```bash
   docker ps | grep myapp-service
   # If not listed, start it
   ```

2. **App not on devproxy network**
   ```bash
   docker inspect myapp-service | grep devproxy
   # If empty, add network to docker-compose.yml
   ```

3. **Wrong port in config**
   ```bash
   # Check app actually listens on configured port
   docker logs myapp-service | grep "listening"
   ```

**Fix**: Ask Calliope!
```
Click stethoscope icon → Calliope will diagnose and suggest fixes
```

### Route Returns 404

**Symptoms**: Can't find page or assets

**Causes**:
1. **Path doesn't match app's routes**
   ```bash
   # If app serves at root, but config says /myapp/
   # App needs basePath configuration
   ```

2. **Trailing slash mismatch**
   ```nginx
   # Try both:
   location /myapp/ { ... }
   location /myapp { ... }
   ```

3. **Assets need special handling**
   ```bash
   # React/Next.js apps may need PUBLIC_URL or basePath
   # Check app documentation
   ```

### Calliope Doesn't Respond

**Symptoms**: Chat messages don't get responses

**Causes**:
1. **Config API not running**
   ```bash
   docker ps | grep dev-proxy-config-api
   ```

2. **No OpenAI API key** (for Q&A features)
   ```bash
   # Check .env has OPENAI_API_KEY
   # Pattern-based healing works without it
   ```

3. **Network error**
   ```bash
   curl http://localhost:3001/api/ai/health
   ```

### Tunnel URL Changes

**Symptoms**: ngrok URL different after restart

**Cause**: Using dynamic domain (free tier)

**Fix**: Use static domain (paid ngrok plan)
```bash
# .env
NGROK_STATIC_DOMAIN=your-subdomain.ngrok.app
```

### Enhanced Status Dashboard Issues

#### Route Grouping Problems

**Problem**: Routes not appearing in expected upstream groups or missing from status dashboard.

**Routes appear ungrouped or in wrong groups**:
```bash
# Check actual upstream values in your config
grep -r "proxy_pass" apps/*.conf

# Ensure consistent upstream naming
# ❌ Wrong: Mixed upstream formats
# apps/myapp.conf: proxy_pass http://myapp-service:3000/;
# apps/myapp2.conf: proxy_pass http://myapp-service:3000;

# ✅ Correct: Consistent upstream format  
# Both configs should use identical upstream strings

# Tip: If you use nginx variables for upstreams, grouping uses the variable name
# as the base key (e.g., `$myapp_upstream`). Ensure related routes reference the same variable.
```

**Routes missing from status entirely**:
- **Check config syntax**: Invalid nginx configs are ignored
- **Verify file names**: Only `*.conf` files in `apps/` are scanned
- **Run manual scan**: `node test/scanApps.js` to see parsing errors

#### Open Button URL Problems  

**Problem**: "Open" buttons not using correct ngrok URLs or opening wrong pages.

**Solutions**:
```bash
# 1. Check ngrok URL detection
curl http://localhost:8080/status.json | jq '.ngrok'

# 2. Verify route paths match expectations
# Open button constructs: ngrok_url + route_path
# For route "/api/", URL becomes "https://xyz.ngrok.app/api/"

# 3. Check for trailing slash consistency
# Your app should handle both /api and /api/ correctly
```

#### Route Promotion Issues

**Problem**: Cannot promote routes or promotion state not persisting.

**Debugging Steps**:
```bash
# Check localStorage persistence
# In browser console on /status page:
localStorage.getItem('routePromotions')

# Should show: {"http://upstream:port":"/promoted/route"}

# Clear corrupted promotion data if needed:
localStorage.removeItem('routePromotions')
```

### Emergency Recovery

If the proxy is completely broken:

```bash
# 1. Check what went wrong
docker-compose ps
docker-compose logs proxy

# 2. Restore default configuration (if corrupted)
git checkout HEAD -- config/default.conf

# 3. Restart proxy
docker-compose restart proxy

# 4. Verify basic health
curl http://localhost:8080/health.json
```

### Project Integration Checklist

When adding a new app to the dev tunnel proxy:

- [ ] **Verify container name**: Check actual running container name vs nginx config
- [ ] **Use variable resolution**: Never hardcode upstream hosts
- [ ] **Include essential headers**: Host, forwarding, WebSocket support  
- [ ] **Join devproxy network**: Ensure container is connected to shared network
- [ ] **Handle trailing slashes**: Especially for Next.js apps with basePath
- [ ] **Test both endpoints**: Verify both localhost:8080 and ngrok URL work
- [ ] **Check HMR/WebSocket**: Ensure development features work through proxy

### When to Contact Dev Tunnel Proxy Maintainer

Contact the proxy maintainer if you encounter:
- Core health endpoints (`/health.json`, `/status`) returning 404
- `default.conf` missing essential proxy infrastructure
- Docker network `devproxy` not existing or misconfigured
- `hardenUpstreams.js` utility causing configuration corruption

These indicate proxy infrastructure problems, not app configuration issues.

---

## Advanced Integration

This section covers detailed integration patterns, framework-specific configurations, and best practices.

### Planning Your Routes

**Before creating your nginx config**, check existing routes using the status interface:

1. **Visit `/status`** on the running proxy to see current routes organized by upstream
2. **Review route groups**: Routes are automatically grouped by base upstream URL
3. **Choose unique prefixes**: Use app-specific routes (e.g., `/myapp/api/` vs `/api/`)
4. **Follow team conventions**: Establish consistent naming patterns

**Enhanced Status Interface Features**:
- **Route Grouping**: See how routes are organized by upstream service
- **Promotion System**: Designate parent routes within each upstream group
- **Live Reload**: Refresh configurations without leaving the interface
- **Per-Config Views**: Filter routes by specific config files

Common conflict patterns to avoid:
```nginx
# ❌ Likely to conflict with other apps
location /api/ { ... }
location /admin/ { ... }  
location /health/ { ... }

# ✅ App-specific routes (recommended)
location /myapp/api/ { ... }
location /myapp/admin/ { ... }
location /myapp/ { ... }
```

### Framework-Specific Configuration

#### React/Create React App

**Environment Variables:**
```bash
# .env
PUBLIC_URL=/myapp
REACT_APP_API_URL=/myapp/api
```

**Code Configuration:**
```javascript
// ❌ Wrong: Hardcoded absolute URLs
const API_BASE = 'http://localhost:8000';

// ✅ Correct: Environment-aware configuration
const API_BASE = process.env.REACT_APP_API_URL || '/api';

// ✅ Alternative: Always use relative paths
const API_BASE = '/api';
```

**API Calls:**
```javascript
// Use relative paths for API calls
const response = await fetch('/myapp/api/data'); // ✅ Works through proxy
const badResponse = await fetch('http://localhost:3000/api/data'); // ❌ Fails
```

#### Next.js with basePath

**Nginx Configuration:**
```nginx
# Handle both /myapp and /myapp/ variants
location ~ ^/myapp/?$ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Prefix /myapp;
  
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $nextjs_upstream nextjs-service:3000;
  proxy_pass http://$nextjs_upstream/myapp;
}

# Handle Next.js HMR and assets
location /myapp/_next/ {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $nextjs_upstream nextjs-service:3000;
  proxy_pass http://$nextjs_upstream/myapp/_next/;
}
```

**Next.js Config:**
```javascript
// next.config.js
module.exports = {
  basePath: process.env.BEHIND_PROXY ? '/myapp' : '',
  assetPrefix: process.env.BEHIND_PROXY ? '/myapp' : '',
};
```

#### Storybook + Vite

**For subpath deployment** (e.g., `/storybook`):

```javascript
// .storybook/main.js
module.exports = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  
  viteFinal: async (config) => {
    // Configure for subpath deployment
    if (process.env.STORYBOOK_BASE_PATH) {
      config.base = process.env.STORYBOOK_BASE_PATH;
    }
    
    // Handle WebSocket connections through proxy
    if (process.env.PROXY_MODE) {
      config.server = config.server || {};
      config.server.hmr = {
        port: 443,
        clientPort: 443
      };
    }
    
    return config;
  },
};
```

### Testing Your Integration

#### API-Based Verification

```bash
# List installed app files (sorted by mtime)
curl -s http://localhost:3001/api/apps/list | jq

# Show final active locations (order + source)
curl -s http://localhost:3001/api/apps/active | jq

# View bundle diagnostics (included vs skipped + reasons)
curl -s http://localhost:3001/api/apps/diagnostics | jq

# Force regenerate + nginx reload
curl -s -X POST http://localhost:3001/api/apps/regenerate \
  -H 'content-type: application/json' -d '{"reload":true}' | jq

# Rescan routes and refresh routes.json
curl -s -X POST http://localhost:3001/api/apps/scan \
  -H 'content-type: application/json' \
  -d '{"base":"http://dev-proxy"}' | jq
```

#### Quick Smoke Checks

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/myapp/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/myapp/api/health
```

---

## Quick Reference

### Essential Commands

```bash
# Start proxy
./smart-build.sh up

# Stop proxy
./smart-build.sh down

# Reload configuration
./smart-build.sh reload

# View logs
./smart-build.sh logs [service]

# Check status
./smart-build.sh status

# Reindex Calliope's knowledge
./smart-build.sh reindex
```

### Key URLs

```
Status Dashboard:    http://localhost:8080/status
Health Check:        http://localhost:8080/health.json
Routes:              http://localhost:8080/routes.json
API Base:            http://localhost:3001/api/
ngrok Admin:         http://localhost:4040
```

### File Locations

```
App configs:         apps/*.conf
Proxy overrides:     overrides/*.conf
Generated bundle:    build/sites-enabled/apps.generated.conf
Health reports:      .artifacts/reports/
Calliope data:       .artifacts/calliope/
Test artifacts:      .artifacts/ui/
```

### Getting Help

1. **Check Status Dashboard** - Visual health indicators
2. **Ask Calliope** - AI assistant in the dashboard
3. **Read Documentation**:
   - [CONFIGURATION.md](./CONFIGURATION.md) - Advanced configuration
   - [CALLIOPE_ASSISTANT.md](./CALLIOPE_ASSISTANT.md) - AI assistant capabilities
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
   - [API.md](./API.md) - Complete API reference
   - [TESTING_SECURITY_AND_QUALITY.md](./TESTING_SECURITY_AND_QUALITY.md) - Testing & security
4. **Check Logs** - `./smart-build.sh logs`
5. **Ask Community** - GitHub Discussions

---

## What's New in v1.1 (January 2026)

### UI/UX Improvements

#### Enhanced Status Dashboard
- **Route Conflicts Card** completely redesigned with:
  - Professional icon badge and header
  - "Help Me" button with Calliope's heart stethoscope icon
  - "Dismiss" button (renamed from "Acknowledge")
  - Detailed conflict descriptions and actionable suggestions
  - Direct Calliope integration with pre-populated prompts

- **Consistent Card Design**:
  - All major cards now have icon badges, titles, and subtitles
  - Status Overview: Blue activity badge
  - Settings: Orange settings badge  
  - Configured Apps: Green boxes badge
  - Route Conflicts: Orange alert triangle badge

- **Icon-Based Navigation**:
  - Reload button: Refresh icon (animated on click)
  - View toggle: Grid/List icons that change based on state
  - Theme toggle: Moon/Sun icons that change based on theme
  - All icons using Lucide icon library

#### Custom Dialog System
Replaced all native browser dialogs (`alert`, `confirm`, `prompt`) with custom-designed components:

- **Modal Dialogs** (`.modal`):
  - White/light gray backgrounds matching app style
  - Smooth fade-in animations
  - Keyboard shortcuts (Escape to close, Enter to confirm)
  - Backdrop click to close
  - Proper focus management

- **Toast Notifications** (`.toast`):
  - Non-blocking messages that appear at top of screen
  - Auto-dismiss after 3 seconds (configurable)
  - Color-coded by type (success=green, error=red, warn=yellow, info=blue)
  - Slide-in/fade-out animations
  - Multiple toasts stack vertically

- **Custom Prompts**:
  - Styled input dialogs for route renaming and other text input
  - Consistent with modal dialog design
  - Pre-filled default values
  - Validation support

#### Calliope Drawer Enhancements
- **Completely Hidden When Collapsed**:
  - No visible edges or shadows on right side
  - Uses `translateX(calc(100% + 50px))` to push completely off-screen
  - `visibility: hidden` with proper transition timing

- **Responsive Positioning**:
  - Top-aligned with Status Overview card at `calc(var(--headerH) + 16px)`
  - Bottom gap matches top gap (16px each side)
  - Height: `calc(100vh - var(--headerH) - 32px)` for perfect viewport fit
  - Always fits within viewport, no scrolling issues

- **Smooth Transitions**:
  - Visibility transition delayed on close (0.18s) to complete slide animation first
  - Immediate visibility on open for instant appearance
  - No flickering or visual artifacts

#### Create Route Tool
New **Route Creator** accessible from:
- "Create Route" link in main header
- Plus icon in Configured Apps card header
- Direct deep-link: `/dashboard/#create-route`

Features:
- **Modal-based UI** - Doesn't leave the page, seamless workflow
- **Framework Presets** - One-click configs for:
  - Next.js (with basePath)
  - Vite (with base)
  - Rails (subpath mounted)
  - Django (SCRIPT_NAME)
  - Express/Node (manual prefix handling)

- **Auto-generation** with safety rails:
  - Base path normalization (ensures `/myapp/` format)
  - Upstream URL validation
  - Reserved path checking
  - Trailing slash redirect generation
  - WebSocket header injection
  - X-Forwarded-Prefix header for frameworks that need it

- **Instant Install or Download**:
  - Check "Install to proxy" for immediate deployment
  - Or download `.conf` file for manual installation
  - Preview generated config before installation

### Backend Improvements

#### Configuration API Enhancements
- **New Endpoint**: `POST /api/apps/create-route`
  - Generates optimal nginx configuration
  - Validates inputs against reserved paths
  - Supports optional immediate installation
  - Returns downloadable config content

- **Enhanced Route Conflict Detection**:
  - More detailed conflict reporting
  - Better grouping of conflicting routes
  - Suggestions for resolution

- **Calliope Authentication**:
  - Added `/api/ai/ask`, `/api/ai/cancel`, `/api/ai/chat-history` to public endpoints
  - Proper error handling for authentication failures
  - Consistent API responses

#### macOS Notifications Bridge
- **Fixed Installation Script**:
  - Corrected unbound variable error (`${LABEL}` → `${ENGINE_LABEL}`)
  - Proper service load order (bridge before engine)
  - Added 1-second delay between loads for initialization

- **Improved Connection Stability**:
  - Uses `localhost` or `127.0.0.1` based on hostname detection
  - Better error handling for bridge unavailability

### Documentation Updates
- Complete rewrite of Route Conflicts section
- Added Create Route Tool documentation
- Documented custom dialog/toast system
- Added Calliope drawer positioning details
- Updated all screenshots and examples

---

## Tips and Tricks

### Tip 1: Use Meaningful Route Names

```nginx
# ❌ Generic
location /app1/ { ... }

# ✅ Descriptive
location /myapp-dashboard/ { ... }
```

### Tip 2: Test Locally First

```bash
# Before sharing via tunnel, test locally
curl http://localhost:8080/myapp/

# Then share tunnel URL
```

### Tip 3: Monitor Health Dashboard

Keep status dashboard open in a browser tab to catch issues early.

### Tip 4: Use Calliope Proactively

Don't wait for things to break—ask Calliope to check routes periodically:
```
"Can you do a health check on all routes?"
```

### Tip 5: Keep Configs Organized

```
apps/
  frontend.conf      # React app
  api.conf           # Backend API
  admin.conf         # Admin dashboard
  storybook.conf     # Component library
```

### Tip 6: Version Control Your Configs

```bash
# Create a separate repo for your configs
git init app-proxy-configs
cp apps/*.conf app-proxy-configs/
cd app-proxy-configs && git commit -m "Current proxy config"
```

---

## Glossary

**Bundle**: Combined nginx configuration from all app configs  
**Calliope**: AI assistant for proxy monitoring and healing  
**Config API**: REST API for managing configurations  
**devproxy**: Docker network name for container communication  
**Healing**: Automatic fixing of routing issues  
**Location Block**: nginx configuration for a specific route  
**ngrok**: Service for creating secure tunnels  
**Override**: Proxy-controlled config that takes precedence over app configs  
**Pattern**: Known issue + automated fix in Calliope's knowledge base  
**Probe**: HTTP request to check route health  
**RAG**: Retrieval-Augmented Generation (Calliope's documentation search)  
**Resolver**: nginx DNS configuration for Docker services  
**Route**: URL path that maps to a service  
**Upstream**: Backend service that handles requests  

---

**Welcome to Dev Tunnel Proxy!** 🎉

You're ready to start proxying. If you get stuck, remember:
- Calliope is always ready to help
- The docs are comprehensive
- The community is friendly

Happy coding! 💖
