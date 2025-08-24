# dev-tunnel-proxy

A standalone, reusable **development proxy + ngrok tunnel** for teams.
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

## Local vs Tunnel path strategy

- **Local**: run apps at `/` (no basePath) for ergonomics.
- **Tunnel**: enable a prefix (e.g., `/myapp`) only when going through this proxy.
  - For Next.js, gate `basePath`/`assetPrefix` behind an env var (e.g., `BEHIND_PROXY=1`).

## Scripts

- `scripts/install-app.sh` — copies a snippet into `apps/<name>.conf` and hot-reloads Nginx.
- `scripts/reload.sh` — safe Nginx reload.
- `scripts/smart-build.sh` — convenience wrapper to start/stop, install app snippets, and show logs.

## Examples

- `examples/sample-prefix-app.conf` — App served under `/myapp/` (keeps prefix)
- `examples/sample-root-api-strip.conf` — API mounted at `/api/` (strips prefix)

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

## How to contribute

1. **Add your app**: Create a snippet in `examples/` following the patterns shown
2. **Install**: Use `./scripts/install-app.sh <name> <path>` to add your app
3. **Test**: Ensure your app joins the `devproxy` network and works through the tunnel
4. **Share**: Submit a PR with your example snippet for others to use

Keep examples generic and focused on common patterns (prefix-kept vs prefix-stripped).

**Note**: App configs in `apps/` are git-ignored to keep the project generic. Each team manages their own configurations locally.
