# Next.js behind a proxy path (basePath)

This example shows how to run a Next.js app behind a proxy path with proper basePath support, including handling of redirect loops and asset loading issues.

## Key Improvements (Learned from MXTK Integration)

### ✅ Redirect Loop Prevention
- **Uses regex `^/myapp/?$`** instead of rewrite rules to handle both `/myapp` and `/myapp/`
- **Splits `_next/` handling** into bare directory and file patterns to prevent 308 redirects
- **Proper trailing slash handling** throughout all location blocks

### ✅ Asset Loading Support  
- **BasePath-aware assets**: Prefer basePath/assetPrefix configuration in-app over proxy root exceptions
- **Comprehensive header forwarding** including `X-Forwarded-Prefix` for proper basePath behavior
- **Resolver configuration** with Docker DNS for reliable service discovery

## Why This Approach
- Next.js must know its base path at build/dev time to emit correct URLs
- Proxy configuration must avoid redirect loops that break HMR and asset loading
- Root-level assets need special handling when apps reference them without basePath prefix

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

## Improved Dev Proxy Configuration

Install `examples/next/myapp.conf` using the API endpoint (recommended):

```javascript
// Using fetch API
fetch('http://dev-proxy:8080/api/apps/install', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'next',
    content: fs.readFileSync('examples/next/myapp.conf', 'utf8')
  })
});
```

Or use the provided example script:
```bash
node examples/api-upload-config.js next examples/next/myapp.conf
```

> [!NOTE]
> The legacy approach using `./scripts/install-app.sh` is deprecated and will be removed in a future version. 

### Key Configuration Patterns:

**1. Handle Route Variants (Prevents Redirect Loops)**
```nginx
# Use regex instead of rewrite to avoid redirect conflicts
location ~ ^/myapp/?$ {
  # ... headers and settings
  proxy_pass http://$myapp_upstream/myapp;  # no trailing slash
}
```

**2. Split _next/ Handling (Prevents 308 Redirects)**  
```nginx
# Handle bare directory
location = /myapp/_next/ {
  proxy_pass http://$myapp_upstream/myapp/_next;  # no trailing slash!
}

# Handle specific files with capture group
location ~ ^/myapp/_next/(.+)$ {
  proxy_pass http://$myapp_upstream/myapp/_next/$1;
}
```

**3. Root-Level Assets**
- Avoid adding root exceptions like `/icons/` or `/robots.txt` in the proxy. Configure your app to respect basePath and serve assets under the prefix.

## App adjustments
- Prefer `next/link` and `next/image` so basePath is respected.
- Avoid `<img src="/...">` with root paths; use Next’s helpers or relative paths.
- If your API lives at `/api`, do not prefix it in the app (keep `/api/*`). Route `/api/*` separately in the proxy.

## Verification Steps

### 1. Basic Functionality  
```bash
# Both variants should work without redirects
curl -I http://localhost:8080/myapp     # Should be 200, not 301/308
curl -I http://localhost:8080/myapp/    # Should be 200, not redirect

# Assets should load correctly  
curl -I http://localhost:8080/myapp/_next/static/chunks/webpack.js  # Should be 200
```

### 2. Common Issues to Check
```bash
# These should NOT return redirect loops (308/301)
curl -I http://localhost:8080/myapp/_next/     # Should be 200 or 404, not 308
# Root-level assets should be avoided; prefer /myapp/icons/ via app basePath
```

### 3. Development Features
- **HMR should connect** and update without full reloads
- **Browser dev tools** should show no 404s for assets
- **Both localhost:8080 and ngrok URL** should work identically

### 4. Common Problems Fixed
- ❌ **Redirect loops** from competing nginx rules  
- ❌ **308 Permanent Redirects** on `/_next/` directory
- ❌ **Missing root assets** like `/icons/` or `/robots.txt`
- ❌ **Broken HMR** due to WebSocket connection issues
