# Dev Tunnel Proxy Architecture

**Last Updated**: December 2025  
**Version**: 1.1

## Overview

Dev Tunnel Proxy is a multi-container development infrastructure system designed to provide intelligent reverse proxying, secure tunneling, and AI-powered self-healing capabilities for distributed development environments.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [System Architecture](#system-architecture)
3. [Container Details](#container-details)
4. [Networking](#networking)
5. [Configuration System](#configuration-system)
6. [Data Flow & Lifecycle](#data-flow--lifecycle)
7. [Resilience & Error Handling](#resilience--error-handling)
8. [Calliope AI System](#calliope-ai-system)
9. [UI Architecture](#ui-architecture)
10. [Performance Characteristics](#performance-characteristics)
11. [Design Decisions](#design-decisions)

---

## Design Philosophy

### Core Principles

1. **Separation of Concerns** - Each container has a single, well-defined responsibility
2. **Composition Over Configuration** - Apps contribute snippets rather than editing monolithic configs
3. **Runtime Resilience** - System gracefully handles missing or failing upstream services
4. **AI-Augmented Operations** - Proactive monitoring and healing reduces manual intervention
5. **Developer Experience First** - Intuitive APIs, visual dashboards, and helpful error messages

### Why Multi-Container?

The system deliberately uses separate containers for:

- **Operational Independence** - Restart/update services without affecting others
- **Resource Optimization** - Each service uses optimal runtime (nginx alpine vs Node.js)
- **Fault Isolation** - Service failures don't cascade
- **Technology Specialization** - Use best tool for each job
- **Scalability** - Independent scaling of different components

---

## System Architecture

### Container Topology

```
┌─────────────────────────────────────────────────────────────┐
│                     External Network                         │
│                  (Internet, Remote Teams)                    │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   dev-ngrok     │
                    │  (ngrok:latest) │
                    │                 │
                    │  Port: 4040     │
                    │  Tunnel: HTTPS  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │              devproxy network          │
         │                                        │
    ┌────▼────────┐    ┌────────────┐    ┌──────▼──────────┐
    │  dev-proxy  │    │ dev-auto-  │    │ dev-proxy-      │
    │  (nginx)    │◄───┤  scan      │    │ config-api      │
    │             │    │            │    │                 │
    │ Ports:      │    │ Node.js    │    │ Node.js + AI    │
    │  8080:80    │    │ Background │    │ Port: 3001      │
    │  443:443    │    │ Monitor    │    │                 │
    └─────┬───────┘    └────────────┘    └─────────────────┘
          │                                      │
          │                                      │
          └──────────────┬───────────────────────┘
                         │
         ┌───────────────┴───────────────────────┐
         │                                       │
    ┌────▼─────┐    ┌──────────┐    ┌──────────▼────┐
    │  App 1   │    │  App 2   │    │    App N      │
    │ (myapp)  │    │ (app2)   │    │  (another)    │
    │          │    │          │    │               │
    │ Port:    │    │ Port:    │    │  Port:        │
    │  4000    │    │  8000    │    │   3000        │
    └──────────┘    └──────────┘    └───────────────┘
```

### Data Flow

```
User Request
     │
     ▼
[ngrok Tunnel] ← External HTTPS
     │
     ▼
[dev-proxy/nginx] ← Port 8080/443
     │
     ├─► [Static Files] (status/, dashboard/)
     │
     ├─► [API Endpoints] → [dev-proxy-config-api:3001]
     │                           │
     │                           ├─► Configuration Management
     │                           ├─► Calliope AI (with OpenAI)
     │                           ├─► RAG Document Search
     │                           └─► Health Monitoring
     │
     └─► [App Routes] → [Dynamic Upstreams]
              │
              ├─► myapp-dev:4000 (Next.js app)
              ├─► app2:8000 (React app)
              └─► your-app:3000 (any framework)
```

---

## Container Details

### 1. dev-proxy (nginx:1.25-alpine)

**Purpose**: High-performance reverse proxy and static file server

**Responsibilities**:
- Route incoming requests to upstream services
- Serve static status dashboards and assets
- Handle SSL/TLS termination (self-signed certs)
- Apply dynamic configuration from generated bundle
- Health monitoring endpoint

**Volumes**:
- `./config/default.conf` → `/etc/nginx/conf.d/default.conf` (core config)
- `./build/sites-enabled/` → `/etc/nginx/conf.d/sites-enabled/` (generated app routes)
- `./status/` → `/usr/share/nginx/html/status/` (status UI)
- `./dashboard/public/` → `/usr/share/nginx/html/dashboard/` (dashboard UI)
- `./.artifacts/` → `/usr/share/nginx/html/.artifacts/` (reports, health data)
- `./.certs/` → `/etc/nginx/certs/` (TLS certificates)

**Key Features**:
- **Variable-based upstream resolution** - All `proxy_pass` directives use nginx variables with DNS resolver, deferring hostname resolution until request time
- **Graceful error handling** - Returns proper JSON error responses (503) when upstream services are unavailable instead of failing to start
- **Emergency fallback** - Disables app bundle if it contains errors, keeping core proxy UI/API operational
- **WebSocket support** - Full HMR and real-time connection support for dev servers
- **Custom entrypoint** - Multi-stage validation with detailed error reporting

**Resilience Strategy**:
```nginx
# Example: Variable-based resolution with error handling
location /api/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $upstream api:8000;
  
  # Intercept upstream errors and return friendly message
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$upstream/;
}

# Global error handler
location @upstream_unavailable {
  add_header Content-Type application/json;
  return 503 '{"error":"Service Unavailable","message":"..."}';
}
```

This approach ensures:
- Nginx starts even if all app services are offline
- DNS resolution happens at request time, not config load time
- Users get helpful error messages instead of connection refused
- Core proxy management UI remains accessible for debugging

**Health Check**:
```bash
wget -qO- http://127.0.0.1/health.json
```

### 2. dev-proxy-config-api (node:18-alpine)

**Purpose**: REST API for configuration management and AI assistant

**Responsibilities**:
- Configuration file CRUD operations
- Nginx bundle generation and reload triggering
- Route conflict detection and resolution
- Calliope AI endpoints and healing orchestration
- RAG document retrieval and embedding
- Site auditing with Puppeteer
- Chat history management

**Special Capabilities**:
- Docker socket access for container operations
- Docker CLI installed at runtime
- Can exec into other containers for diagnostics
- Manages host filesystem (apps/, overrides/ directories)

**Environment Variables**:
- `OPENAI_API_KEY` - OpenAI API access
- `OPENAI_MODEL` - Model for chat (default: gpt-4o-mini)
- `OPENAI_EMBED_MODEL` - Model for embeddings (default: text-embedding-3-small)

**Volumes**:
- `.:/app` - Full project mounted (read/write)
- `/var/run/docker.sock` - Docker socket for container management

**Port**: 3001

### 3. dev-auto-scan (node:18-alpine)

**Purpose**: Continuous health monitoring and route scanning

**Responsibilities**:
- Probe all configured routes every 15 seconds
- Generate health reports (health-latest.json, scan-apps-latest.json)
- Detect route issues and status changes
- Provide data for status dashboards

**Operation**:
```bash
while true; do
  node test/scanApps.js
  sleep 15
done
```

**Output**:
- `.artifacts/reports/health-latest.json`
- `.artifacts/reports/scan-apps-latest.json`
- Timestamped historical reports

### 4. dev-ngrok (ngrok/ngrok:latest)

**Purpose**: Secure tunnel to external networks

**Responsibilities**:
- Create HTTPS tunnel to dev-proxy
- Support both static and dynamic domains
- Provide public URL for remote testing
- Web interface on port 4040

**Configuration**:
- Static domain: Uses `config/ngrok.yml` template
- Dynamic domain: Uses `config/ngrok.dynamic.yml` template
- Switches based on `NGROK_STATIC_DOMAIN` env var

**Discovery**:
```bash
# Via local API
curl http://localhost:4040/api/tunnels

# Via container logs
docker logs dev-ngrok | grep "https://"
```

---

## Networking

### devproxy Network

**Type**: Bridge network (external)

**Purpose**:
- Shared communication bus for all containers
- DNS-based service discovery
- Network isolation from host

**Members**:
- dev-proxy
- dev-ngrok
- dev-proxy-config-api
- dev-auto-scan
- All connected app containers (myapp-dev, app2, etc.)

**Resolution**:
```bash
# From any container on devproxy network
ping dev-proxy          # → nginx container
ping myapp-dev          # → app container
ping dev-proxy-config-api  # → API container
```

**Creation**:
```bash
docker network create devproxy
```

---

## Configuration System

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│           nginx (Running Config)                │
│  /etc/nginx/conf.d/default.conf                │
│  /etc/nginx/conf.d/sites-enabled/*.conf        │
└──────────────────┬──────────────────────────────┘
                   │
                   │ (include statement)
                   │
┌──────────────────▼──────────────────────────────┐
│      Generated Bundle (Composed Output)         │
│  build/sites-enabled/apps.generated.conf        │
│  - Merged from all sources                      │
│  - Conflict resolution applied                  │
│  - Provenance tracking (# source: comments)     │
└──────────────────┬──────────────────────────────┘
                   │
                   │ (generateAppsBundle.js)
                   │
    ┌──────────────┴──────────────┐
    │                             │
┌───▼───────────┐       ┌─────────▼─────────┐
│  apps/*.conf  │       │ overrides/*.conf  │
│  (App-owned)  │       │  (Proxy-owned)    │
│               │       │                   │
│  - Local only │       │  - Takes priority │
│  - Gitignored │       │  - Gitignored     │
└───────────────┘       └───────────────────┘
```

### Precedence Rules

1. **Overrides always win** - Critical routes controlled by proxy
2. **Among apps** - Most recently modified file wins for conflicts
3. **Exact vs prefix** - `location = /app/` and `location ^~ /app/` can coexist
4. **Include order** - Apps included before generic `location /` in default.conf

### Reserved Path Enforcement

**Root Path (`/`) is FORBIDDEN for apps** and reserved exclusively for the proxy landing page.

The configuration generator (`utils/generateAppsBundle.js`) enforces this restriction:

```javascript
function isRootLevelDevHelper(pathSpec) {
  // FORBIDDEN: Apps cannot define location = /
  if (/^=\s*\/(?:$|index\.html$|iframe\.html$)/.test(pathSpec)) {
    console.warn(`⚠️  BLOCKED: Apps are FORBIDDEN from defining root path`);
    return true; // Block this location
  }
  // ... additional checks
}
```

**Enforcement mechanism:**
1. Generator scans all `location` blocks during composition
2. Detects any attempts to define `location = /`
3. Automatically blocks the location from being included
4. Logs warning to console for visibility
5. No override possible - even `overrides/` cannot define root

**Reserved paths protected:**
- `/` - Landing page (FORBIDDEN)
- `/status`, `/health`, `/reports`, `/dashboard` - UI endpoints
- `/api/ai/*`, `/api/config/*`, `/api/apps/*` - API endpoints
- `/.artifacts/*` - Internal artifacts
- `/health.json`, `/routes.json`, `/status.json` - JSON endpoints

**Why this matters:**
- Ensures consistent user experience
- Provides single source of truth about the proxy
- Prevents conflicts between apps
- Maintains brand identity and documentation access

### Generation Process

```
1. Scan apps/ and overrides/ directories
2. Parse nginx configuration blocks
3. Detect route conflicts
4. Apply precedence rules
5. Harden upstream variables
6. Compose single bundle
7. Add provenance comments
8. Write diagnostics JSON
9. Test configuration (nginx -t)
10. Reload if valid
```

---

## Data Flow & Lifecycle

### Request Lifecycle

#### 1. Incoming HTTP Request

```
Client Request
  URL: https://example.ngrok.app/myapp/api/users
  Headers: {
    Host: example.ngrok.app
    User-Agent: Mozilla/5.0
    ...
  }
```

**Stage 1: Tunnel Entry**
- Request arrives at ngrok edge server
- ngrok validates domain/authtoken
- Establishes connection to dev-ngrok container
- Forwards to dev-proxy on internal network

**Stage 2: Nginx Processing**
```
dev-proxy receives:
  GET /myapp/api/users HTTP/1.1
  Host: example.ngrok.app
  X-Forwarded-Proto: https
  X-Forwarded-For: client-ip
```

**Stage 3: Location Matching**
```
nginx evaluates in priority order:
1. Exact match:   location = /myapp/api/users  (not found)
2. Prefix match:  location ^~ /myapp/api/      (found!)
3. (stops here, doesn't check regex or generic)
```

**Stage 4: Variable Resolution**
```nginx
location ^~ /myapp/api/ {
  resolver 127.0.0.11;           # Docker DNS
  set $up myapp-backend:3000;    # Runtime DNS lookup
  proxy_pass http://$up/api/;    # Strips /myapp prefix
}
```

**Stage 5: Proxying**
```
nginx → myapp-backend:3000
  GET /api/users HTTP/1.1
  Host: example.ngrok.app
  X-Forwarded-Proto: https
  X-Forwarded-Host: example.ngrok.app
  X-Forwarded-For: client-ip
  X-Forwarded-Prefix: /myapp
```

**Stage 6: Response**
```
myapp-backend → nginx → ngrok → Client
  200 OK
  Content-Type: application/json
  { "users": [...] }
```

**Timing**:
- ngrok overhead: ~100-300ms
- nginx proxy: ~2-5ms
- app processing: varies
- Total: ~150-400ms + app time

### Configuration Lifecycle

#### Creation

```
1. Developer creates myapp.conf
   └─► Nginx snippet with location blocks

2. Upload via API or file system
   POST /api/apps/install { name, content }
   or
   Copy to apps/myapp.conf manually

3. proxyConfigAPI receives request
   ├─► Validates nginx syntax (basic check)
   ├─► Writes to apps/myapp.conf
   └─► Returns success

4. Triggers automatic bundle generation
   (or manual: POST /api/apps/regenerate)
```

#### Transformation

```
apps/myapp.conf (raw)
         │
         ▼
hardenUpstreams.js
  - Finds hardcoded proxy_pass
  - Converts to variables
  - Adds resolver directives
         │
         ▼
apps/myapp.conf (hardened)
         │
         ▼
generateAppsBundle.js
  - Parses location blocks
  - Detects conflicts
  - Applies precedence
  - Merges with overrides
         │
         ▼
build/sites-enabled/apps.generated.conf
  - Single composed file
  - Source comments preserved
  - Ready for nginx
```

#### Activation

```
Bundle Generated
      │
      ▼
nginx -t (test)
      │
      ├─► Valid
      │   └─► nginx -s reload
      │       └─► New config active
      │
      └─► Invalid
          └─► Error logged
              └─► Old config remains
```

#### Persistence

**State**: Configuration files
**Location**: `apps/*.conf`, `overrides/*.conf`
**Lifetime**: Permanent (user-managed)
**Backup**: `.conf.backup.*` files on modification

**Metadata**: Bundle diagnostics
**Location**: `build/bundle-diagnostics.json`
**Format**:
```json
{
  "timestamp": "2025-01-15T...",
  "sources": ["apps/myapp.conf", "overrides/critical.conf"],
  "locations": {
    "/myapp/": {
      "source": "apps/myapp.conf",
      "type": "prefix",
      "upstream": "myapp:3000"
    }
  },
  "conflicts": [],
  "skipped": []
}
```

### Health Monitoring Lifecycle

#### Continuous Scanning

```
dev-auto-scan container (15-second loop)
         │
         ▼
1. Load current routes from /routes.json
         │
         ▼
2. For each route:
   ├─► HTTP probe (local + tunnel targets)
   ├─► Record status code, timing
   ├─► Check content-type
   └─► Detect errors
         │
         ▼
3. Generate reports
   ├─► health-latest.json (consolidated health)
   ├─► scan-apps-latest.json (detailed per-route)
   └─► Timestamped copies
         │
         ▼
4. Write to .artifacts/reports/
         │
         ▼
5. sleep 15 seconds
         │
         └─► Repeat
```

#### Report Structure

**health-latest.json**:
```json
{
  "timestamp": "2025-01-15T12:34:56.789Z",
  "overall": "healthy",
  "routes": {
    "/myapp/": {
      "status": "ok",
      "httpCode": 200,
      "targets": {
        "local": { "status": "ok", "code": 200 },
        "tunnel": { "status": "ok", "code": 200 }
      }
    }
  },
  "summary": {
    "total": 10,
    "ok": 9,
    "warn": 1,
    "err": 0
  }
}
```

#### Report Consumption

**Status Dashboard**:
```javascript
// Periodic fetch
setInterval(async () => {
  const data = await fetch('/routes.json').then(r => r.json());
  updateRouteCards(data.routes);
}, 30000);
```

**Calliope Self-Check**:
```javascript
// On-demand probe
const report = await fetch('/health.json').then(r => r.json());
analyzeIssues(report.routes);
```

### Data Storage

#### File System Layout

```
dev-tunnel-proxy/
├── .artifacts/              # Generated data (gitignored)
│   ├── calliope/
│   │   ├── healing-kb.json  # Pattern knowledge base
│   │   ├── healing-log.json # Historical fixes
│   │   ├── chat-history.json # Calliope conversation history
│   │   ├── docs-hash.txt    # Documentation fingerprint
│   │   └── resources/       # Audit resources
│   ├── reports/
│   │   ├── health-latest.json      # Latest health report
│   │   ├── scan-apps-latest.json   # Latest route scan
│   │   └── *.json           # Historical timestamped reports
│   ├── audits/              # Site auditor outputs
│   ├── ui/                  # Playwright test artifacts
│   ├── ai-embeddings.json   # RAG vector index
│   ├── route-resolutions.json # Conflict resolution decisions
│   └── override-conflicts.json # Override vs app conflicts
│
├── apps/                    # App configs (gitignored)
│   └── *.conf               # Per-app nginx snippets
│
├── overrides/               # Proxy-owned configs (gitignored)
│   └── *.conf               # Override snippets
│
├── build/                   # Compiled artifacts (gitignored)
│   └── sites-enabled/
│       ├── apps.generated.conf    # Composed bundle
│       └── bundle-diagnostics.json # Generation report
│
└── .certs/                  # TLS certificates (gitignored)
    ├── dev.crt              # Self-signed certificate
    └── dev.key              # Private key
```

#### State Management

**Persistent State** (survives restarts):
- Configuration files (apps/, overrides/)
- Healing knowledge base
- Chat history
- Route resolution decisions
- Historical reports

**Ephemeral State** (regenerated):
- Generated nginx bundle
- Latest health/scan reports
- Thinking events queue
- Calliope activity status

**Browser State** (localStorage):
- Theme preference (`dtpTheme`)
- Calliope open/closed (`dtpCalliopeOpen`)
- Chat conversation (`dtpCalliopeChat`)
- UI preferences (filters, sort order)

---

## Resilience & Error Handling

### Problem Statement

In development environments, services frequently start and stop. Without proper resilience:

- **Nginx won't start** if any configured upstream is unavailable
- **Hard failures** with cryptic error messages confuse developers
- **Cascading failures** where one service being down breaks the entire proxy
- **Manual intervention** required to restart proxy after fixing upstream issues

### Solution Architecture

#### 1. Variable-Based Upstream Resolution

**What**: All `proxy_pass` directives use nginx variables instead of hardcoded hostnames.

**Why**: Defers DNS resolution from config-load time to request time.

**Example**:
```nginx
# Before (fails at startup if service is down)
location /myapp/ {
  proxy_pass http://myapp:3000/;
}

# After (starts successfully, resolves at request time)
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  proxy_pass http://$myapp_upstream/;
}
```

**Benefits**:
- Nginx starts even if all app services are offline
- Services can be started in any order
- DNS resolution happens per-request using Docker's internal DNS
- Failed DNS lookups don't prevent proxy startup

#### 2. Graceful Error Handling

**What**: Intercept upstream errors and return friendly JSON responses.

**Why**: Users get helpful error messages instead of nginx error pages.

**Example**:
```nginx
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp:3000;
  
  # Intercept errors from upstream
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  
  proxy_pass http://$myapp_upstream/;
}

# Global error handler
location @upstream_unavailable {
  add_header Content-Type application/json;
  add_header Cache-Control "no-cache, no-store, must-revalidate";
  return 503 '{"error":"Service Unavailable","message":"The requested application is not currently running. Please start the service and try again.","status":503}';
}
```

**Error Codes Handled**:
- **502 Bad Gateway** - Service exists but returned invalid response
- **503 Service Unavailable** - Service is temporarily down
- **504 Gateway Timeout** - Service didn't respond in time

**Response Format**:
```json
{
  "error": "Service Unavailable",
  "message": "The requested application is not currently running. Please start the service and try again.",
  "status": 503
}
```

#### 3. Emergency Fallback System

**What**: Multi-stage validation in nginx entrypoint script.

**How**:
1. **First attempt**: Validate full config including app bundle
2. **Fallback**: Disable app bundle if validation fails
3. **Final check**: If still failing, show detailed troubleshooting steps

**Implementation** (`scripts/nginx-entrypoint.sh`):
```bash
# First try: validate current config
if nginx -t; then
  exec nginx -g 'daemon off;'
fi

# Emergency fallback: disable app bundle
if [ -f "/etc/nginx/conf.d/sites-enabled/apps.generated.conf" ]; then
  mv /etc/nginx/conf.d/sites-enabled/apps.generated.conf \
     /etc/nginx/conf.d/sites-enabled/apps.generated.conf.disabled
fi

# Retry with bundle disabled
if nginx -t; then
  echo "⚠ WARNING: App routes are disabled. Check app configs for errors."
  exec nginx -g 'daemon off;'
fi

# Final failure with troubleshooting steps
echo "✗ Fallback still failing; nginx cannot start"
echo "Troubleshooting steps: ..."
exit 1
```

**Benefits**:
- Core proxy UI and API remain accessible even if app configs have errors
- Administrators can diagnose and fix issues via web interface
- Clear error messages guide troubleshooting

#### 4. Automatic Hardening

**What**: The `generateAppsBundle.js` script automatically adds resilience directives.

**Process**:
1. Reads app configs from `apps/` and `overrides/`
2. Parses each `location` block
3. Detects `proxy_pass` directives
4. Adds resolver and error handling if missing
5. Normalizes variable usage
6. Generates hardened bundle

**Example Transformation**:
```nginx
# Input (apps/myapp.conf)
location /myapp/ {
  proxy_pass http://myapp:3000/;
}

# Output (build/sites-enabled/apps.generated.conf)
location /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $up_myapp_3000_1 myapp:3000;
  # Graceful error handling for unavailable upstream
  proxy_intercept_errors on;
  error_page 502 503 504 = @upstream_unavailable;
  proxy_pass http://$up_myapp_3000_1/;
}
```

**Automatic Features**:
- Unique variable names per location block
- Resolver configuration
- Error page directives
- Global error handler injection
- Variable normalization (removes `http://` from variable definitions)

---

## Calliope AI System

### Architecture

```
┌────────────────────────────────────────────────┐
│              User Interface Layer              │
│  - Status Dashboard (status/status.html)       │
│  - Chat Drawer (status/common.js)             │
│  - API Clients (fetch calls)                   │
└────────────────┬───────────────────────────────┘
                 │
        ┌────────▼────────┐
        │   REST API      │
        │  (port 3001)    │
        │                 │
        │  /api/ai/*      │
        └────────┬────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼──────────┐    ┌─────────▼────────┐
│   Calliope   │    │   RAG System     │
│   Healing    │    │   (Embeddings)   │
│              │    │                  │
│ - Patterns   │    │ - collectDocs()  │
│ - Diagnosis  │    │ - chunkDocs()    │
│ - Fixes      │    │ - embedChunks()  │
│ - Knowledge  │    │ - rankByVector() │
│   Base       │    │                  │
└───┬──────────┘    └─────────┬────────┘
    │                         │
    │                         ▼
    │              ┌──────────────────┐
    │              │  OpenAI API      │
    │              │  - GPT-4o-mini   │
    │              │  - Embeddings    │
    │              └──────────────────┘
    │
    ├─► Container Operations (docker exec)
    ├─► File System Operations (apps/, overrides/)
    ├─► Nginx Management (reload, test)
    └─► Health Probing (HTTP requests)
```

### RAG (Retrieval-Augmented Generation) System

**Purpose**: Give Calliope access to internal documentation

**Components**:

1. **Document Collection** (`collectDocs()`)
   - Scans docs/, examples/, root *.md files
   - 10 documents, ~97k characters
   - UTF-8 encoding, graceful error handling

2. **Chunking** (`chunkDocs()`)
   - Splits docs into 1200-char chunks
   - Maintains source attribution
   - 85 chunks created from 10 docs

3. **Embedding** (`embedChunks()`)
   - Uses OpenAI text-embedding-3-small
   - 1536 dimensions
   - Batch processing (16 chunks at a time)

4. **Storage**
   - `.artifacts/ai-embeddings.json`
   - Includes vectors, metadata, timestamps
   - ~10MB compressed

5. **Retrieval** (`rankByVector()`)
   - Cosine similarity search
   - Top-K relevant chunks
   - Sub-millisecond query time

**Auto-Reindexing**:
- Detects doc changes via SHA hash
- Triggers on: up, restart, reload, apply
- Hash stored in `.artifacts/calliope/docs-hash.txt`

### Knowledge Base

**Location**: `.artifacts/calliope/healing-kb.json`

**Structure**:
```json
{
  "version": "1.0",
  "patterns": [
    {
      "id": "pattern-id",
      "detection": {
        "signals": ["regex patterns"],
        "effects": ["observable symptoms"]
      },
      "solutions": [
        {
          "id": "solution-id",
          "type": "automated",
          "function": "fixFunctionName",
          "params": []
        }
      ]
    }
  ]
}
```

**Pattern Types**:
- `missing_basepath_assets` - React asset 404s
- `nginx_variable_upstream` - Startup DNS resolution
- `duplicate_location_blocks` - Config conflicts
- `storybook_vite_subpath` - Dev server helpers
- `nginx_location_priority` - API route matching

---

## UI Architecture

### Status Dashboard

**Technology**: Vanilla JavaScript, no build step

**Components**:
- `status/status.html` - Main page (~3200 lines)
- `status/common.js` - Shared header, theme, Calliope drawer
- `status/common.css` - Shared styles
- `status/global.css` - Theme tokens

**State Management**:
```javascript
// Global state object
window.DTPState = {
  routes: [],           // Route data from /routes.json
  filters: {},          // Active filters
  collapsed: new Set(), // Collapsed card IDs
  promotions: {},       // Parent-child relationships
  theme: 'dark',        // Current theme
  calliopeOpen: false   // Calliope drawer state
};
```

**Data Flow**:
```
1. Page Load
   ↓
2. fetch('/routes.json')
   ↓
3. Parse and group routes by upstream
   ↓
4. Render cards with controls
   ↓
5. User interactions (filter, collapse, promote)
   ↓
6. Re-render affected sections
   ↓
7. Periodic refresh (every 30s)
```

### Calliope Chat Interface

**Technology**: Sidebar drawer, vanilla JS

**Features**:
- Real-time thinking indicator
- Persistent chat history (localStorage)
- Animated thinking dots
- Action buttons (Ask, Self-Check, Copy, Clear)
- Auto-positioning based on header height

**Communication**:
```
User types message
     │
     ▼
POST /api/ai/ask { query: "..." }
     │
     ├─► Immediate response (quick queries)
     │       └─► Update chat history
     │
     └─► Background operation (long tasks)
             │
             ├─► Poll GET /api/ai/thoughts
             │   └─► Update thinking bubble
             │
             └─► Poll GET /api/ai/chat-history
                 └─► Detect completion
                 └─► Render assistant response
```

---

## Performance Characteristics

### Latency

- **Local request**: <5ms (direct nginx proxy)
- **Tunnel request**: +100-300ms (ngrok overhead)
- **Config reload**: ~50ms (nginx -s reload)
- **Bundle generation**: ~30-50ms (parse + compose)
- **RAG document query**: <1ms (cosine similarity)

### Resource Usage

| Container | Memory | CPU | Disk |
|-----------|--------|-----|------|
| dev-proxy | ~15MB | <1% | minimal |
| dev-ngrok | ~25MB | <1% | minimal |
| dev-proxy-config-api | ~50MB | <5% | 50MB (.artifacts) |
| dev-auto-scan | ~40MB | <2% | minimal |

### Scalability

**Current Limits**:
- ~50 routes comfortably
- ~100 routes at scale
- 1000+ routes possible (not tested)

**Bottlenecks**:
- nginx config reload time (linear with routes)
- auto-scan probe time (serial probing)
- UI rendering (DOM size)

---

## Design Decisions

### Why Nginx Variables for Upstreams?

**Problem**: Nginx resolves upstream hostnames at startup. If a service isn't running, nginx fails to start.

**Solution**: Use variables with `resolver` directive for runtime DNS lookup:

```nginx
set $upstream myapp:3000;
resolver 127.0.0.11;
proxy_pass http://$upstream/;
```

**Trade-offs**:
- ✅ Nginx starts even if apps are down
- ✅ Apps can be restarted independently
- ❌ Slight performance overhead (DNS lookup per request)
- ❌ More verbose configuration

**Conclusion**: Worth it for development flexibility

### Why Gitignore Apps and Overrides?

**Goal**: Keep proxy repository generic and reusable

**Approach**:
- Apps contribute snippets, proxy composes them
- Each project manages its own `apps/*.conf` files
- Proxy can't accidentally commit app-specific configs

**Benefits**:
- ✅ Single proxy repo serves multiple projects
- ✅ Apps manage their own routing needs
- ✅ No cross-project coupling
- ✅ Easy to share proxy between teams

### Why REST API Over File Watching?

**Alternatives Considered**:
1. File watcher with inotify
2. Manual config editing
3. REST API (chosen)

**Rationale**:
- API provides transactional updates (test before apply)
- Better error handling and rollback
- Enables programmatic configuration
- Works across container boundaries
- Logs and audits all changes

### Why Separate Config API Container?

**Alternatives**:
- Combine with nginx in single container
- Use nginx modules for dynamic config
- External service

**Rationale**:
- Nginx excels at proxying, not at REST APIs
- Node.js better for JSON processing, AI integration
- Independent restart during development
- Can add features without touching nginx
- Clear separation of concerns

---

## Future Architecture Evolution

### Planned Improvements

1. **Incremental Reindexing**
   - Track changed docs individually
   - Only re-embed modified files
   - Faster updates, lower cost

2. **Parallel Health Scanning**
   - Concurrent route probing
   - Faster scan cycles
   - Reduced monitoring latency

3. **Real-Time Config Sync**
   - WebSocket-based config updates
   - No polling needed
   - Instant UI updates

4. **Distributed Monitoring**
   - Multiple scan nodes
   - Aggregated health reports
   - Geographic diversity

### Potential Consolidation

If operational simplicity becomes more important than flexibility:

```yaml
# Consolidated option
services:
  proxy-plus:
    image: custom-nginx-node
    # Combines nginx + API + monitoring
    # Single container, simpler ops
```

**Trade-offs of consolidation**:
- ✅ Fewer containers to manage
- ✅ Simpler networking
- ❌ Less fault isolation
- ❌ Harder to develop/debug
- ❌ Resource inefficiency

**Current assessment**: Multi-container architecture provides superior value for development environments.

---

## See Also

- **[USER_GUIDE.md](USER_GUIDE.md)** - Getting started and daily usage
- **[CONFIGURATION.md](CONFIGURATION.md)** - Configuration management details
- **[CALLIOPE_ASSISTANT.md](CALLIOPE_ASSISTANT.md)** - AI assistant capabilities
- **[API.md](API.md)** - Complete API reference
- **[TESTING_SECURITY_AND_QUALITY.md](TESTING_SECURITY_AND_QUALITY.md)** - Testing, security, and quality assurance
- **[PRODUCT.md](PRODUCT.md)** - Product vision and roadmap
