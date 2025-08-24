# dev-tunnel-proxy

A standalone, reusable **development proxy + ngrok tunnel** for teams.
- Tiny **core** Nginx config that `include`s one file per app from `apps/`.
- Separate **ngrok** container tunnels to the proxy.
- Each app contributes exactly **one** snippet (e.g., `encast.conf`, `mxtk.conf`). No monolithic config to edit.
- All apps that should be exposed join the shared Docker network: **`devproxy`**.

## Quick start

1) Set your ngrok token (or copy `.env.example` to `.env` and fill it):
   ```bash
   export NGROK_AUTHTOKEN=YOUR_TOKEN
   ```

2) (Optional) If you own a reserved ngrok domain, set `NGROK_DOMAIN` in `.env` and uncomment `hostname` in `config/ngrok.yml`.

3) Bring up the proxy + ngrok:
   ```bash
   docker compose up -d
   ```

4) Install app routes (from the dev-tunnel-proxy repo root):
   ```bash
   ./scripts/install-app.sh encast ./examples/encast.conf
   ./scripts/install-app.sh mxtk   ./examples/mxtk.conf
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
   Your routes (e.g., `/impact`, `/api`, `/mxtk`) should work immediately.

## Local vs Tunnel path strategy

- **Local**: run apps at `/` (no basePath) for ergonomics.
- **Tunnel**: enable a prefix (e.g., `/mxtk`) only when going through this proxy.
  - For Next.js, gate `basePath`/`assetPrefix` behind an env var (e.g., `MXTK_BEHIND_PROXY=1`).

## Scripts

- `scripts/install-app.sh` — copies a snippet into `apps/<name>.conf` and hot-reloads Nginx.
- `scripts/reload.sh` — safe Nginx reload.
- `scripts/smart-build.sh` — convenience wrapper to start/stop, install app snippets, and show logs.
- `scripts/setup-mxtk-site.sh` — helper to install an MXTK snippet with configurable container name, port, and prefix (`/mxtk` by default).

## Project layout

```
dev-tunnel-proxy/
├─ apps/                     # per-app snippets live here (mounted read-only)
├─ config/
│  ├─ default.conf           # core: includes apps/*.conf
│  └─ ngrok.yml              # tunnels to proxy
├─ examples/
│  ├─ encast.conf
│  └─ mxtk.conf
├─ scripts/
│  ├─ install-app.sh
│  ├─ reload.sh
│  ├─ smart-build.sh
│  └─ setup-mxtk-site.sh
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
