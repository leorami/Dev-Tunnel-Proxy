# Project Integration Guide

Quick guide for integrating your app with the dev tunnel proxy.

## Prerequisites

1. **Docker Compose setup**: Your app should run in containers
2. **Shared network**: Join the `devproxy` Docker network
3. **Stable container names**: Use consistent naming across environments

## Integration Steps

### 1. Update Your Docker Compose

Add the shared network to your `docker-compose.yml`:

```yaml
services:
  your-app:
    # ... your service configuration
    networks:
      - devproxy

networks:
  devproxy:
    external: true
    name: devproxy
```

### 2. Create Nginx Configuration

Create a configuration file following this template:

```nginx
# Replace "myapp" with your app's route prefix
# Replace "your-service:3000" with actual container name and port

location = /myapp {
  return 301 /myapp/;
}

location /myapp/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  
  # WebSocket support for HMR
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  
  # Development helpers
  proxy_set_header ngrok-skip-browser-warning "true";
  proxy_buffering off;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  
  # CRITICAL: Use variables for upstream resolution
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $your_app_upstream your-service:3000;
  proxy_pass http://$your_app_upstream/;
}
```

### 3. Install Your Configuration

```bash
# From the dev-tunnel-proxy directory
./scripts/install-app.sh myapp path/to/your-app.conf
```

### 4. Configure Your App for Proxy Usage

Your app needs configuration to work correctly behind a proxy. Here are common patterns:

#### React/Create React App Configuration

**Environment Variables:**
```bash
# ❌ Wrong - Hardcoded localhost won't work through proxy
REACT_APP_API_URL=http://localhost:8000

# ✅ Correct - Use relative paths that work through proxy
REACT_APP_API_URL=/api
PUBLIC_URL=/myapp
```

**Code Changes:**
```javascript
// ❌ Wrong: Hardcoded absolute URLs
const API_BASE = 'http://localhost:8000';

// ✅ Correct: Environment-aware configuration
const API_BASE = process.env.REACT_APP_API_URL || '/api';

// ✅ Alternative: Always use relative paths
const API_BASE = '/api';
```

#### Storybook Configuration

**For subpath deployment (e.g., `/storybook`):**
```javascript
// .storybook/main.js
module.exports = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  
  viteFinal: async (config) => {
    // Configure for subpath deployment
    if (process.env.STORYBOOK_BASE_PATH) {
      config.base = process.env.STORYBOOK_BASE_PATH;
    }
    
    // Handle WebSocket connections through proxy
    if (process.env.PROXY_MODE) {
      config.server = config.server || {};
      config.server.hmr = {
        port: 443,
        clientPort: 443
      };
    }
    
    return config;
  },
};
```

**Environment Variables:**
```bash
STORYBOOK_BASE_PATH=/storybook
PROXY_MODE=true
```

#### Generic Web App Best Practices

**API Calls:**
```javascript
// Use relative paths for API calls
const response = await fetch('/api/data'); // ✅ Works through proxy
const badResponse = await fetch('http://localhost:3000/api/data'); // ❌ Fails
```

**Asset References:**
```html
<!-- ❌ Wrong: Absolute paths from root -->
<img src="/images/logo.png">

<!-- ✅ Correct: Relative paths -->
<img src="./images/logo.png">
```

**Hash Routing:**
```javascript
// Ensure hash routing works correctly behind proxy
const router = new HashRouter({
  basename: process.env.PUBLIC_URL || '/'
});
```

### 5. Framework-Specific Proxy Configuration

#### Next.js with basePath

If using Next.js with a `basePath`, use this configuration instead:

```nginx
# Handle both /myapp and /myapp/ variants
location ~ ^/myapp/?$ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Prefix /myapp;
  proxy_set_header ngrok-skip-browser-warning "true";
  proxy_buffering off;
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $your_nextjs_app your-nextjs-service:2000;
  proxy_pass http://$your_nextjs_app/myapp;
}

# Handle Next.js HMR and assets
location /myapp/_next/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Prefix /myapp;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $your_nextjs_app your-nextjs-service:2000;
  proxy_pass http://$your_nextjs_app/myapp/_next/;
}

# Handle sub-routes
location ~ ^/myapp/.+ {
  # ... same headers as above
  proxy_pass http://$your_nextjs_app;
}
```

#### React/Vue SPA

For single-page applications:

```nginx
location /myapp/ {
  # Standard headers (see template above)
  
  # Handle client-side routing
  try_files $uri $uri/ @myapp_fallback;
  
  set $your_spa_upstream your-spa-service:3000;
  proxy_pass http://$your_spa_upstream/;
}

location @myapp_fallback {
  set $your_spa_upstream your-spa-service:3000;
  proxy_pass http://$your_spa_upstream/;
}
```

## Testing Your Integration

### 1. Basic Connectivity
```bash
# Test direct container access
docker exec dev-proxy wget -qO- http://your-service:3000/

# Test through proxy
curl http://localhost:8080/myapp/

# Test through tunnel
curl https://your-ngrok-domain.ngrok.app/myapp/
```

### 2. Run Automated Tests
```bash
# From dev-tunnel-proxy directory
node ./test/scanApps.js
```

### 3. Check Logs
```bash
docker-compose logs proxy --tail=20
```

## Common Mistakes to Avoid

❌ **Don't hardcode upstream hosts**
```nginx
proxy_pass http://myapp:3000/;  # Will fail if container is down
```

✅ **Always use variables**
```nginx
set $myapp_upstream myapp:3000;
proxy_pass http://$myapp_upstream/;
```

❌ **Don't forget the resolver**
```nginx
set $myapp_upstream myapp:3000;  # Won't work without resolver
proxy_pass http://$myapp_upstream/;
```

✅ **Include Docker DNS resolver**
```nginx
resolver 127.0.0.11 ipv6=off;
resolver_timeout 5s;
set $myapp_upstream myapp:3000;
proxy_pass http://$myapp_upstream/;
```

❌ **Don't use generic container names**
```nginx
set $app myapp:3000;  # Generic name, likely wrong
```

✅ **Use actual container names**
```nginx
set $myapp_service myapp-site-dev-myapp:3000;  # Actual container name
```

## Getting Help

1. **Check existing examples** in `examples/` directory
2. **Review troubleshooting guide**: `TROUBLESHOOTING.md`  
3. **Run connectivity tests**: `node ./test/scanApps.js`
4. **Check container names**: `docker network inspect devproxy`

## Template Files

Save these templates for quick setup:

- **Basic app**: `examples/sample-prefix-app.conf`
- **API with prefix stripping**: `examples/sample-root-api-strip.conf`
- **Next.js with basePath**: `examples/next/myapp.conf`
