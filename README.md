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

## Quick Start

### 1. Initial Setup

First, configure your ngrok authentication:

```bash
# Create .env file with your ngrok token
export NGROK_AUTHTOKEN=YOUR_TOKEN

# (Optional) Use a reserved ngrok domain
export NGROK_STATIC_DOMAIN=your-domain.ngrok.app
```

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
- **dev-proxy-config-api**: Configuration and AI management API (port 3001)
- **dev-auto-scan**: Periodic route health monitoring

### 4. Install App Routes

Use the programmatic API to install your app's nginx configuration:

```javascript
// Using fetch API from within your app container
fetch('http://dev-proxy:8080/api/apps/install', {
  method: 'POST',
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

Or use the helper script:

```bash
node examples/api-upload-config.js myapp path/to/myapp.conf
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
- **Status Dashboard**: Visit `http://localhost:8080/status` to see all routes and their health

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

### Optional: OpenAI Integration

For enhanced Q&A capabilities, configure OpenAI in `.env`:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
```

### Learn More

- **[Calliope AI Assistant Guide](docs/CALLIOPE-AI-ASSISTANT.md)** - Full capabilities and technical details
- **[Calliope Personality](docs/CALLIOPE-PERSONALITY.md)** - Her caring, proactive approach

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

# App management (legacy - prefer API)
./smart-build.sh install-app NAME path/to/config.conf
./smart-build.sh uninstall-app NAME
./smart-build.sh list-apps

# Check service status
./smart-build.sh status
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

The `dev-auto-scan` service continuously monitors route health:

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

- **[Project Integration Guide](docs/PROJECT-INTEGRATION.md)** - Step-by-step setup for new projects
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Configuration Management Guide](docs/CONFIG-MANAGEMENT-GUIDE.md)** - How the generator works, migration notes, overrides
- **[API Endpoints](docs/API-ENDPOINTS.md)** - Complete API reference and examples
- **<img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="16" style="vertical-align: middle;" /> [Calliope AI Assistant](docs/CALLIOPE-AI-ASSISTANT.md)** - Capabilities, endpoints, and integrated self-healing
- **<img src="./status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="16" style="vertical-align: middle;" /> [Calliope Personality](docs/CALLIOPE-PERSONALITY.md)** - Tone, traits, and expressive behavior

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
- **Troubleshooting**: Check `docs/TROUBLESHOOTING.md`
