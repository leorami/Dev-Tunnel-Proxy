# Demo Setup for Conflict Management

This directory contains a complete demo setup to showcase the conflict management system.

## Quick Start

```bash
# From the project root
cd examples/demo-setup
./setup-demo.sh
```

This will:
1. Create demo app configurations with intentional conflicts
2. Start the proxy with conflict API
3. Open the status page to show conflict resolution UI

## Demo Scenarios

### Scenario 1: API Route Conflict
Two different apps both want `/api/` route:
- `ecommerce-api.conf` - Product catalog API
- `user-service.conf` - User management API

### Scenario 2: Admin Interface Conflict  
Multiple apps with admin interfaces:
- `cms.conf` - Content management system
- `analytics.conf` - Analytics dashboard

### Scenario 3: Mixed Route Types
Complex routing with different nginx patterns:
- Standard routes: `/app/`
- Prefix routes: `/static/`
- Regex routes: `/api/v[0-9]+/`

## Resolution Walkthrough

1. **Detection**: Conflicts automatically detected on startup
2. **Visual Resolution**: Use `/status` page to choose winners
3. **Auto-Fix**: Intelligent suggestions for renaming
4. **Validation**: Real-time nginx config validation
5. **Persistence**: Decisions saved across restarts

## Cleanup

```bash
./cleanup-demo.sh
```

Removes all demo configurations and resets conflict state.
