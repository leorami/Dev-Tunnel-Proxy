# Next.js behind a proxy path (basePath)

This example shows how to run a second, basePath-aware Next.js dev instance and mount it at `/myapp` in the dev proxy without stripping the prefix.

## Why
- Next.js must know its base path at build/dev time to emit correct URLs.
- Rewriting HTML in the proxy is brittle. Keep `/myapp` intact end-to-end.

## Compose overlay
Use `docker-compose.overlay.yml` to run a dev instance with `NEXT_PUBLIC_BASE_PATH=/myapp` and a separate build dir:

```yaml
services:
  next_path:
    image: node:20-alpine
    working_dir: /app
    command: ["sh","-lc","corepack enable || true; npm i; npm run dev"]
    environment:
      - HOST=0.0.0.0
      - PORT=2000
      - NEXT_PUBLIC_BASE_PATH=/myapp
      - NEXT_DIST_DIR=.next-myapp
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next-myapp
    expose:
      - "2000"
    networks:
      - default
      devproxy:
        aliases: [ myapp-app ]
```

## Dev proxy snippet
Install `examples/next/myapp.conf` into `apps/` (e.g., with `./scripts/install-app.sh next examples/next/myapp.conf`). It keeps the `/myapp` prefix and enables HMR:

```nginx
location = /myapp { rewrite ^ /myapp/ last; }
location ^~ /myapp/_next/ {
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  set $myapp_upstream myapp-app:2000;
  proxy_pass http://$myapp_upstream/myapp/_next/;
}
location ^~ /myapp/ { 
  set $myapp_upstream myapp-app:2000;
  proxy_pass http://$myapp_upstream/myapp/; 
}
```

## App adjustments
- Prefer `next/link` and `next/image` so basePath is respected.
- Avoid `<img src="/...">` with root paths; use Next’s helpers or relative paths.
- If your API lives at `/api`, do not prefix it in the app (keep `/api/*`). Route `/api/*` separately in the proxy.

## Verify
- http://localhost:8080/myapp should serve the basePath-aware dev instance.
- HMR should connect and update without full reloads.
- Assets under `/_next/` should load with 200.
