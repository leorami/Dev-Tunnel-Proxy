# Configuration Management Guide

**Last Updated**: January 2026  
**Version**: 1.1

This guide covers configuration management, API endpoints, conflict resolution, and best practices for the Dev Tunnel Proxy.

---

## Table of Contents

1. [Reserved Paths](#reserved-paths)
2. [Configuration System](#configuration-system)
3. [API Endpoints](#api-endpoints)
4. [Route Conflicts](#route-conflicts)
5. [Route Promotion System](#route-promotion-system)
6. [Best Practices](#best-practices)
7. [Common Scenarios](#common-scenarios)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Usage](#advanced-usage)

---

## Reserved Paths

### ROOT PATH RESTRICTION

**IMPORTANT: Apps are FORBIDDEN from defining the root path (`location = /`).**

The root path is **exclusively reserved** for the Dev Tunnel Proxy's landing page and cannot be overridden by any application configuration.

#### Why This Restriction Exists

1. **Brand Identity**: The root path serves as the professional face of Dev Tunnel Proxy
2. **Documentation Hub**: Provides visitors with comprehensive information about the system
3. **Navigation**: Central point for accessing status dashboards, health endpoints, and GitHub
4. **Conflict Prevention**: Eliminates conflicts between apps trying to claim the root

#### What Happens If Apps Try to Define Root

If any app configuration file (`apps/*.conf` or `overrides/*.conf`) attempts to define `location = /`:

- ✅ **Automatic Blocking**: The configuration generator will silently skip the block
- ⚠️ **Warning Logged**: A clear warning message will be displayed:
  ```
  ⚠️  BLOCKED: Apps are FORBIDDEN from defining root path "location = /"
     The root path (/) is reserved for the Dev Tunnel Proxy landing page.
     Apps must use their own basePath (e.g., /myapp/).
  ```
- 🚫 **No Override Possible**: Even `overrides/` cannot override this restriction

#### Correct App Configuration

Apps must use their own base path prefix:

```nginx
# ❌ FORBIDDEN - Will be automatically blocked
location = / {
  proxy_pass http://my-app:3000;
}

# ✅ CORRECT - Use your app's base path
location = /myapp {
  return 301 /myapp/;
}

location ^~ /myapp/ {
  proxy_pass http://my-app:3000;
}
```

#### Reserved Proxy Paths

The following paths are reserved for proxy functionality:

- `/` - Landing page (FORBIDDEN to apps)
- `/status` - Status dashboard
- `/health` - Health check page
- `/reports` - Reports page
- `/dashboard` - Dashboard interface
- `/api/ai/` - Calliope AI endpoints
- `/api/config/` - Configuration API
- `/api/apps/` - Apps API
- `/api/overrides/` - Overrides API
- `/api/reports/` - Reports API
- `/health.json` - Health status JSON
- `/routes.json` - Routes configuration JSON
- `/status.json` - Status JSON
- `/.artifacts/` - Artifacts directory

Apps should avoid these paths and use their own namespaced paths (e.g., `/myapp/`, `/myservice/`, etc.).

---

## Configuration System

### Overrides, Composition, and Precedence

To prevent regressions when an app re-generates its own nginx snippet, the proxy no longer includes `apps/*.conf` directly. Instead, it composes a single generated file `build/sites-enabled/apps.generated.conf` from two sources:

- `apps/*.conf` — per-app, local, gitignored snippets managed by each app
- `overrides/*.conf` — proxy-owned, canonical snippets that must win when a route needs to be enforced

#### Precedence Rules

- **Overrides win**: If both an app file and an override define the same `location` (exact or normalized prefix), the override's block is emitted and the app is skipped for that route.
- **No hardcoding of app names**: Overrides should be minimal and generic when possible; only target the necessary `location` blocks.
- **Exact plus prefix can co-exist**: An exact match like `location = /myapp/` can live alongside a `location ^~ /myapp/` prefix. The composer keeps both.

#### Lifecycle and Safety Rails

- The generator runs on start/restart/reload (`scripts/smart-build.sh`, `scripts/reload.sh`).
- Nginx only loads the generated file, so app writes to `apps/` cannot overwrite canonical proxy behavior.
- Inspect the provenance header at the top of `apps.generated.conf` for the list of included app files and overrides.

#### When Should You Add an Override?

- A proxy-side fix must take precedence regardless of app changes.
- You need to neutralize an app-generated snippet that conflicts with proxy policy.
- You want a temporary shim while coordinating a fix in the app codebase.

### Recommended Workflow: Iterate → Promote

- Iterate in `apps/` while developing fixes. Ensure no file with the same name exists in `overrides/`, otherwise your app edits will be ignored for matching locations.
- Promote to `overrides/` once stable. Copy the finalized app snippet to `overrides/` so it becomes proxy-owned and always wins.
- Reload using `./scripts/reload.sh` (the generator runs automatically).

#### Commands

```bash
# Use app version during iteration
rm -f overrides/myapp.conf
./scripts/reload.sh

# When ready, promote to overrides (proxy-owned precedence)
cp -f apps/myapp.conf overrides/myapp.conf
./scripts/reload.sh

# Or use the API to promote without shell copy
curl -s -X POST http://localhost:3001/devproxy/api/overrides/promote \
  -H 'Content-Type: application/json' -d '{"filename":"myapp.conf"}' | jq
```

---

## API Endpoints

All API endpoints are served by the `dev-proxy-config-api` container on port 3001.

### Configuration Management

#### Install App Configuration

Allows apps to programmatically upload their Nginx configuration files to the proxy.

**Endpoint:** `POST /devproxy/api/apps/install`

**Request Body:**
```json
{
  "name": "app-name",
  "content": "# Nginx configuration content\nlocation ^~ /app-name/ {\n  proxy_pass http://app-container:3000/;\n}"
}
```

**Parameters:**
- `name`: (Required) The name of the app without the `.conf` extension. Must be alphanumeric with hyphens and underscores only.
- `content`: (Required) The Nginx configuration content as a string.

**Response:**
```json
{
  "ok": true,
  "installed": "app-name.conf"
}
```

**Error Responses:**
- `400 Bad Request`: If name or content is missing or invalid
- `422 Unprocessable Entity`: If the Nginx configuration fails validation
- `500 Internal Server Error`: For other errors

**Processing:**
1. The configuration is saved to the `apps/` directory as `{name}.conf`
2. The `hardenUpstreams.js` script is run to transform proxy_pass directives for resilience
3. The bundle is regenerated with `generateAppsBundle.js`
4. Nginx configuration is tested and reloaded

#### Create Route (Auto-Generate + Install) 🆕

**New in v1.1**: Automatically generates optimal nginx configuration with built-in safety rails.

**Endpoint:** `POST /devproxy/api/apps/create-route`

**Request Body:**
```json
{
  "name": "myapp",
  "basePath": "/myapp",
  "upstream": "http://myapp-container:3000",
  "options": {
    "redirect": true,
    "websockets": true,
    "forwardedPrefix": true
  },
  "install": true
}
```

**Parameters:**
- `name`: (Required) App name (alphanumeric, hyphens, underscores)
- `basePath`: (Required) Route path (auto-normalized to `/myapp/` format)
- `upstream`: (Required) Backend service URL (validated and normalized)
- `options`: (Optional) Configuration options:
  - `redirect`: Add trailing slash redirect (recommended: `true`)
  - `websockets`: Add WebSocket support headers for HMR (recommended: `true`)
  - `forwardedPrefix`: Add `X-Forwarded-Prefix` header for framework support
- `install`: (Optional) If `true`, immediately installs to proxy (default: `false`)

**Response:**
```json
{
  "ok": true,
  "config": "# Generated nginx configuration...",
  "installed": true,
  "filename": "myapp.conf",
  "downloadUrl": "/devproxy/api/apps/download/myapp.conf"
}
```

**Auto-Generated Features:**
1. **Base Path Normalization**:
   - Ensures leading slash: `myapp` → `/myapp`
   - Ensures trailing slash: `/myapp` → `/myapp/`
   - Result: Always `/myapp/` format

2. **Upstream URL Validation**:
   - Validates format (http:// or https://)
   - Ensures proper hostname and port
   - Adds trailing slash if missing

3. **Reserved Path Checking**:
   - Blocks `/`, `/status`, `/health`, `/api/*`, etc.
   - Returns error if path conflicts with proxy infrastructure

4. **Redirect Companion Block** (if `redirect: true`):
   ```nginx
   location = /myapp {
     return 301 /myapp/;
   }
   ```

5. **WebSocket Support** (if `websockets: true`):
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

6. **X-Forwarded-Prefix Header** (if `forwardedPrefix: true`):
   ```nginx
   proxy_set_header X-Forwarded-Prefix /myapp;
   ```

7. **Essential Proxy Headers** (Always Included):
   - Host, X-Real-IP, X-Forwarded-For
   - X-Forwarded-Proto, X-Forwarded-Host
   - ngrok-skip-browser-warning

8. **Resilient Upstreams**:
   - DNS resolver configuration
   - Variable-based proxy_pass
   - Proper timeouts

**UI Shortcut:**
Access via `/dashboard/#create-route` or click "Create Route" in the header or the plus icon in the Configured Apps card.

**Example Generated Config:**
```nginx
# myapp.conf
location = /myapp {
  return 301 /myapp/;
}

location ^~ /myapp/ {
  resolver 127.0.0.11 ipv6=off;
  resolver_timeout 5s;
  set $myapp_upstream myapp-container:3000;
  
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Prefix /myapp;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header ngrok-skip-browser-warning "true";
  
  proxy_read_timeout 300s;
  proxy_send_timeout 300s;
  
  proxy_pass http://$myapp_upstream/;
}
```

#### Promote App Configuration to Override

Promotes an existing app configuration to an override.

**Endpoint:** `POST /devproxy/api/overrides/promote`

**Request Body:**
```json
{
  "filename": "app-name.conf"
}
```

**Parameters:**
- `filename`: (Required) The filename of the app configuration to promote.

**Response:**
```json
{
  "ok": true,
  "promoted": "app-name.conf"
}
```

#### Get Configuration File

Retrieves the content of a configuration file.

**Endpoint:** `GET /devproxy/api/config/:file`

**Response:**
```json
{
  "file": "apps/app-name.conf",
  "content": "# Configuration content..."
}
```

#### Update Configuration File

Updates the content of an existing configuration file.

**Endpoint:** `POST /devproxy/api/config/:file`

**Request Body:**
```json
{
  "content": "# Updated configuration content..."
}
```

**Response:**
```json
{
  "ok": true,
  "file": "apps/app-name.conf"
}
```

#### Create Route (auto-generate + install)

Creates a best-practice nginx snippet for a base path, installs it into `apps/`, and returns the config so it can be downloaded.

**Endpoint:** `POST /devproxy/api/apps/create-route`

**Request Body:**
```json
{
  "name": "app-name",
  "basePath": "/app-name/",
  "upstream": "http://web:5173",
  "options": {
    "addRedirect": true,
    "websockets": true,
    "includePrefixHeader": true,
    "install": true
  }
}
```

**Response:**
```json
{
  "ok": true,
  "installed": "app-name.conf",
  "basePath": "/app-name/",
  "upstream": "http://web:5173/",
  "config": "# Auto-generated ...",
  "download": "/devproxy/api/config/app-name.conf"
}
```

**Behavior & Safety Rails**
- `basePath` is normalized to include a trailing slash and cannot be `/` or any reserved proxy path.
- Adds a `/path → /path/` redirect companion block when `options.addRedirect !== false`.
- Adds WebSocket headers and `X-Forwarded-Prefix` by default.
- Returns the generated config inline for download even if `install` is set to `false`.
- UI shortcut: the `/dashboard/` page exposes a “Create Route” card that calls this API, installs the snippet, and offers a one-click download of the generated config file.

### Client Usage Example

Here's an example of how to use the API to programmatically install a configuration:

```javascript
async function installAppConfig(name, content) {
  const response = await fetch('http://dev-proxy:8080/api/apps/install', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, content })
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Failed to install config: ${result.error}`);
  }
  
  return result;
}

// Example usage
const nginxConfig = `
# My app configuration
location ^~ /myapp/ {
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://my-app-container:3000/;
}
`;

installAppConfig('myapp', nginxConfig)
  .then(result => console.log('Config installed:', result))
  .catch(err => console.error('Installation failed:', err));
```

---

## Route Conflicts

### What Are Route Conflicts?

Route conflicts occur when multiple nginx configuration files (`*.conf` files in the `apps/` directory) declare the same `location` block:

```nginx
# apps/app1.conf
location /api/ {
  proxy_pass http://app1-backend:8000;
}

# apps/app2.conf  
location /api/ {
  proxy_pass http://app2-backend:9000;
}
```

In this example, both apps want to handle `/api/` requests, creating a conflict.

### Automatic Detection

The proxy scans `apps/*.conf` and detects conflicts:

```bash
⚠️  Nginx Configuration Conflicts:
   Route /api/: NEW CONFLICT - app1.conf wins (first config) over app2.conf
```

Conflicts are detected during:
- Proxy startup
- Configuration rescans (`node test/scanApps.js`)
- Manual conflict resolution operations

### Resolution Strategies

#### 1. Default Resolution (First Config Wins)

By default, the proxy uses a **"first config wins"** strategy when scanning app inputs:
- The first configuration file processed gets to keep the route
- Other files declaring the same route are ignored for that specific location
- The decision is logged and persisted for consistency

#### 2. Enhanced Visual Interface

The `/status` provides the following conflict management features:

**Smart Route Organization**
- **Route Grouping**: All routes automatically grouped by base upstream URL (nginx variables group by variable name, e.g., `$myapp_upstream`)
- **Visual Hierarchy**: Parent-child relationships clearly displayed
- **Promotion System**: Designate parent routes within each upstream group
- **Collapsible Groups**: Expand/collapse route groups for better organization

**Advanced Conflict Resolution**
- **One-Click Winners**: Choose conflict winners with immediate visual feedback
- **Live Conflict Indicators**: Real-time highlighting of conflicted routes
- **Route Renaming**: Rename conflicted routes directly in the enhanced interface
- **Persistent Decisions**: All conflict resolutions saved and persist across restarts

**Config Management**
- **Per-Config Views**: Filter and view routes by specific config files
- **JSON Export**: Export filtered route data for each config file  
- **Live Reload**: Refresh configurations without leaving the interface
- **Enhanced Editor**: View and edit nginx configs with better UX
- **Sticky summary & header + per-card collapse**: Faster navigation with persistent controls

**Quick Actions**
- **Open in Tunnel**: Direct links to access routes via ngrok URL
- **Diagnose Issues**: Detailed route information and troubleshooting
- **Status Indicators**: Color-coded health status for each route

#### 3. API-Based Resolution

For programmatic workflows, use the REST API:

```bash
# Check current conflicts
GET /routes.json

# Resolve conflict by choosing winner
POST /api/resolve-conflict
Content-Type: application/json
{
  "route": "/api/",
  "winner": "app2.conf"
}

# Rename route in a config file
POST /api/rename-route
Content-Type: application/json
{
  "oldRoute": "/api/",
  "newRoute": "/app2-api/", 
  "configFile": "app2.conf"
}

# View/edit config files
GET /api/config/app2.conf
POST /api/config/app2.conf
Content-Type: text/plain
[nginx config content]
```

### Persistence

All conflict resolution decisions are stored in `.artifacts/route-resolutions.json`:

```json
{
  "/api/": {
    "winner": "app2.conf",
    "conflictingFiles": ["app1.conf", "app2.conf"],
    "resolvedAt": "2024-01-15T10:30:00.000Z",
    "strategy": "manual-selection"
  }
}
```

This ensures:
- Consistent behavior across proxy restarts
- Team members see the same resolution decisions  
- Audit trail of conflict resolution history

---

## Route Promotion System

The enhanced Status Dashboard introduces a powerful **route promotion system** for managing complex route hierarchies:

### How Promotion Works

**Route Grouping**: Routes are automatically grouped by their normalized base upstream URL:
```
http://myapp-api:8000 group:
├── /api/ (can be promoted as parent)
├── /api/admin/
├── /api/static/
└── /health/
```

**Parent Selection**: Within each group, you can promote one route as the "parent":
- **Auto-promotion**: If there's only one shallowest route, it's auto-selected
- **Manual promotion**: Click "Promote as Root" on any route in the group
- **Visual hierarchy**: Parent routes show children as collapsible chips

### Benefits of Promotion

1. **Visual Organization**: Related routes grouped under logical parents
2. **Reduced Clutter**: Child routes collapsed by default, expand when needed
3. **Quick Navigation**: Parent route actions (Open, Diagnose) work for the entire group
4. **Persistent State**: Promotion choices saved in localStorage and persist across sessions
5. **Compact Views**: Collapse individual cards to show only the parent label and status

### Managing Promotions

```javascript
// View current promotions (browser console)
localStorage.getItem('routePromotions')
// Returns: {"http://myapp-api:8000": "/api/"}

// Clear all promotions
localStorage.removeItem('routePromotions')

// Clear specific promotion
const promotions = JSON.parse(localStorage.getItem('routePromotions') || '{}');
delete promotions['http://myapp-api:8000'];
localStorage.setItem('routePromotions', JSON.stringify(promotions));
```

### Best Practices for Promotion

- **Promote logical parents**: Choose the main application route (e.g., `/myapp/` over `/myapp/api/`)
- **Consider user workflow**: Promote the route users access first
- **Maintain consistency**: Use similar promotion patterns across different upstream groups

---

## Best Practices

### Prevention

1. **Use unique prefixes**: `/myapp/api/` instead of `/api/`
2. **Check existing routes**: Visit `/status` before adding new routes
3. **Team coordination**: Establish naming conventions
4. **Route planning**: Document route ownership in your team

### Resolution

1. When a proxy-side fix must win regardless of app snippets, add a minimal snippet under `overrides/` with the desired `location` block.
2. **Prefer renaming**: Better than arbitrary winner selection
3. **Document decisions**: Use descriptive route names
4. **Test after changes**: Verify apps work after conflict resolution
5. **Backup configs**: The system creates backups, but keep your own too

### Monitoring

1. **Check `/status` regularly**: Stay aware of conflicts
2. **Monitor logs**: Watch for new conflict warnings
3. **Review resolutions**: Ensure decisions still make sense over time

---

## Common Scenarios

### Shared API Service

```nginx
# Problem: Multiple apps want /api/
# Solution: One app owns /api/, others use prefixed paths

# api-service.conf (the main API)
location /api/ {
  proxy_pass http://api-service:8000;
}

# web-app.conf (use prefixed API calls)  
location /webapp/ {
  proxy_pass http://web-app:3000;
}
# Web app should make API calls to /api/ (not /webapp-api/)
```

### Admin Interfaces

```nginx
# Problem: Multiple apps have admin interfaces
# Solution: App-specific admin paths

# app1.conf
location /app1/admin/ {
  proxy_pass http://app1:3000/admin/;
}

# app2.conf  
location /app2/admin/ {
  proxy_pass http://app2:4000/admin/;
}
```

### Development vs Production

```nginx
# Development: Multiple teams working on API
# Use team-specific prefixes during development

# team1.conf
location /team1-api/ {
  proxy_pass http://team1-api:8000;
}

# team2.conf
location /team2-api/ {
  proxy_pass http://team2-api:8001;
}

# Later merge to shared /api/ for production
```

---

## Troubleshooting

### Enhanced Status Dashboard Issues

#### Route Grouping Not Working
- **Routes appear ungrouped**: Check upstream URL consistency in configs
- **Routes missing entirely**: Verify nginx syntax and file naming (`*.conf`)
- **Wrong upstream groups**: Ensure identical upstream strings across related routes

#### Promotion System Problems  
- **Cannot promote routes**: Check browser console for localStorage errors
- **Promotions not persisting**: Clear corrupted localStorage data
- **Auto-promotion not working**: Verify only one shallowest route exists in group

#### Open Button Issues
- **Wrong URLs**: Check ngrok URL detection in `/status.json`
- **404 errors**: Verify route paths handle both `/path` and `/path/`
- **Localhost instead of ngrok**: Check that global ngrok URL is properly loaded

#### Live Reload Problems
- **Reload button fails**: Check browser console for JavaScript errors
- **Stale data after reload**: Clear browser cache or force refresh
- **No visual feedback**: Verify button shows loading → success states

### Traditional Troubleshooting

#### Conflict Detection Issues
- **Conflicts not detected**: Check file naming (only `*.conf` files are scanned)
- **Invalid configs ignored**: Verify nginx syntax with `nginx -t`
- **Run manual scan**: Execute `node test/scanApps.js` to see parsing errors

#### Resolution Problems  
- **Changes not applied**: Check persistence in `.artifacts/route-resolutions.json`
- **Proxy restart needed**: Some nginx changes require container restart
- **Config syntax errors**: Invalid nginx syntax prevents successful application

#### Interface Problems
- **Status page not loading**: Ensure proxy config API is running (`utils/proxyConfigAPI.js`)
- **JavaScript errors**: Check browser console for runtime errors
- **Network issues**: Verify API endpoints are accessible from browser

#### API Troubleshooting
- **Authentication errors**: Some operations may require proper headers
- **JSON format issues**: POST requests need correct `Content-Type`
- **Permission errors**: Config editing requires filesystem write access

---

## Advanced Usage

### Custom Resolution Scripts

```javascript
// automated-resolution.js
const { resolveConflicts } = require('./utils/conflictResolver');
const { parseAppsDirectory } = require('./utils/nginxParser');

const routes = parseAppsDirectory('./apps');
const resolution = resolveConflicts(routes.conflicts);

// Custom logic for automated resolution
resolution.resolved.forEach((winner, route) => {
  console.log(`${route} -> ${winner.sourceFile}`);
});
```

### Bulk Route Renaming

```bash
# Rename all routes in a config file
for route in $(grep -o 'location [^{]*' apps/myapp.conf); do
  curl -X POST /api/rename-route -d "{
    \"oldRoute\": \"$route\",
    \"newRoute\": \"/myapp$route\", 
    \"configFile\": \"myapp.conf\"
  }"
done
```

### Monitoring Integration

```bash
# Check for conflicts in monitoring systems
conflicts=$(curl -s /routes.json | jq '.nginxWarnings | length')
if [ "$conflicts" -gt 0 ]; then
  echo "WARNING: $conflicts nginx route conflicts detected"
fi
```

---

## See Also

- **[USER_GUIDE.md](USER_GUIDE.md)** - Getting started and daily workflows
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and data flow
- **[CALLIOPE_ASSISTANT.md](CALLIOPE_ASSISTANT.md)** - AI assistant capabilities
- **[API.md](API.md)** - Complete API reference
- **[TESTING_SECURITY_AND_QUALITY.md](TESTING_SECURITY_AND_QUALITY.md)** - Testing, security, and quality assurance

This comprehensive configuration management system ensures your development proxy remains robust and manageable even as your application ecosystem grows in complexity.

