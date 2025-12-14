# Nginx Configuration Examples

This directory contains example configurations for different types of applications commonly used with the dev tunnel proxy.

## Available Examples

### Core Examples
- **`sample-prefix-app.conf`** - Basic app that expects path prefix preserved
- **`sample-root-api-strip.conf`** - API service that expects prefix stripped

### Framework-Specific Examples  
- **`react-spa.conf`** - React/Create React App single-page application
- **`storybook.conf`** - Storybook/documentation site configuration
- **`api-with-prefix.conf`** - API service that handles its own routing
- **`next/`** - Next.js with basePath configuration

## How to Use

1. **Copy the relevant example** to your app configuration:
   ```bash
   cp examples/react-spa.conf apps/myapp.conf
   ```

2. **Customize the configuration**:
   - Replace `myapp` with your actual app path
   - Update container names to match your services
   - Adjust ports and endpoints as needed

3. **Install the configuration using the API endpoint** (recommended):
   ```javascript
   // Using fetch API
   fetch('http://dev-proxy:8080/api/apps/install', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       name: 'myapp',
       content: fs.readFileSync('apps/myapp.conf', 'utf8')
     })
   });
   ```

   Or use the provided example script:
   ```bash
   node examples/api-upload-config.js myapp apps/myapp.conf
   ```

   > [!NOTE]
   > The legacy approach using `./scripts/install-app.sh` is deprecated and will be removed in a future version.

## Key Configuration Patterns

### ⚠️ Reserved Root Path (Critical)

**Apps are FORBIDDEN from defining `location = /`.**

The root path is exclusively reserved for the Dev Tunnel Proxy landing page and cannot be used by any application configuration.

```nginx
# ❌ FORBIDDEN - Will be automatically blocked
location = / {
  proxy_pass http://my-app:3000;
}

# ✅ CORRECT - Use your app's namespaced path
location ^~ /myapp/ {
  proxy_pass http://my-app:3000/;
}
```

**Reserved proxy paths to avoid:**
- `/` (landing page) - **FORBIDDEN**
- `/status`, `/health`, `/reports`, `/dashboard` - UI endpoints
- `/api/ai/*`, `/api/config/*`, `/api/apps/*` - API endpoints

See [CONFIG-MANAGEMENT-GUIDE.md](../docs/CONFIG-MANAGEMENT-GUIDE.md#reserved-paths---root-path-restriction) for complete details.

### Dynamic Upstream Resolution (Required)
All examples use nginx variables to prevent startup failures:
```nginx
resolver 127.0.0.11 ipv6=off;
resolver_timeout 5s;
set $myapp_upstream myapp-service:3000;
proxy_pass http://$myapp_upstream;
```

### proxy_pass Trailing Slash Behavior
**Critical difference**:
- `proxy_pass http://upstream;` - Preserves path prefix
- `proxy_pass http://upstream/;` - Strips path prefix

Choose based on whether your app expects the prefix or not.

### Essential Headers
All configurations include:
- **Host forwarding**: `proxy_set_header Host $host;`
- **Protocol detection**: `proxy_set_header X-Forwarded-Proto $scheme;`  
- **WebSocket support**: `Upgrade` and `Connection` headers
- **Development helpers**: `ngrok-skip-browser-warning`

## Choosing the Right Example

| App Type | Example | When to Use |
|----------|---------|------------|
| React SPA | `react-spa.conf` | Single-page app with client-side routing |
| Next.js | `next/myapp.conf` | Next.js with basePath configuration |
| API Service | `api-with-prefix.conf` | REST API that handles its own routing |
| Storybook | `storybook.conf` | Component library documentation |
| Generic Web App | `sample-prefix-app.conf` | Basic web application |

## Testing Your Configuration

After installing a configuration:

1. **Test nginx syntax**:
   ```bash
   docker exec dev-proxy nginx -t
   ```

2. **Reload configuration**:
   ```bash
   ./scripts/reload.sh
   ```

3. **Test connectivity**:
   ```bash
   curl http://localhost:8080/myapp/
   ```

4. **Run automated tests**:
   ```bash
   node ./test/scanApps.js
   ```

## Common Issues

- **Container name mismatches**: Use `docker network inspect devproxy` to verify names
- **Missing resolver**: All variable-based configs need the Docker DNS resolver
- **Wrong trailing slash**: Check whether your app expects prefix preserved or stripped
- **Missing headers**: WebSocket and forwarding headers are required for full functionality

For detailed troubleshooting, see `../TROUBLESHOOTING.md`.
