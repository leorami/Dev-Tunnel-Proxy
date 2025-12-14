# Dev Tunnel Proxy User Guide

**Last Updated**: December 2025  
**Version**: 1.0

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
10. [Next Steps](#next-steps)

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
2. It provides visitors with system information and documentation links
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

**See [CONFIG-MANAGEMENT-GUIDE.md](./CONFIG-MANAGEMENT-GUIDE.md#reserved-paths---root-path-restriction) for complete details.**

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

## Advanced Integration Guide

This section covers detailed integration patterns, framework-specific configurations, and best practices for connecting your apps to the proxy.

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

**Conflict Detection**: When conflicts occur, they're automatically detected and highlighted in the status interface with one-click resolution options.

### Configuration Best Practices

**Critical: Use Variables for Upstream Resolution**

Always use nginx variables for upstream resolution to ensure reliable startup:

```nginx
# ❌ Wrong: Hardcoded upstream (fails if service is down at startup)
location /myapp/ {
  proxy_pass http://myapp:3000/;
}

# ✅ Correct: Variable resolution (defers DNS lookup to runtime)
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  proxy_pass http://$myapp_upstream/;
}
```

**Why?** Nginx performs DNS resolution at startup for hardcoded upstreams. If the service isn't running, nginx fails to start. Variables defer DNS lookups until runtime, allowing graceful handling of unavailable services.

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

**Environment Variables:**
```bash
BEHIND_PROXY=true
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

**Environment Variables:**
```bash
STORYBOOK_BASE_PATH=/storybook
PROXY_MODE=true
```

**Root Dev Helpers** (use sparingly):

Some frameworks (Storybook/Vite, certain Next.js dev flows) reference helper paths at the proxy root. These are now allowed globally to unblock development. Strongly recommend designing apps to be proxy-route-agnostic and serving from a non-root prefix; use root helpers only when a framework forces it.

```nginx
# Root helpers for Storybook
location ^~ /sb-manager/       { proxy_pass http://storybook:6006/sb-manager/; }
location ^~ /sb-addons/        { proxy_pass http://storybook:6006/sb-addons/; }
location ^~ /sb-common-assets/ { proxy_pass http://storybook:6006/sb-common-assets/; }
location = /index.json         { proxy_pass http://storybook:6006/index.json; }

# WebSocket for HMR
location ^~ /storybook-server-channel {
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://storybook:6006/storybook-server-channel;
}
```

#### React/Vue SPA

For single-page applications with client-side routing:

```nginx
location /myapp/ {
  # Standard headers
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  
  # Handle client-side routing
  try_files $uri $uri/ @myapp_fallback;
  
  resolver 127.0.0.11 ipv6=off;
  set $spa_upstream spa-service:3000;
  proxy_pass http://$spa_upstream/;
}

location @myapp_fallback {
  set $spa_upstream spa-service:3000;
  proxy_pass http://$spa_upstream/;
}
```

### Testing Your Integration

#### API-Based Verification

After installing your configuration, use the control-plane APIs to verify:

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

Recommended gates before running your app tests:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/myapp/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/myapp/api/health
```

#### Status Dashboard Verification

**Visit `/status`** to verify visually:

1. **Route Grouping**: Your routes should appear grouped by upstream service
2. **Status Indicators**: Check HTTP status codes and overall health
3. **Open Button**: Test accessing your app via ngrok
4. **Promotion System**: If multiple routes share an upstream, promote a parent route
5. **Live Reload**: Use the reload button to refresh configurations

**Key Checks**:
- ✅ Routes appear in the correct upstream group  
- ✅ Status indicators show green (2xx responses)
- ✅ "Open" button uses ngrok URL correctly
- ✅ No conflict warnings displayed

#### Basic Connectivity Tests

```bash
# Test direct container access
docker exec dev-proxy wget -qO- http://your-service:3000/

# Test through proxy
curl http://localhost:8080/myapp/

# Test through tunnel
curl https://your-ngrok-domain.ngrok.app/myapp/
```

### Common Integration Mistakes

❌ **Don't hardcode upstream hosts**
```nginx
proxy_pass http://myapp:3000/;  # Will fail if container is down
```

✅ **Always use variables**
```nginx
set $myapp_upstream myapp:3000;
proxy_pass http://$myapp_upstream/;
```

❌ **Don't forget the resolver**
```nginx
set $myapp_upstream myapp:3000;  # Won't work without resolver
proxy_pass http://$myapp_upstream/;
```

✅ **Include Docker DNS resolver**
```nginx
resolver 127.0.0.11 ipv6=off;
resolver_timeout 5s;
set $myapp_upstream myapp:3000;
proxy_pass http://$myapp_upstream/;
```

❌ **Don't use absolute paths in assets**
```html
<img src="/images/logo.png">  <!-- Breaks under subpath -->
```

✅ **Use relative paths**
```html
<img src="./images/logo.png">  <!-- Works correctly -->
```

### Configuration Composition

**Understanding the Build Process**:

- The proxy composes `apps/*.conf` with optional `overrides/*.conf` into `build/sites-enabled/apps.generated.conf`
- App precedence within the same route prefers the newest file (mtime) so API re-installs supersede prior app snippets
- Emitted blocks are annotated with `# source: <relative-path>` and diagnostics are written to `.artifacts/bundle-diagnostics.json`
- Nginx includes only generated files. Your `apps/*.conf` remain the source inputs
- To force proxy-owned behavior, place minimal snippets in `overrides/` (no app names required)

**Manual bundle regeneration**:
```bash
node utils/generateAppsBundle.js
```

### Template Files

Save these templates for quick setup:

- **Basic app**: `examples/sample-prefix-app.conf`
- **API with prefix stripping**: `examples/sample-root-api-strip.conf`
- **Next.js with basePath**: `examples/next/myapp.conf`
- **Storybook + Vite**: `examples/storybook-vite.conf`

---

## Using the Status Dashboard

### Overview

The status dashboard (`http://localhost:8080/status`) is your command center.

### Key Features

#### 1. Route Cards

Each route displays:
- **Path** (e.g., `/myapp/`)
- **Health status** (green=ok, yellow=warn, red=error)
- **Status codes** (200, 404, 502, etc.)
- **Source file** (which config defines this route)
- **Actions** (Open, Diagnose, etc.)

#### 2. Filtering

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

Click sun/moon icon in top-right to switch between light and dark modes.

---

## Working with Calliope

### What is Calliope?

Calliope is your AI assistant who:
- **Answers questions** about the proxy and your routes
- **Diagnoses issues** when things aren't working
- **Fixes problems automatically** (with your permission)
- **Learns from each fix** to handle similar issues faster

### Opening Calliope

Click the **Calliope** button in the header or the stethoscope icon (🩺) next to any route.

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

### Issue: Proxy Won't Start

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

### Issue: Route Returns 502 Bad Gateway

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

### Issue: Route Returns 404

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

### Issue: Calliope Doesn't Respond

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

### Issue: Tunnel URL Changes

**Symptoms**: ngrok URL different after restart

**Cause**: Using dynamic domain (free tier)

**Fix**: Use static domain (paid ngrok plan)
```bash
# .env
NGROK_STATIC_DOMAIN=your-subdomain.ngrok.app
```

---

## Next Steps

### Learn More

Once you're comfortable with basics:

1. **[Architecture](ARCHITECTURE.md)** - Understand how it works
2. **[API Endpoints](API-ENDPOINTS.md)** - Programmatic control
3. **[Configuration Guide](CONFIG-MANAGEMENT-GUIDE.md)** - Advanced config patterns
4. **[Calliope Capabilities](CALLIOPE-AI-ASSISTANT.md)** - Full AI features

### Advanced Topics

**Custom nginx patterns**:
- Regex location blocks
- Conditional routing
- Header manipulation
- Caching strategies

**Production-like setup**:
- Multiple environments
- Secrets management
- Authentication
- High availability

**Extending the proxy**:
- Custom healing patterns
- Plugin development
- API integrations

### Join the Community

- **GitHub Discussions** - Ask questions, share tips
- **Issues** - Report bugs, request features
- **Contributions** - Submit PRs, improve docs

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
3. **Read Troubleshooting** - [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
4. **Check Logs** - `./smart-build.sh logs`
5. **Search Docs** - Check docs/ directory
6. **Ask Community** - GitHub Discussions

---

## Tips and Tricks

### Tip 1: Use Meaningful Route Names

```nginx
# ❌ Generic
location /app1/ { ... }

# ✅ Descriptive
location /lyra-impact/ { ... }
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

