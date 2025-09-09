# Dev Tunnel Proxy

A standalone, reusable **Dev Tunnel Proxy** (development proxy + ngrok tunnel) for teams.
- Tiny **core** Nginx config that `include`s generated app routes only.
- Separate **ngrok** container tunnels to the proxy.
- Each app contributes **local snippets** (e.g., `sample-prefix.conf`, `sample-api.conf`) that are composed into a single generated file. No monolithic config to edit.
- All apps that should be exposed join the shared Docker network: **`devproxy`**.

## Quick start

1) Set your ngrok token (or copy `.env.example` to `.env` and fill it):
   ```bash
   export NGROK_AUTHTOKEN=YOUR_TOKEN
   ```

2) (Optional) If you own a reserved ngrok domain, set `NGROK_STATIC_DOMAIN` in `.env`:
   ```bash
   export NGROK_STATIC_DOMAIN=your-domain.ngrok.app
   ```
   If not set (or empty), ngrok will use a dynamic domain.

3) Bring up the proxy + ngrok:
   ```bash
   ./scripts/smart-build.sh up
   ```

4) Install app routes (from the dev-tunnel-proxy repo root):
   ```bash
   ./scripts/install-app.sh sample-prefix examples/sample-prefix-app.conf
   ./scripts/install-app.sh sample-api    examples/sample-root-api-strip.conf
   ```

5) In each app's docker-compose, join the shared network:
   ```yaml
   networks:
     devproxy:
       external: true

   services:
     web:
       # ...
       networks:
         - devproxy
   ```

6) Open the ngrok URL from the `dev-ngrok` container logs or dashboard.
   Your routes (e.g., `/myapp`, `/api`) should work immediately.

7) **📊 Enhanced Status Dashboard with Calliope AI** (`/status`):
  - **Route Grouping**: Routes automatically grouped by base upstream URL
  - **Calliope Assistant**: Youthful, caring AI assistant for proactive diagnostics and healing  
  - **Promotion System**: Designate parent routes within each upstream group
  - **Visual Organization**: Collapsible route groups with status indicators
  - **Smart Actions**: Stethoscope-guided diagnostics, one-click route opening from headers
  - **Auto-Healing**: Calliope detects and fixes common issues automatically (React bundles, nginx configs, etc.)
  - **Real-Time Updates**: Watch Calliope's thinking process and step-by-step healing
  - **Live Reload**: Refresh configurations without leaving the browser  
  - **Per-Config JSON**: View filtered route data for each config file
  - **Per-Card Collapse**: Collapse any card to a compact header; state persists
  - **Sticky Summary & Controls**: Overview and Configured Apps header stay pinned
  - **Advanced Filter**: Match by route, severity (`ok|warn|err`), codes (`200`), or target-qualified (`ngrok:200`, `localhost:404`)

8) Built-in endpoints (human + JSON):
   - **Human**: `/` → `/status`, `/health` (enhanced dashboards)
   - **JSON**: `/status.json`, `/health.json`, `/routes.json`, `/ngrok.json`
   - **Reports**: `/reports/` directory browser

9) **🛠️ Advanced Conflict Management**:
10) **🤖 Calliope AI Assistant** (Enhanced)
   - **Personality**: Caring, youthful engineer who actually fixes problems instead of just giving advice
   - **Step-by-Step Healing**: Watch her investigate → diagnose → fix → test → verify
   - **Pattern Learning**: Remembers successful fixes and applies them automatically to similar issues  
   - **Self-Healing Strategies**: React bundle issues, nginx config problems, proxy resilience, and more
   - **Visible Thinking**: Animated thinking dots show when she's working
   - (Optional) Provide OpenAI key in `.env` for enhanced Q&A capabilities:
   ```bash
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_EMBED_MODEL=text-embedding-3-small
   ```
   - Click 🩺 stethoscope icons to ask Calliope to diagnose and heal issues
   - Chat interface for natural language questions and requests
   - Endpoints: `/api/ai/health`, `/api/ai/ask`, `/api/ai/self-check`, `/api/ai/advanced-heal`
   - See `docs/CALLIOPE-AI-ASSISTANT.md` for full capabilities

9) **🛠️ Advanced Conflict Management**:
   - Detects when multiple apps declare the same nginx route
   - **Enhanced Visual UI**: Improved conflict resolution at `/status`
   - Route renaming and config editing capabilities
   - Persistent conflict decisions across proxy restarts
   - API endpoints for programmatic conflict management

## Local vs Tunnel path strategy

- **Local**: run apps at `/` (no basePath) for ergonomics.
- **Tunnel**: enable a prefix (e.g., `/myapp`) only when going through this proxy.
  - For Next.js, gate `basePath`/`assetPrefix` behind an env var (e.g., `BEHIND_PROXY=1`).

## Scripts

- `scripts/install-app.sh` — copies a snippet into `apps/<name>.conf` and hot-reloads Nginx.
- `scripts/reload.sh` — safe Nginx reload; regenerates composed config before reload.
- `scripts/smart-build.sh` — convenience wrapper to start/stop, install app snippets, and show logs. Generates composed config at start/restart.

## Conflict Management

When multiple app configs declare the same nginx route (e.g., both `app1.conf` and `app2.conf` define `location /api/`), the proxy automatically detects and resolves conflicts using a **"first config wins"** strategy.

### Enhanced Visual Interface

Visit `/status` for the completely redesigned conflict management experience:

- **Grouped Routes**: Routes organized by base upstream URL for clarity
- **Smart Promotion**: Designate parent routes within upstream groups  
- **One-Click Resolution**: Choose conflict winners with immediate visual feedback
- **Route Renaming**: Rename conflicted routes directly in the interface
- **Config Management**: View, edit, and download nginx config files  
- **Live Reload**: Refresh configurations and see changes immediately
- **Collapsible Cards (🆕)** and **Sticky Header (🆕)** for faster navigation
- **Filter Enhancements (🆕)**: search by status codes and targets

### Persistence

All conflict resolution decisions are saved to `.artifacts/route-resolutions.json` and persist across proxy restarts. This ensures consistent behavior in team environments.

### API Endpoints

Programmatic access for advanced workflows:

```bash
# View config file
GET /api/config/myapp.conf

# Save config file  
POST /api/config/myapp.conf

# Resolve conflict (choose winner)
POST /api/resolve-conflict
{"route": "/api/", "winner": "myapp.conf"}

# Rename route in config
POST /api/rename-route  
{"oldRoute": "/api/", "newRoute": "/myapp-api/", "configFile": "myapp.conf"}
```

## Connectivity tests (localhost and ngrok)

Generic tests verify that configured apps are reachable through the dev proxy on localhost and via ngrok. Tests auto-discover routes from Nginx app configs and perform best-effort auto-fixes for common misconfigurations. Artifacts are written under `.artifacts/reports`.

Run:

```bash
node ./test/run.js        # deep health for a specific page
node ./test/scanApps.js   # generic scanner for all configured routes
```

Outputs:

- JSON reports under `.artifacts/reports/` and visible at `/reports/`
  - Latest shortcuts: `/status.json` (health-latest), `/routes.json` (scan-apps-latest)

Notes:

- Localhost checks hit `http://localhost:8080`.
- Ngrok URL is auto-discovered from the `dev-ngrok` container (4040 API or logs). If not found, ngrok checks are marked `no_ngrok_url`.
- Tests only verify app routes discovered from files in `apps/`.
- If an app is down, it won’t block checks for other apps.

### What the tests check

- Asset availability (2xx, non-empty, no HTML for JS/CSS)
- API discovery from HTML/JS and checks for both bare `/api/*` and prefixed `/myapp/api/*`
- Websocket upgrade for HMR paths
- Ownership conflicts (e.g., `/api` owned by another app)

## Testing

### Backend diagnostics

Run health and route scans (Dockerized, uses `LOCAL_PROXY_BASE` if set):

```bash
docker run --rm --network devproxy \
  -e LOCAL_PROXY_BASE=http://dev-proxy \
  -v "$PWD":/app -w /app node:18-alpine \
  sh -lc 'node test/run.js && node test/scanApps.js'
```

Artifacts:
- `.artifacts/reports/health-*.{json,md}`, latest aliases `health-latest.*`
- `.artifacts/reports/scan-apps-*.json`, latest alias `scan-apps-latest.json`

### UI tests (Playwright)

Run a headless browser pass that captures screenshots, console logs (warn/error), computed styles, traces and videos on failure:

```bash
mkdir -p .artifacts/ui
docker run --rm --network devproxy \
  -e UI_BASE_URL=http://dev-proxy \
  -v "$PWD":/work -w /work/test/ui \
  mcr.microsoft.com/playwright:v1.46.0-jammy \
  bash -lc 'npm install --no-audit --no-fund && npx playwright install --with-deps && npm test'
``;

Artifacts: `.artifacts/ui/` (screenshots, attached JSON for styles and console; traces/videos on failure)

## Examples

- `examples/sample-prefix-app.conf` — App served under `/myapp/` (keeps prefix)
- `examples/sample-root-api-strip.conf` — API mounted at `/api/` (strips prefix)
- `examples/next/` — Full example for Next.js basePath pattern (compose overlay + nginx snippet)

## Nginx Configuration Patterns

### Dynamic Upstream Resolution

All example configurations use nginx variables for upstream resolution to ensure reliable startup:

```nginx
location /myapp/ {
  # Use variable for dynamic upstream resolution
  set $upstream_app "myapp:3000";
  proxy_pass http://$upstream_app;
  # ... other directives
}
```

**Why variables?** Nginx performs DNS resolution at startup when using hardcoded upstreams like `proxy_pass http://myapp:3000`. If the service isn't running, nginx fails to start. Using variables defers DNS lookups until runtime, allowing the proxy to start successfully and gracefully handle unavailable upstreams.

### Common Headers

All configurations include essential proxy headers:
- **WebSocket support**: `Upgrade` and `Connection` headers for HMR and real-time features
- **Forwarding context**: `X-Forwarded-Proto`, `X-Forwarded-Host` for proper URL generation
- **Development helpers**: `ngrok-skip-browser-warning` to bypass ngrok's browser warning

### Resolver Configuration

When using variables, include the Docker DNS resolver:

```nginx
resolver 127.0.0.11 ipv6=off;
resolver_timeout 5s;
```

This enables nginx to resolve Docker service names dynamically within the `devproxy` network.

## Repo hygiene

- App-specific names have been removed from core code. The included demo service lives under `dashboard/` only for local testing. You can remove it entirely and still use the proxy.
- Status UI lives under `status/` and serves its own assets.
- All app snippets are local-only (ignored by git). Use `examples/` as templates.

### Next.js basePath pattern (summary)

Run two dev instances from the same codebase:
- Local dev at `/` (no basePath)
- A second instance with `NEXT_PUBLIC_BASE_PATH=/myapp` and `NEXT_DIST_DIR=.next-myapp`, exposed only to the devproxy network

Mount the second instance at `/myapp` in the proxy and do not strip the prefix. See `examples/next/` for the compose overlay and nginx snippet.

## Project layout

```
dev-tunnel-proxy/
├─ apps/                     # per-app snippets (local, gitignored)
├─ overrides/                # proxy-owned override snippets (optional)
├─ build/
│  └─ sites-enabled/
│     └─ apps.generated.conf # composed output (mounted into nginx)
├─ config/
│  ├─ default.conf           # core: includes apps/*.conf
│  ├─ ngrok.dynamic.yml      # dynamic domain template
│  └─ ngrok.yml              # (legacy, replaced by entrypoint)
├─ examples/
│  ├─ sample-prefix-app.conf
│  └─ sample-root-api-strip.conf
├─ scripts/
│  ├─ install-app.sh
│  ├─ ngrok-entrypoint.sh    # conditional static/dynamic domain
│  ├─ reload.sh
│  └─ smart-build.sh
├─ docker-compose.yml
├─ .env.example
├─ .gitignore
├─ .dockerignore
└─ LICENSE
```

## Notes
- Never commit your ngrok authtoken. Use env vars or a local `.env` file.
- Keep app snippets **app-specific**. No cross-references to other apps.
- WebSockets/HMR: all example snippets include the required headers.
- **App configs are git-ignored** - Each project manages its own `apps/*.conf` files locally.

## Documentation

- **[Project Integration Guide](PROJECT-INTEGRATION.md)** - Step-by-step setup for new projects
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Common issues and solutions
- **[Config Composition & Precedence](docs/CONFIG-COMPOSITION.md)** - How the generator works, migration notes, overrides

## Inspiration: Calliope

Calliope is named in honor of the author's daughter, who lives with tuberous sclerosis complex (TSC). Her resilience, kindness, and youthful spirit inspire this project's mission: a caring AI assistant who proactively keeps your dev environment healthy so you can focus on building and sharing amazing things.

Like her namesake, Calliope approaches problems with empathy, persistence, and a genuine desire to help. She doesn't just diagnose issues - she fixes them herself, learns from each success, and celebrates when everything works perfectly.

If you feel inspired by Calliope's caring approach to development support, please consider supporting families affected by TSC by donating to the TSC Alliance: https://www.tscalliance.org/

## How to contribute

1. **Add your app**: Create a snippet in `examples/` following the patterns shown
2. **Install**: Use `./scripts/install-app.sh <name> <path>` to add your app
3. **Test**: Ensure your app joins the `devproxy` network and works through the tunnel
4. **Share**: Submit a PR with your example snippet for others to use

Keep examples generic and focused on common patterns (prefix-kept vs prefix-stripped). **Always use variable resolution** for upstream services to ensure reliable proxy startup.

**Note**: App configs in `apps/` are git-ignored to keep the project generic. Each team manages their own configurations locally.

## Architecture: Why Separate Containers?

The Dev Tunnel Proxy uses a **multi-container architecture** instead of consolidating everything into a single container. Here's the rationale behind this design:

### Container Responsibilities

- **`dev-proxy` (nginx)**: Pure reverse proxy + static file serving
- **`conflict-api` (Node.js)**: REST API for config management and conflict resolution
- **`auto-scan` (Node.js)**: Periodic route health monitoring and status generation
- **`ngrok`**: Secure tunnel service to external networks

### Why This Approach Works Better

#### 🎯 **Single Responsibility Principle**
Each container has a focused, well-defined purpose:
- nginx excels at high-performance proxying and static content
- Node.js services handle dynamic APIs and background processing
- ngrok provides specialized tunnel functionality

#### 🚀 **Operational Benefits**
```bash
# Restart just the API without affecting proxy traffic
docker-compose restart conflict-api

# Debug individual services independently
docker-compose logs conflict-api --tail=50

# Scale specific services if needed
docker-compose up --scale auto-scan=2
```

#### 📊 **Resource Optimization**
- **nginx**: Minimal footprint (~5MB alpine), optimized for proxy workloads
- **Node.js services**: Only consume resources when actively processing
- **Independent lifecycles**: Can start/stop services without affecting others

#### 🔧 **Fault Isolation**
- Conflict API crash → Status UI loses some features, but proxy continues working
- Auto-scan failure → Health monitoring affected, but routing unimpacted
- nginx issues → Only proxy affected, APIs remain functional for diagnostics

#### 🏗️ **Development Flexibility**
- Change API logic without nginx config reloads
- Modify nginx configuration without Node.js service restarts
- Each service can use optimized Docker images and configurations

#### 🎭 **Environment Adaptation**
```yaml
# Easily disable development-only services in production
services:
  conflict-api:
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
    command: ["sh", "-c", "node /conflict-api.js & nginx"]
```

However, the **multi-container approach provides superior flexibility** without meaningful complexity overhead, making it the better choice for development environments where reliability and maintainability are paramount.
