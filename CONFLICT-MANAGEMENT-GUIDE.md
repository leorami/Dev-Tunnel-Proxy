# Conflict Management Guide

The Dev Tunnel Proxy includes advanced conflict detection and resolution capabilities to handle scenarios where multiple apps declare the same nginx routes.

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

The proxy automatically scans all configuration files and detects conflicts:

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

By default, the proxy uses a **"first config wins"** strategy:
- The first configuration file processed gets to keep the route
- Other files declaring the same route are ignored for that specific location
- The decision is logged and persisted for consistency

### 2. Visual Resolution Interface

Visit `/status` in your browser to manage conflicts interactively:

#### Conflict Selection
- Radio button interface to choose which config should win
- See all conflicting files for each route
- One-click resolution with immediate effect

#### Route Renaming  
- Rename conflicted routes directly in the interface
- Automatically updates the nginx configuration file
- Creates backups before making changes

#### Config File Management
- View any configuration file in the browser
- Edit nginx configs with syntax highlighting
- Download configs for local editing
- Save changes with automatic backup creation

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

## Best Practices

### Prevention
1. **Use unique prefixes**: `/myapp/api/` instead of `/api/`
2. **Check existing routes**: Visit `/status` before adding new routes
3. **Team coordination**: Establish naming conventions
4. **Route planning**: Document route ownership in your team

### Resolution
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

### Conflict Not Detected
- Check file naming: only `*.conf` files are scanned
- Verify nginx syntax: invalid configs may be ignored
- Run manual scan: `node test/scanApps.js`

### Resolution Not Applied  
- Check persistence: Look for `.artifacts/route-resolutions.json`
- Restart proxy: Some changes require proxy restart
- Verify config syntax: Invalid nginx syntax prevents application

### UI Not Loading
- Ensure conflict API is running: Check `utils/conflictAPI.js`
- Check browser console: Look for JavaScript errors
- Verify network access: Ensure API endpoints are reachable

### API Errors
- Check authentication: Some operations may require auth
- Verify JSON format: POST requests need proper Content-Type
- Check file permissions: Config editing requires write access

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
