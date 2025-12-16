## Storybook + Vite through the Encast dev proxy (with ngrok)

This guide captures the working configuration and lessons learned to run Storybook (Vite builder) under the proxy at `/sdk` and via ngrok, with HMR working and Vite virtual module paths handled correctly.

### Goals
- Serve Storybook at `/sdk/*` through the dev proxy and optionally via ngrok
- Preserve Vite HMR and special routes (`/@vite`, `/@id`, optional `/@fs`)
- Avoid 5xx from Nginx when proxying colon-bearing virtual module URLs (e.g., `__x00__virtual:`)

---

## Nginx configuration (dev-proxy)

Key principles:
- Use static upstreams for Vite internals (no resolver, no variable upstreams, no Referer/Origin)
- Route `/sdk/@id|@vite|@fs` back to root pass-throughs using `rewrite ... last`
- For normal `/sdk/*`, strip the prefix and forward the rewritten `$uri$is_args$args`

Place these blocks in the active Nginx config inside the `dev-proxy` container (typically `/etc/nginx/conf.d/default.conf`).

1) Root pass-throughs (minimal and static):

```nginx
location ^~ /@id/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;
  proxy_pass http://sdk:6006;
}

location ^~ /@vite/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;
  proxy_pass http://sdk:6006;
}

# Optional: expose file-system paths when needed by Vite
location ^~ /@fs/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 86400;
  proxy_pass http://sdk:6006;
}
```

2) Canonical `/sdk` handler (hybrid):

```nginx
location ^~ /sdk/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 86400;

  # Collapse malformed double-@id shape inside /sdk
  rewrite ^/sdk/(@id)/__x00__/@id/__x00__virtual:(/.*)$ /sdk/$1/__x00__virtual:$2 break;

  # Vite internals: jump OUT of /sdk to root pass-throughs
  rewrite ^/sdk/@(id|vite|fs)/(.*)$ /@$1/$2 last;

  # Everything else under /sdk → strip prefix and forward final $uri (+ query)
  rewrite ^/sdk/(.*)$ /$1 break;
  set $upstream_uri $uri$is_args$args;
  proxy_pass http://sdk:6006$upstream_uri;
}
```

Diagnostics to capture when troubleshooting:
- Active config: `docker exec dev-proxy nginx -T | sed -n '1,200p'`
- Error log around special paths: `docker exec dev-proxy sh -lc "grep -nE '__x00__|@vite|@id' -n /var/log/nginx/error.log | tail -n 80"`
- Verbose curl for failing URL (example): `curl -v http://localhost:8080/sdk/@id/__x00__/...`

---

## Storybook + Vite configuration

Edit `.storybook/main.ts` (`viteFinal`) with:

- Base and HMR
  - `base: isProd ? '/sdk/' : '/'`
  - Only steer HMR when proxied (PUBLIC_BASE_PATH === '/sdk/'):
    - `server.hmr = { path: '/sdk/@vite', clientPort, host: ngrokHost?, protocol: wss? }`

- Server allowlist
  - `allowedHosts: ['.ngrok.app', 'localhost', 'app2-sdk', 'proxy']`

- Resolve and pre-bundle nudges
  - `resolve.mainFields = ['module','browser','main']`
  - `resolve.dedupe = ['react','react-dom','react/jsx-runtime','@mui/material','@mui/system','@mui/utils','@emotion/react','@emotion/styled']`
  - `optimizeDeps.exclude = ['@mui/system','@mui/material','@mui/utils']`

- Dev-only middleware to normalize malformed virtual-module paths

```ts
const collapseDoubleAtId = (): Plugin => ({
  name: 'collapse-double-at-id',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url) return next();
      const originalUrl = req.url;
      if (originalUrl.includes('/@id/__x00__/@id/__x00__')) {
        req.url = originalUrl.replace('/@id/__x00__/@id/__x00__', '/@id/__x00__');
        try { res.setHeader('X-SB-Collapsed-Double-AtId', '1'); } catch {}
      }
      next();
    });
  },
});
```

Include `collapseDoubleAtId()` first in `plugins` so it runs before other middleware.

---

## Dependencies (avoid interop traps)

Pin all MUI v5 packages to a single minor:
- `@mui/material`, `@mui/system`, `@mui/icons-material`, `@mui/utils`, `@mui/private-theming` → `5.17.1`
- `@mui/x-date-pickers` → 5.x (e.g. `^5.0.20`)

Do not override non-existent versions (e.g., `@mui/styled-engine@5.17.1` is invalid). After pinning, hard-clear caches:
- Remove `node_modules/.cache/storybook`, `node_modules/.vite`, `.vite`, `storybook-static`
- Reinstall and restart Storybook

If you still hit `interopRequireDefault` or named-export errors:
- Keep the pins and excludes above
- Optionally alias only problematic paths, e.g. `@mui/system/colorManipulator → @mui/system/esm/colorManipulator.js`

---

## Smoke checks

Run these after restarts:

```bash
# Direct
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:6006/iframe.html
curl -s -D - -o /dev/null "http://localhost:6006/@id/__x00__/@id/__x00__virtual:/@storybook/builder-vite/vite-app.js" | awk '/^HTTP\//{print $2}'

# Proxy
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/sdk/iframe.html
curl -s -D - -o /dev/null "http://localhost:8080/sdk/@id/__x00__/@id/__x00__virtual:/@storybook/builder-vite/vite-app.js" | awk '/^HTTP\//{print $2}'

# Ngrok (if configured)
curl -s -o /dev/null -w "%{http_code}\n" -k https://<your-ngrok-domain>/sdk/iframe.html
curl -s -D - -o /dev/null -k "https://<your-ngrok-domain>/sdk/@id/__x00__/@id/__x00__virtual:/@storybook/builder-vite/vite-app.js" | awk '/^HTTP\//{print $2}'
```

All should return 200. For the malformed path, if normalization middleware ran, look for the `X-SB-Collapsed-Double-AtId: 1` response header.

---

## Troubleshooting checklist

- 5xx on `/sdk/@id/...` via proxy:
  - Confirm root `/@id` and `/@vite` are static pass-throughs (no resolver, no variable upstreams, no Referer/Origin)
  - Ensure `/sdk` handler uses `rewrite ... last` to re-enter root handlers for Vite internals
  - Use `$uri$is_args$args` when forwarding from `/sdk`

- Malformed double-`@id` URL in direct/dev:
  - Confirm the `collapseDoubleAtId` dev middleware is registered first

- HMR fails through ngrok:
  - Gate HMR only for proxy env, set `path: '/sdk/@vite'`, `clientPort` to public port, `host` to ngrok domain, `protocol: 'wss'` for https

- Runtime errors about MUI interop:
  - Pin all MUI v5 to one minor (e.g., 5.17.1)
  - `optimizeDeps.exclude` for `@mui/system`, `@mui/material`, `@mui/utils`
  - Clear caches and restart

---

## Rationale: why these choices work

- Static Nginx upstreams avoid resolution bugs for Vite’s colon-bearing virtual modules
- The `/sdk` hybrid handler reduces ambiguity by letting root `/@id|@vite|@fs` handle Vite internals, while keeping normal assets proxied under `/sdk`
- Dev middleware normalizes rare malformed double-`@id` requests without touching production builds
- Single-minor MUI pins and Vite pre-bundling hints stabilize ESM/CJS interop and prevent duplicated helpers

---

Maintainer note: If the integration system auto-generates Nginx blocks, ensure it writes the minimal static versions above for root `/@id` and `/@vite` so future deployments don’t regress.


