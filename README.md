# Dev Tunnel Proxy

A standalone, reusable **Dev Tunnel Proxy** (development proxy + ngrok tunnel) for teams.
- Tiny **core** Nginx config that `include`s one file per app from `apps/`.
- Separate **ngrok** container tunnels to the proxy.
- Each app contributes exactly **one** snippet (e.g., `sample-prefix.conf`, `sample-api.conf`). No monolithic config to edit.
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

7) Built-in status endpoints (human + JSON):
   - Human: `/` → `/status`, `/health`
   - JSON: `/status.json`, `/health.json`, `/routes.json`, `/ngrok.json`
   - Reports browser: `/reports/`

## Local vs Tunnel path strategy

- **Local**: run apps at `/` (no basePath) for ergonomics.
- **Tunnel**: enable a prefix (e.g., `/myapp`) only when going through this proxy.
  - For Next.js, gate `basePath`/`assetPrefix` behind an env var (e.g., `BEHIND_PROXY=1`).

## Scripts

- `scripts/install-app.sh` — copies a snippet into `apps/<name>.conf` and hot-reloads Nginx.
- `scripts/reload.sh` — safe Nginx reload.
- `scripts/smart-build.sh` — convenience wrapper to start/stop, install app snippets, and show logs.

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
├─ apps/                     # per-app snippets live here (mounted read-only)
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

## How to contribute

1. **Add your app**: Create a snippet in `examples/` following the patterns shown
2. **Install**: Use `./scripts/install-app.sh <name> <path>` to add your app
3. **Test**: Ensure your app joins the `devproxy` network and works through the tunnel
4. **Share**: Submit a PR with your example snippet for others to use

Keep examples generic and focused on common patterns (prefix-kept vs prefix-stripped). **Always use variable resolution** for upstream services to ensure reliable proxy startup.

**Note**: App configs in `apps/` are git-ignored to keep the project generic. Each team manages their own configurations locally.
