<div align="center">
  <img src="./status/assets/logo.svg" alt="Dev Tunnel Proxy" width="200" />
  
  # Dev Tunnel Proxy
  
  A standalone, reusable development proxy + ngrok tunnel for teams with intelligent routing, conflict resolution, and AI-powered self-healing capabilities.
  
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Docker](https://img.shields.io/badge/docker-compose-blue.svg)](docker-compose.yml)
</div>

---

## Table of Contents

- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [🔐 Security & Authentication](#-security--authentication)
- [Configuration Management](#configuration-management)
- [📊 Enhanced Status Dashboard](#-enhanced-status-dashboard)
- [<img src="./status/assets/calliope_heart_stethoscope.svg" width="16" style="vertical-align: middle;" /> Calliope AI Assistant](#-calliope-ai-assistant)
- [🔄 API Endpoints](#-api-endpoints)
- [Development Workflow](#development-workflow)
- [Testing & Validation](#testing--validation)
- [Nginx Configuration Patterns](#nginx-configuration-patterns)
- [Framework-Specific Examples](#framework-specific-examples)
- [Example Configurations](#example-configurations)
- [Repository Organization](#repository-organization)
- [Architecture: Why Separate Containers?](#architecture-why-separate-containers)
- [📚 Documentation](#-documentation)
- [🚀 Quick Reference](#-quick-reference)

---

## Key Features

- **🔧 Smart Configuration Management**: Tiny core Nginx config that composes app routes from `apps/` and `overrides/` directories into a single generated bundle
- **🌐 Secure Tunneling**: Separate ngrok container provides secure public access to your development environment
- **<img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="20" style="vertical-align: middle;" /> AI-Powered Assistant**: Calliope, your caring AI assistant, proactively monitors, diagnoses, and heals routing issues
- **📊 Enhanced Status Dashboard**: Visual route management with grouping, promotion system, and real-time health monitoring
- **🔄 Programmatic API**: RESTful endpoints for configuration management, conflict resolution, and diagnostics
- **🐳 Docker-Native**: All apps join the shared `devproxy` Docker network for seamless connectivity
- **⚡ Hot Reload**: Safe configuration updates without downtime
- **🧪 Automated Testing**: Built-in health checks, route scanning, and UI testing with Playwright

## Recent Updates (December 2025)

### macOS Notifications System
- **Text Notifications**: Route status changes can now send text messages via Messages.app (macOS only)
- **Notifications Bridge**: Local HTTP server for UI integration and service management
- **Background Service**: Install/uninstall notifications engine directly from the UI
- **Deployment-Agnostic**: Checks endpoint availability via HTTP instead of Docker-specific state
- **Smart Architecture**: Engine → Bridge → Messages.app for proper macOS permissions

### Documentation Consolidation
- **New API.md**: Comprehensive API reference consolidating endpoint structure and migration guides
- **Renamed Files**: CALLIOPE.md → CALLIOPE_ASSISTANT.md, OPERATIONS.md → TESTING_SECURITY_AND_QUALITY.md
- **Cleaner Structure**: All docs are now final-version references without "new features" or "recent changes" language
- **Better Navigation**: Updated cross-references across all documentation files

## Quick Start

### 1. Initial Setup

First, configure your environment variables in `.env`:

```bash
# Required: ngrok authentication
NGROK_AUTHTOKEN=YOUR_TOKEN

# Optional: Use a reserved ngrok domain
NGROK_STATIC_DOMAIN=your-domain.ngrok.app

# Optional: OpenAI API key for Calliope AI assistant
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_EMBED_MODEL=text-embedding-3-small

# IMPORTANT: Admin password for proxy dashboard access
# Set this to a secure password (minimum 16 characters)
# If not set, a random 64-character password will be auto-generated
ADMIN_PASSWORD=your-secure-password-here
```

**🔐 Security Note:** The `ADMIN_PASSWORD` protects your proxy's admin pages (`/status`, `/health`, `/reports`) from unauthorized access. This is **critical** when your proxy is exposed via ngrok.

**Options:**
1. **Set it yourself** (recommended): Choose a strong password (16+ characters) and add it to `.env`
2. **Auto-generate**: Leave it blank and the proxy will generate a secure random password on first startup

**To view your auto-generated password:**
- From localhost: Visit `http://localhost:8080/admin/show-password`
- Or check the `ADMIN_PASSWORD` variable in your `.env` file

### 2. One-Time Setup

Run the setup command to install dependencies, generate TLS certificates, and prepare the configuration bundle:

```bash
./smart-build.sh setup
```

This command:
- Installs workspace dependencies (including test/ui and site-auditor-debug)
- Generates self-signed TLS certificates in `.certs/`
- Hardens upstream configurations for resilience
- Pre-generates the nginx configuration bundle

### 3. Start the Proxy

```bash
./smart-build.sh up
```

This starts all services in detached mode:
- **dev-proxy**: Nginx reverse proxy (port 8080)
- **dev-ngrok**: Secure tunnel to external networks
- **dev-proxy-config-api**: Configuration + AI management API (port 3001), plus built-in notifications storage (port 3002) and route health monitoring

### 4. Install App Routes

Use the programmatic API to install your app's nginx configuration.

**Important:** The proxy uses two endpoint namespaces:
- **Authentication:** `/admin/*` (fixed paths)
- **Management API:** `/devproxy/api/*` (configurable via `PROXY_API_BASE_PATH`)

**Recommended approach (discovers API path automatically):**

```javascript
// Step 1: Authenticate
const loginRes = await fetch('http://dev-proxy:8080/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  credentials: 'include'
});

// Step 2: Discover API base path
const config = await fetch('http://dev-proxy:8080/config').then(r => r.json());

// Step 3: Install configuration
await fetch(`http://dev-proxy:8080${config.apiBasePath}/apps/install`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'myapp',
    content: `# My app configuration
location ^~ /myapp/ {
  proxy_http_version 1.1;
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://$myapp_upstream/;
}`
  })
});
```

**Or use the helper script (handles authentication automatically):**

```bash
ADMIN_PASSWORD=your-password node examples/api-upload-config.js myapp path/to/myapp.conf
```

### 5. Connect Your App

In your app's `docker-compose.yml`, join the shared network:

```yaml
networks:
  devproxy:
    external: true
    name: devproxy

services:
  myapp:
    # ... your service configuration
    networks:
      - devproxy
```

### 6. Access Your App

- **Local**: `http://localhost:8080/myapp/`
- **Tunnel**: Get the ngrok URL from container logs:
  ```bash
  ./smart-build.sh logs ngrok
  ```
- **Status Dashboard**: Visit `http://localhost:8080/status` to see all routes and their health (requires login)

---

## 🔐 Security & Authentication

### Admin Password Protection

All admin pages (`/status`, `/health`, `/reports`) and management API endpoints are **password-protected** to prevent unauthorized access when your proxy is exposed via ngrok.

### Endpoint Structure

The proxy uses **two separate endpoint namespaces**:

#### 1. Authentication Endpoints (Fixed Paths)
These are NOT affected by `PROXY_API_BASE_PATH`:
- `POST /admin/login` - Authenticate and get session cookie
- `POST /admin/logout` - Destroy session
- `GET /admin/show-password` - View auto-generated password (localhost only)
- `GET /config` - Discover API base path (public)

#### 2. Management API (Configurable Namespace)
Controlled by `PROXY_API_BASE_PATH` environment variable:

```bash
# In .env - customize the API namespace
# Default: /devproxy/api (if not set)
PROXY_API_BASE_PATH=/devproxy/api
```

**Default Behavior:** If you don't set `PROXY_API_BASE_PATH`, it automatically defaults to `/devproxy/api` to avoid conflicts with your app's `/api/` routes.

**All management API endpoints** use this prefix:
- `POST /devproxy/api/apps/install` - Install app config
- `GET /devproxy/api/ai/health` - Check Calliope status
- `POST /devproxy/api/overrides/promote` - Promote to override
- ...and more (see `docs/ENDPOINT-STRUCTURE.md`)

**Why two namespaces?**
- **Authentication** is infrastructure (used by nginx `auth_request`)
- **Management API** prevents conflicts with your app's APIs

**To use legacy `/api/` path** (not recommended due to conflicts):
```bash
PROXY_API_BASE_PATH=/api
```

**Note:** If you change this, you must also update `config/default.conf` location blocks to match. See `docs/API-MIGRATION-V1.md` and `docs/ENDPOINT-STRUCTURE.md` for details.

### Setup Options

#### Option 1: Set Your Own Password (Recommended)

Add to your `.env` file:

```bash
ADMIN_PASSWORD=your-secure-password-here
```

**Requirements:**
- Minimum 16 characters
- Use a strong, unique password
- Never commit `.env` to version control (it's gitignored)

#### Option 2: Auto-Generate Password

If you don't set `ADMIN_PASSWORD`, the proxy will automatically generate a secure 64-character random password on first startup.

**To view your auto-generated password:**

```bash
# From localhost only (security restriction)
curl http://localhost:8080/admin/show-password

# Or visit in your browser
open http://localhost:8080/admin/show-password

# Or check your .env file
grep ADMIN_PASSWORD .env
```

### Logging In

1. Visit any admin page (e.g., `http://localhost:8080/status` or `https://your-domain.ngrok.app/status`)
2. You'll be redirected to the login page
3. Enter your admin password
4. Session lasts 7 days

### Changing Your Password

1. Edit the `ADMIN_PASSWORD` in your `.env` file
2. Restart the proxy:
   ```bash
   ./smart-build.sh restart
   ```

### Security Features

- ✅ **Auto-generated passwords**: Prevents default password attacks
- ✅ **Session-based auth**: 7-day sessions with HttpOnly cookies
- ✅ **Localhost-only password display**: `/admin/show-password` only accessible from localhost
- ✅ **Constant-time comparison**: Prevents timing attacks
- ✅ **Rate limiting**: 1-second delay on failed login attempts
- ✅ **No default passwords**: Each installation has a unique password

### Public Access Considerations

When using ngrok, your proxy is **publicly accessible**. The admin password ensures:
- Unauthorized users cannot view your routes
- Attackers cannot modify your proxy configuration
- Your development environment remains secure

**Best Practices:**
- Use a strong password (or let the system generate one)
- Never share your password or ngrok URL publicly
- Regularly rotate your password
- Monitor access logs for suspicious activity

---

## Configuration Management

### How It Works

The proxy uses a **composition-based approach** to manage nginx configurations:

1. **Apps Directory** (`apps/*.conf`): Each app contributes its own nginx configuration snippet (gitignored, local-only)
2. **Overrides Directory** (`overrides/*.conf`): Proxy-owned configurations that always take precedence (gitignored)
3. **Generated Bundle** (`build/sites-enabled/apps.generated.conf`): Single composed file that nginx actually loads

### Precedence Rules

- **Overrides win**: If both an app and override define the same location, the override is used
- **Newest app wins**: Among apps, the most recently modified file takes precedence for conflicting routes
- **Exact + prefix coexist**: `location = /myapp/` and `location ^~ /myapp/` can both exist

### ⚠️ Reserved Path Restriction

**Apps are FORBIDDEN from defining the root path (`location = /`).**

The root path is **exclusively reserved** for the Dev Tunnel Proxy landing page. Any app configuration attempting to define `location = /` will be automatically blocked with a warning.

**Why?** The root path serves as the proxy's professional landing page, providing system information, navigation to documentation, and links to GitHub.

**What to use instead:** Apps must use their own namespaced paths:
- ✅ `location ^~ /myapp/` - Correct
- ✅ `location ^~ /api/` - Correct  
- ❌ `location = /` - **FORBIDDEN**, automatically blocked

See [CONFIG-MANAGEMENT-GUIDE.md](docs/CONFIG-MANAGEMENT-GUIDE.md#reserved-paths---root-path-restriction) for complete details on reserved paths.

### Key Benefits

- ✅ **No monolithic config**: Each app manages its own snippet independently
- ✅ **Conflict resolution**: Automatic detection and resolution of route conflicts
- ✅ **Proxy-owned fixes**: Overrides ensure critical routes can't be accidentally changed
- ✅ **Provenance tracking**: Generated file includes `# source:` comments for debugging
- ✅ **Diagnostics**: `.artifacts/bundle-diagnostics.json` shows included/skipped routes with reasons

### Workflow

```bash
# View diagnostics
curl -s http://localhost:3001/api/apps/diagnostics | jq

# List active locations
curl -s http://localhost:3001/api/apps/active | jq

# Force regenerate bundle
curl -s -X POST http://localhost:3001/api/apps/regenerate \
  -H 'content-type: application/json' -d '{"reload":true}' | jq
```

See **[Configuration Management Guide](docs/CONFIG-MANAGEMENT-GUIDE.md)** for complete details.

## 📊 Enhanced Status Dashboard

Visit `/status` for a comprehensive view of your proxy's health and routes.

### Key Features

#### 🎯 **Smart Route Organization**
- **Automatic Grouping**: Routes grouped by base upstream URL for clarity
- **Promotion System**: Designate parent routes within each upstream group
- **Collapsible Cards**: Minimize individual route cards to compact headers
- **Sticky Controls**: Summary and header remain visible while scrolling
- **Visual Hierarchy**: Parent-child relationships clearly displayed

#### 🔍 **Advanced Filtering**
- Search by route path (e.g., `/myapp/`)
- Filter by severity: `ok`, `warn`, `err`
- Filter by status codes: `200`, `404`, `502`
- Target-qualified filters: `ngrok:200`, `localhost:404`

#### <img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="20" style="vertical-align: middle;" /> **Calliope AI Integration**
- Click <img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;"> stethoscope icons for AI-powered diagnostics
- Watch real-time thinking animations and step-by-step healing
- Automatic detection and fixing of common issues
- Pattern learning for faster resolution of similar problems

#### ⚡ **Live Actions**
- **Open Button**: Access routes directly via ngrok tunnel
- **Diagnose**: Get detailed route information and troubleshooting
- **Live Reload**: Refresh configurations without leaving the browser
- **Per-Config Views**: Filter and export route data by config file
- **Rescan**: Trigger immediate route health check

#### 🎨 **UI Enhancements**
- **Theme Toggle**: Switch between light and dark modes
- **Responsive Design**: Optimized for desktop and mobile
- **Status Indicators**: Color-coded health status (green/yellow/red)
- **Shared Header**: Consistent navigation across all dashboard pages

## <img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="32" style="vertical-align: middle;" /> Calliope AI Assistant

**Calliope** is your proxy's caring, youthful AI assistant who proactively monitors, diagnoses, and heals routing issues. She's not just an advisor—she actually fixes problems herself.

### Core Capabilities

#### 💪 **Proactive Self-Healing**
- **Takes immediate action** when issues are detected
- **Runs her own diagnostics** using container access and network tools
- **Applies fixes automatically** with verification and testing
- **Learns from each healing** to handle similar issues faster

#### 🔬 **Advanced Diagnostics**
- Container health monitoring
- Network connectivity testing
- Configuration validation
- Log analysis and pattern recognition
- Real-time route probing

#### 🛠️ **Healing Strategies**

**React & Frontend Issues:**
- Static asset routing fixes (404s for images, CSS, JS)
- Bundle.js content-type corrections
- Subpath asset handling for React apps

**Nginx Configuration:**
- Variable-based proxy_pass fixes
- Duplicate location block removal
- Resolver configuration
- Upstream failover and timeout handling

**Infrastructure:**
- Proxy discovery and ngrok URL updates
- Symlink reconstruction
- Container health checks and restarts

#### 🧠 **Pattern Learning**
- Saves successful fixes to knowledge base
- Automatic application of known patterns
- Continuous improvement through feedback loop

### How to Use

#### Via Status Interface
1. Click the <img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;"> stethoscope icon next to any route
2. Watch her thinking animation as she investigates
3. See step-by-step healing process in real-time
4. Get caring, personal explanations of fixes

#### Via Chat Interface
- Ask questions: "Why is my logo not loading?"
- Request healing: "Can you fix the /impact route?"
- Get help: "What does this 404 mean?"

#### Via API
```bash
# Health check
GET /api/ai/health

# Ask a question
POST /api/ai/ask
{"query": "Why is /myapp returning 502?"}

# Self-check with healing
POST /api/ai/self-check
{"heal": true, "route": "/myapp/"}

# Advanced healing
POST /api/ai/advanced-heal
{"route": "/api/", "hint": "nginx test failed"}

# Site audit
POST /api/ai/audit
{"url": "http://dev-proxy/myapp"}

# Audit and heal iteratively
POST /api/ai/audit-and-heal
{"url": "http://dev-proxy/myapp", "maxPasses": 3}
```

### 📚 **Knowledge Base & RAG System**
- **Documentation Embeddings**: Calliope has access to all internal documentation via semantic search
- **Automatic Reindexing**: Smart-build detects doc changes and rebuilds knowledge base automatically
- **Comprehensive Coverage**: ~97k characters across 10 docs (README, troubleshooting, API guides, etc.)
- **Natural Queries**: Ask about features, configuration, roadmap - she searches embedded docs for answers

#### RAG Features
```bash
# Reindex knowledge base manually
./smart-build.sh reindex

# Auto-reindex happens on: up, restart, reload, apply
./smart-build.sh reload  # Checks for doc changes, reindexes if needed

# Check index status
curl http://localhost:3001/api/ai/stats
```

### OpenAI Integration

Configure OpenAI in `.env` for AI-powered healing and Q&A:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
```

### Learn More

- **[Calliope Complete Guide](docs/CALLIOPE.md)** - Full capabilities, personality, RAG system, and technical details

## 🔄 API Endpoints

The proxy provides comprehensive RESTful APIs for configuration management, diagnostics, and AI assistance.

### Configuration Management

#### Install App Configuration
```bash
POST /api/apps/install
{
  "name": "myapp",
  "content": "# nginx configuration..."
}
```

Automatically:
- Saves configuration to `apps/` directory
- Hardens upstreams for resilience
- Regenerates nginx bundle
- Tests and reloads nginx

#### Configuration Operations
```bash
# List all app configs
GET /api/apps/list

# View active locations
GET /api/apps/active

# Get bundle diagnostics
GET /api/apps/diagnostics

# Force regenerate bundle
POST /api/apps/regenerate
{"reload": true}

# Scan routes and update status
POST /api/apps/scan
{"base": "http://dev-proxy"}

# Cleanup old artifacts
POST /api/apps/cleanup
```

#### Config File Management
```bash
# View config file
GET /api/config/:filename

# Update config file
POST /api/config/:filename
{"content": "# nginx configuration..."}
```

### Conflict Resolution

```bash
# Resolve route conflict
POST /api/resolve-conflict
{"route": "/api/", "winner": "myapp.conf"}

# Rename route in config
POST /api/rename-route
{
  "oldRoute": "/api/",
  "newRoute": "/myapp-api/",
  "configFile": "myapp.conf"
}

# Promote app config to override
POST /api/overrides/promote
{"filename": "myapp.conf"}

# List override conflicts
GET /api/overrides/conflicts
```

### <img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="20" style="vertical-align: middle;" /> AI Assistant APIs

```bash
# Calliope health check
GET /api/ai/health

# Ask Calliope a question
POST /api/ai/ask
{"query": "Why is /myapp returning 502?"}

# Self-check with optional healing
POST /api/ai/self-check
{"heal": true, "route": "/myapp/"}

# Advanced healing
POST /api/ai/advanced-heal
{"route": "/api/", "hint": "nginx test failed"}

# Site audit
POST /api/ai/audit
{"url": "http://dev-proxy/myapp", "wait": 2000}

# Audit and heal iteratively
POST /api/ai/audit-and-heal
{"url": "http://dev-proxy/myapp", "maxPasses": 3}

# Get thinking events (SSE-like polling)
GET /api/ai/thinking

# Cancel current operation
POST /api/ai/cancel

# Get current activity
GET /api/ai/activity
```

### Reports Management

```bash
# List all reports
GET /api/reports/list

# Prune old reports
POST /api/reports/prune
{"keep": 10}
```

### Status & Health

```bash
# Human-readable dashboards
GET /status          # Enhanced status dashboard
GET /health          # Health dashboard
GET /reports         # Reports browser

# JSON endpoints
GET /status.json     # Latest health report
GET /health.json     # Basic health check
GET /routes.json     # Latest route scan
GET /ngrok.json      # Ngrok tunnel info
```

See **[API Endpoints Documentation](docs/API-ENDPOINTS.md)** for complete details and examples.

## Development Workflow

### Smart Build Commands

The `smart-build.sh` script provides convenient commands for managing the proxy:

```bash
# Initial setup (one-time)
./smart-build.sh setup

# Start all services
./smart-build.sh up

# Stop all services
./smart-build.sh down

# Restart (down + up with fresh bundle)
./smart-build.sh restart

# View logs
./smart-build.sh logs              # All services
./smart-build.sh logs proxy        # Just proxy
./smart-build.sh logs ngrok        # Just ngrok

# Reload nginx configuration
./smart-build.sh reload

# Rebuild Calliope's knowledge base
./smart-build.sh reindex

# App management (legacy - prefer API)
./smart-build.sh install-app NAME path/to/config.conf
./smart-build.sh uninstall-app NAME
./smart-build.sh list-apps

# Check service status
./smart-build.sh status

# Run tests
./smart-build.sh test:all
```

### Local vs Tunnel Strategy

**Local Development:**
- Run apps at `/` (no basePath) for ergonomics
- Direct access without proxy overhead

**Tunnel Access:**
- Enable prefix (e.g., `/myapp`) when going through proxy
- For Next.js, gate `basePath`/`assetPrefix` behind env var:
  ```javascript
  const basePath = process.env.BEHIND_PROXY ? '/myapp' : '';
  ```

### Helper Scripts

- **`scripts/reload.sh`**: Safe nginx reload with bundle regeneration
- **`scripts/nginx-entrypoint.sh`**: Nginx container initialization
- **`scripts/ngrok-entrypoint.sh`**: Conditional static/dynamic domain setup
- **`scripts/test_storybook_proxy.sh`**: Storybook+Vite proxy regression tests
- **`scripts/validate-all-js.sh`**: Validate JavaScript syntax across project

## Testing & Validation

### Automated Health Monitoring

Route health is continuously monitored by a lightweight worker that runs inside `dev-proxy-config-api` (enabled by default):

```bash
# Manual scan
node ./test/scanApps.js

# Deep health check for specific page
node ./test/run.js

# Check status endpoints
curl http://localhost:8080/status.json
curl http://localhost:8080/health.json
```

### UI Testing with Playwright

Run comprehensive UI tests with screenshot capture:

```bash
# From workspace root
npm run ui:test

# Or via Docker
docker run --rm --network devproxy \
  -e UI_BASE_URL=http://dev-proxy \
  -v "$PWD":/work -w /work/test/ui \
  mcr.microsoft.com/playwright:v1.46.0-jammy \
  bash -lc 'npm install && npx playwright install --with-deps && npm test'
```

Artifacts: `.artifacts/ui/` (screenshots, traces, videos on failure)

### Site Auditor

The included `site-auditor-debug` tool provides comprehensive page auditing:

```bash
cd site-auditor-debug
pnpm install
pnpm run build

# Single page audit
node dist/cli.js https://your-ngrok-url.ngrok.app/myapp

# Crawl mode
node dist/cli.js --crawl \
  --start-urls https://your-ngrok-url.ngrok.app \
  --max-pages 25 --concurrency 3

# With custom viewports and style capture
node dist/cli.js https://your-ngrok-url.ngrok.app/myapp \
  --viewports "375x812@mobile,1440x900@desktop" \
  --styles-mode tags --tags img,button
```

Features:
- Multi-viewport screenshots
- Console error capture
- Network failure detection
- Computed styles export
- Crawling with sitemap support

### What Tests Check

- **Asset Availability**: 2xx responses, non-empty, correct content-type
- **API Discovery**: Both bare `/api/*` and prefixed `/myapp/api/*`
- **WebSocket Support**: HMR paths and upgrade headers
- **Ownership Conflicts**: Route collision detection
- **UI Functionality**: Status dashboard, Calliope integration, theme toggle

## Nginx Configuration Patterns

### Critical: Variable-Based Upstream Resolution

**Always use nginx variables** for upstream resolution to ensure reliable startup:

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

**Note:** The bundle generator normalizes variable-based upstreams and preserves URI paths in `proxy_pass`, so prefix proxies and file targets work correctly while benefiting from runtime DNS.

### Essential Proxy Headers

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
  proxy_buffering off;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
}
```

### Trailing Slash Behavior

**Critical:** Trailing slash in `proxy_pass` affects path handling:

```nginx
# Strips prefix: /myapp/api/data → /api/data
location /myapp/ {
  proxy_pass http://$upstream:3000/;  # Trailing slash strips /myapp/
}

# Preserves prefix: /myapp/api/data → /myapp/api/data
location /myapp/ {
  proxy_pass http://$upstream:3000;   # No trailing slash preserves /myapp/
}
```

**When to use each:**
- **Strip prefix**: API backends that don't expect the route prefix
- **Preserve prefix**: Apps configured with `basePath`/`PUBLIC_URL` (React, Next.js)

### Root Dev Helpers

Some frameworks (Storybook/Vite, Next.js dev mode) require helper paths at the proxy root. These are now globally allowed to unblock development:

- `/@vite/`, `/@id/`, `/@fs/` - Vite dev server helpers
- `/node_modules/` - Direct module access
- `/sb-manager/`, `/sb-addons/`, `/sb-common-assets/` - Storybook assets

**Recommendation:** Design apps to be proxy-route-agnostic and serve from non-root prefixes when possible. Use root helpers only when frameworks require them.

## Framework-Specific Examples

### React/Create React App

```nginx
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-service:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://$myapp_upstream/;
}
```

App configuration:
```bash
# .env
PUBLIC_URL=/myapp
REACT_APP_API_URL=/myapp/api
```

### Next.js with basePath

See `examples/next/` for complete setup. Key pattern:

```nginx
# Handle both /myapp and /myapp/
location ~ ^/myapp/?$ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $nextjs_upstream nextjs-service:3000;
  proxy_set_header X-Forwarded-Prefix /myapp;
  proxy_pass http://$nextjs_upstream/myapp;
}

# Handle _next assets
location /myapp/_next/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $nextjs_upstream nextjs-service:3000;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_pass http://$nextjs_upstream/myapp/_next/;
}
```

Next.js config:
```javascript
module.exports = {
  basePath: process.env.BEHIND_PROXY ? '/myapp' : '',
  assetPrefix: process.env.BEHIND_PROXY ? '/myapp' : '',
};
```

### Storybook + Vite

When running Storybook with Vite builder under a subpath (e.g., `/storybook`), configure explicit routes for dev helpers and HMR.

**Nginx configuration:**

```nginx
# Exact base and critical roots
location = /storybook/ {
  proxy_http_version 1.1;
  proxy_set_header Host storybook-service:6006;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Prefix /storybook;
  resolver 127.0.0.11 ipv6=off; resolver_timeout 5s;
  set $sb_upstream storybook-service:6006;
  proxy_pass http://$sb_upstream/;
}
location = /storybook/iframe.html { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_pass http://$sb_upstream/iframe.html; }
location = /storybook/index.json  { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_pass http://$sb_upstream/index.json; }

# Manager, addons, common assets
location ^~ /sb-manager/       { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_pass http://$sb_upstream/sb-manager/; }
location ^~ /sb-addons/        { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_pass http://$sb_upstream/sb-addons/; }
location ^~ /sb-common-assets/ { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_pass http://$sb_upstream/sb-common-assets/; }

# Vite dev endpoints often require Host normalization
location ^~ /@vite/ { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_set_header Host localhost:6006; proxy_pass http://$sb_upstream/@vite/; }
location ^~ /@id/   { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_set_header Host localhost:6006; proxy_pass http://$sb_upstream/@id/; }
location ^~ /node_modules/ { resolver 127.0.0.11 ipv6=off; resolver_timeout 5s; set $sb_upstream storybook-service:6006; proxy_set_header Host localhost:6006; proxy_pass http://$sb_upstream/node_modules/; }

# HMR WebSocket under subpath
location ^~ /storybook/storybook-server-channel {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host storybook-service:6006;
  resolver 127.0.0.11 ipv6=off; resolver_timeout 5s;
  set $sb_upstream storybook-service:6006;
  proxy_pass http://$sb_upstream/storybook-server-channel;
}
```

**Storybook configuration (.storybook/main.ts):**

```typescript
import { defineConfig } from 'vite';
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  async viteFinal(viteConfig) {
    return {
      ...viteConfig,
      base: process.env.STORYBOOK_BASE_PATH || '/storybook/',
    };
  }
};

export default config;
```

**Notes:**
- Always use variable upstreams so nginx starts even if Storybook is down
- Some setups require `Host: localhost:6006` for `@vite`, `@id`, `node_modules`
- See `examples/storybook/` for complete examples
- Run `scripts/test_storybook_proxy.sh` for regression testing

### Vite Apps

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH || '/myapp/',
  server: {
    hmr: { protocol: 'ws' } // Optional for tunnels
  }
});
```

## Example Configurations

- **`examples/sample-prefix-app.conf`** - App served under `/myapp/` (keeps prefix)
- **`examples/sample-root-api-strip.conf`** - API mounted at `/api/` (strips prefix)
- **`examples/next/`** - Next.js with basePath pattern (compose overlay + nginx)
- **`examples/storybook/`** - Storybook + Vite proxy configurations
- **`examples/cra/`** - Create React App setup
- **`examples/api-upload-config.js`** - Programmatic config installation


## Repository Organization

### Directory Structure

```
dev-tunnel-proxy/
├── apps/                     # Per-app nginx snippets (gitignored, local-only)
├── overrides/                # Proxy-owned overrides (gitignored)
├── build/
│   └── sites-enabled/
│       └── apps.generated.conf  # Composed output (mounted into nginx)
├── config/
│   ├── default.conf          # Core nginx config
│   ├── ngrok.dynamic.yml     # Dynamic domain template
│   └── ngrok.yml             # Static domain template
├── dashboard/                # Optional demo dashboard
├── docs/                     # Comprehensive documentation
├── examples/                 # Configuration templates
├── scripts/                  # Management and helper scripts
├── site-auditor-debug/       # Puppeteer-based auditing tool
├── status/                   # Status dashboard UI
├── test/                     # Test suites and utilities
├── utils/                    # Core utilities (~6800 lines)
├── .artifacts/               # Generated reports and diagnostics
├── docker-compose.yml        # Service definitions
└── smart-build.sh            # Main management script
```

### Key Principles

- **Generic Core**: No app-specific names in core code
- **Gitignored Configs**: `apps/` and `overrides/` are local-only
- **Template-Based**: Use `examples/` as starting points
- **Self-Contained**: Status UI and dashboard are independent
- **Artifact Tracking**: All generated data in `.artifacts/`

## Notes
- Never commit your ngrok authtoken. Use env vars or a local `.env` file.
- Keep app snippets **app-specific**. No cross-references to other apps.
- WebSockets/HMR: all example snippets include the required headers.
- **App configs are git-ignored** - Each project manages its own `apps/*.conf` files locally.

## 📚 Documentation

Our documentation has been consolidated for easier navigation. Here are the core guides:

### 📖 Core Documentation

1. **[User Guide](docs/USER_GUIDE.md)** - Complete getting started guide
   - Initial setup and configuration
   - Adding your app to the proxy
   - Using the status dashboard
   - Working with Calliope AI
   - Common workflows and troubleshooting

2. **[API Reference](docs/API.md)** - Complete API documentation
   - Endpoint structure and namespaces
   - Authentication and session management
   - Configuration management APIs
   - Calliope AI endpoints
   - Client integration examples
   - Migration guide

3. **[Architecture](docs/ARCHITECTURE.md)** - Technical system design
   - Container topology and responsibilities
   - Data flow and request lifecycle
   - Configuration system
   - Resilience and error handling
   - Performance characteristics

4. **[Configuration](docs/CONFIGURATION.md)** - Managing proxy configuration
   - Reserved paths and restrictions
   - Route conflicts and resolution
   - Overrides and precedence
   - Best practices and common scenarios

5. **<img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="16" style="vertical-align: middle;" /> [Calliope AI Assistant](docs/CALLIOPE_ASSISTANT.md)** - Your caring AI companion
   - Personality and capabilities
   - Self-healing system
   - RAG knowledge base
   - API endpoints
   - Testing and validation

6. **[Testing, Security & Quality](docs/TESTING_SECURITY_AND_QUALITY.md)** - Operational excellence
   - Testing strategies and suites
   - Security model and best practices
   - Known issues and limitations
   - Operational best practices

7. **[Product & Roadmap](docs/PRODUCT.md)** - Vision and future plans
   - Product overview and value propositions
   - Use cases and target audience
   - Competitive landscape
   - Feature roadmap (v1.1 through v1.4)
   - Success metrics and community

### 📦 Archive

Previous documentation has been preserved in `docs/archive/` for reference.

## <img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="32" style="vertical-align: middle;" /> Inspiration: Calliope

**Calliope** is named in honor of the author's daughter, who lives with tuberous sclerosis complex (TSC). Her resilience, kindness, and youthful spirit inspire this project's mission: a caring AI assistant who proactively keeps your dev environment healthy so you can focus on building and sharing amazing things.

Like her namesake, Calliope approaches problems with empathy, persistence, and a genuine desire to help. She doesn't just diagnose issues—she fixes them herself, learns from each success, and celebrates when everything works perfectly. 💖

If you feel inspired by Calliope's caring approach to development support, please consider supporting families affected by TSC by donating to the [TSC Alliance](https://www.tscalliance.org/).

## How to contribute

1. **Add your app**: Create a snippet in `examples/` following the patterns shown
2. **Install**: Use `./scripts/install-app.sh <name> <path>` to add your app
3. **Test**: Ensure your app joins the `devproxy` network and works through the tunnel
4. **Share**: Submit a PR with your example snippet for others to use

Keep examples generic and focused on common patterns (prefix-kept vs prefix-stripped). **Always use variable resolution** for upstream services to ensure reliable proxy startup.

**Note**: App configs in `apps/` are git-ignored to keep the project generic. Each team manages their own configurations locally.

## Architecture: Why Separate Containers?

The Dev Tunnel Proxy uses a **multi-container architecture** for optimal separation of concerns and operational flexibility.

### Container Responsibilities

- **`dev-proxy`** (nginx): Pure reverse proxy + static file serving
- **`proxy-config-api`** <img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="16" style="vertical-align: middle;" /> (Node.js): REST API for config management, conflict resolution, and Calliope AI endpoints
- **`auto-scan`** (Node.js): Periodic route health monitoring and status generation
- **`dev-ngrok`**: Secure tunnel service to external networks

### Why This Approach Works Better

#### 🎯 **Single Responsibility Principle**
Each container has a focused, well-defined purpose:
- nginx excels at high-performance proxying and static content
- Node.js services handle dynamic APIs and background processing
- ngrok provides specialized tunnel functionality

#### 🚀 **Operational Benefits**
```bash
# Restart just the API without affecting proxy traffic
docker-compose restart proxy-config-api

# Debug individual services independently
docker-compose logs proxy-config-api --tail=50

# Scale specific services if needed
docker-compose up --scale auto-scan=2
```

#### 📊 **Resource Optimization**
- **nginx**: Minimal footprint (~5MB alpine), optimized for proxy workloads
- **Node.js services**: Only consume resources when actively processing
- **Independent lifecycles**: Can start/stop services without affecting others

#### 🔧 **Fault Isolation**
- Config API crash → Status UI loses some features, but proxy continues working
- Auto-scan failure → Health monitoring affected, but routing unimpacted
- Nginx issues → Only proxy affected, APIs remain functional for diagnostics

#### 🏗️ **Development Flexibility**
- Change API logic without nginx config reloads
- Modify nginx configuration without Node.js service restarts
- Each service can use optimized Docker images and configurations

#### 🎭 **Environment Adaptation**
```yaml
# Easily disable development-only services in production
services:
  proxy-config-api:
    profiles: ["development"]
  auto-scan:
    profiles: ["development"]
```

### Alternative: Monolithic Container

A single container **could** work for simple scenarios, but would sacrifice:
- ❌ Independent service restarts during development
- ❌ Resource optimization (nginx + Node.js always running together)
- ❌ Technology specialization (forced to use same base image)
- ❌ Fault isolation (single point of failure)
- ❌ Production deployment flexibility

### Evolution Path

The current architecture allows **future consolidation** if needed:
```yaml
# Could merge services later if requirements change
services:
  proxy:
    image: nginx-with-node  # Custom image combining both
    command: ["sh", "-c", "node /proxy-config-api.js & nginx"]
```

However, the **multi-container approach provides superior flexibility** without meaningful complexity overhead, making it the better choice for development environments where reliability and maintainability are paramount.

---

## 🚀 Quick Reference

### Common Commands

```bash
# Start the proxy
./smart-build.sh up

# View logs
./smart-build.sh logs

# Reload configuration
./smart-build.sh reload

# Check status
./smart-build.sh status
```

### Key Endpoints

- **Status Dashboard**: `http://localhost:8080/status`
- **Health Check**: `http://localhost:8080/health`
- **API Docs**: `http://localhost:3001/api/`
- **Reports**: `http://localhost:8080/reports`

### Need Help?

- <img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="16" style="vertical-align: middle;" /> **Ask Calliope**: Click the stethoscope icon in the status dashboard
- **Documentation**: See `docs/` directory
- **Examples**: See `examples/` directory
- **Troubleshooting**: Check `docs/USER_GUIDE.md#troubleshooting`




## macOS Notifications Bridge

The notifications UI includes a **🧪 test** button for Text notifications and can install/manage the background notifications engine. Because sending texts is **macOS-only**, run the local bridge on your Mac:

```bash
node macos/notifications-bridge.js
```

The bridge provides:
- **Test notifications** - Send test messages via Messages.app from the UI
- **Service management** - Install/uninstall the background notifications engine directly from the UI
- **Service status** - Check if the background engine is running

The Status UI connects to `http://127.0.0.1:17888` to access these features.

### Installing the Background Service

Once the bridge is running, open any route's Notifications panel in the Status UI. You'll see a **⚙️ Background Service** section where you can:
- Check if the service is installed and running
- Install the service with one click
- Uninstall the service when no longer needed
- View log file locations

Notes:
- The first time, macOS will prompt you to allow automation access for the process that runs the bridge.
- This is intended for iMessage and SMS relay (when enabled on your Mac).
- See `docs/NOTIFICATIONS_EXECUTION_MACOS.md` for more details.
