# Conflict Management Guide

The Dev Tunnel Proxy includes advanced conflict detection and resolution capabilities to handle scenarios where multiple apps declare the same nginx routes. Config serving now uses a generated bundle that composes inputs from `apps/` and `overrides/` so proxy-owned decisions always take precedence.

## Overrides, Composition, and Precedence (important)

To prevent regressions when an app re-generates its own nginx snippet, the proxy no longer includes `apps/*.conf` directly. Instead, it composes a single generated file `build/sites-enabled/apps.generated.conf` from two sources:

- `apps/*.conf` — per-app, local, gitignored snippets managed by each app
- `overrides/*.conf` — proxy-owned, canonical snippets that must win when a route needs to be enforced

Precedence rules:
- **Overrides win**: If both an app file and an override define the same `location` (exact or normalized prefix), the override’s block is emitted and the app is skipped for that route.
- **No hardcoding of app names**: Overrides should be minimal and generic when possible; only target the necessary `location` blocks.
- **Exact plus prefix can co-exist**: An exact match like `location = /myapp/` can live alongside a `location ^~ /myapp/` prefix. The composer keeps both.

Lifecycle and safety rails:
- The generator runs on start/restart/reload (`scripts/smart-build.sh`, `scripts/reload.sh`).
- Nginx only loads the generated file, so app writes to `apps/` cannot overwrite canonical proxy behavior.
- Inspect the provenance header at the top of `apps.generated.conf` for the list of included app files and overrides.

When should you add an override?
- A proxy-side fix must take precedence regardless of app changes.
- You need to neutralize an app-generated snippet that conflicts with proxy policy.
- You want a temporary shim while coordinating a fix in the app codebase.

See `docs/CONFIG-COMPOSITION.md` for full details and examples.

### Recommended Workflow: Iterate → Promote

- Iterate in `apps/` while developing fixes. Ensure no file with the same name exists in `overrides/`, otherwise your app edits will be ignored for matching locations.
- Promote to `overrides/` once stable. Copy the finalized app snippet to `overrides/` so it becomes proxy-owned and always wins.
- Reload using `./scripts/reload.sh` (the generator runs automatically).

Commands:

```bash
# Use app version during iteration
rm -f overrides/encast.conf
./scripts/reload.sh

# When ready, promote to overrides (proxy-owned precedence)
cp -f apps/encast.conf overrides/encast.conf
./scripts/reload.sh

# Or use the API to promote without shell copy
curl -s -X POST http://localhost:3001/api/overrides/promote \
  -H 'Content-Type: application/json' -d '{"filename":"encast.conf"}' | jq
```

## What Are Route Conflicts?

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

## Automatic Detection

The proxy scans `apps/*.conf` and detects conflicts:

```bash
⚠️  Nginx Configuration Conflicts:
   Route /api/: NEW CONFLICT - app1.conf wins (first config) over app2.conf
```

Conflicts are detected during:
- Proxy startup
- Configuration rescans (`node test/scanApps.js`)
- Manual conflict resolution operations

## Resolution Strategies

### 1. Default Resolution (First Config Wins)

By default, the proxy uses a **"first config wins"** strategy when scanning app inputs:
- The first configuration file processed gets to keep the route
- Other files declaring the same route are ignored for that specific location
- The decision is logged and persisted for consistency

### 2. Enhanced Visual Interface (🆕)

The `/status` provides the following conflict management features:

#### Smart Route Organization
- **Route Grouping**: All routes automatically grouped by base upstream URL (nginx variables group by variable name, e.g., `$myapp_upstream`) (🆕)
- **Visual Hierarchy**: Parent-child relationships clearly displayed
- **Promotion System**: Designate parent routes within each upstream group
- **Collapsible Groups**: Expand/collapse route groups for better organization

#### Advanced Conflict Resolution
- **One-Click Winners**: Choose conflict winners with immediate visual feedback
- **Live Conflict Indicators**: Real-time highlighting of conflicted routes
- **Route Renaming**: Rename conflicted routes directly in the enhanced interface
- **Persistent Decisions**: All conflict resolutions saved and persist across restarts

#### Config Management
- **Per-Config Views**: Filter and view routes by specific config files
- **JSON Export**: Export filtered route data for each config file  
- **Live Reload**: Refresh configurations without leaving the interface
- **Enhanced Editor**: View and edit nginx configs with better UX
- **Sticky summary & header + per-card collapse (🆕)**: Faster navigation with persistent controls

#### Quick Actions
- **Open in Tunnel**: Direct links to access routes via ngrok URL
- **Diagnose Issues**: Detailed route information and troubleshooting
- **Status Indicators**: Color-coded health status for each route

### 3. API-Based Resolution

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

## Persistence

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

## Route Promotion System (🆕)

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
5. **Compact Views (🆕)**: Collapse individual cards to show only the parent label and status

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

## Best Practices

### Prevention
1. **Use unique prefixes**: `/myapp/api/` instead of `/api/`
2. **Check existing routes**: Visit `/status` before adding new routes
3. **Team coordination**: Establish naming conventions
4. **Route planning**: Document route ownership in your team

### Resolution
5. When a proxy-side fix must win regardless of app snippets, add a minimal snippet under `overrides/` with the desired `location` block.
1. **Prefer renaming**: Better than arbitrary winner selection
2. **Document decisions**: Use descriptive route names
3. **Test after changes**: Verify apps work after conflict resolution
4. **Backup configs**: The system creates backups, but keep your own too

### Monitoring
1. **Check `/status` regularly**: Stay aware of conflicts
2. **Monitor logs**: Watch for new conflict warnings
3. **Review resolutions**: Ensure decisions still make sense over time

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
- **Status page not loading**: Ensure conflict API is running (`utils/conflictAPI.js`)
- **JavaScript errors**: Check browser console for runtime errors
- **Network issues**: Verify API endpoints are accessible from browser

#### API Troubleshooting
- **Authentication errors**: Some operations may require proper headers
- **JSON format issues**: POST requests need correct `Content-Type`
- **Permission errors**: Config editing requires filesystem write access

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

This comprehensive conflict management system ensures your development proxy remains robust and manageable even as your application ecosystem grows in complexity.
