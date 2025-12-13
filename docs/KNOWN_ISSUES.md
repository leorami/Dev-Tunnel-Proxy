# Known Issues and Limitations

**Last Updated**: December 2025  
**Project Version**: 1.0

## Overview

This document tracks known issues, limitations, and workarounds for the Dev Tunnel Proxy system. Issues are categorized by severity and component.

---

## Critical Issues

### None Currently

All critical issues have been resolved. Previously resolved:
- ✅ Nginx refusing to start with offline upstreams (fixed with variable resolution)
- ✅ Mixed content errors on HTTPS tunnels (fixed with proxy headers)
- ✅ Duplicate location blocks causing conflicts (fixed with generator precedence)

---

## High Priority

### H1: Port Conflicts on Fresh Install

**Component**: Docker networking  
**Impact**: Prevents proxy startup if ports 8080, 443, or 3001 are in use

**Symptoms**:
```
Error starting userland proxy: listen tcp4 0.0.0.0:8080: bind: address already in use
```

**Workaround**:
```bash
# Find process using port
lsof -ti:8080

# Stop it or change proxy port in docker-compose.yml
ports:
  - "9090:80"  # Use 9090 instead of 8080
```

**Status**: Expected behavior, not a bug  
**Fix**: Add port detection to smart-build.sh setup (planned)

### H2: Initial Bundle Generation Failure

**Component**: Configuration generation  
**Impact**: First-time setup may fail if no apps exist yet

**Symptoms**:
```
Error: No configuration files found in apps/ or overrides/
```

**Workaround**:
```bash
# Create a minimal test config
echo 'location /test/ { return 200 "ok"; }' > apps/test.conf

# Or start without apps and add them later
./smart-build.sh up
# Then install apps via API
```

**Status**: Working as designed  
**Fix**: Bundle generator should handle empty directories gracefully (planned)

---

## Medium Priority

### M1: Calliope RAG Requires OpenAI API Key

**Component**: AI Assistant  
**Impact**: Q&A features unavailable without OpenAI key

**Symptoms**:
- Calliope can't answer documentation questions
- Empty responses when asking about capabilities

**Workaround**:
- Add `OPENAI_API_KEY` to `.env` file
- Or use Calliope healing without Q&A (patterns still work)

**Status**: By design (OpenAI integration is optional)  
**Fix**: Consider local embedding models (future)

### M2: ngrok Tunnel Discovery Delay

**Component**: Tunnel detection  
**Impact**: First few seconds after startup, ngrok URL may not be detected

**Symptoms**:
```
Proxy: ❌ (Not configured or dev-ngrok not running)
```

**Workaround**:
```bash
# Wait 5-10 seconds after startup
./smart-build.sh status

# Or check ngrok directly
docker logs dev-ngrok | grep "https://"
```

**Status**: Timing issue during container initialization  
**Fix**: Add retry logic with exponential backoff (planned)

### M3: Large Config Files Slow Bundle Generation

**Component**: Configuration parser  
**Impact**: Generation takes >1s with 50+ apps or very large configs

**Symptoms**:
- Slow reload times
- API timeouts on regenerate endpoint

**Workaround**:
- Keep individual configs focused (<500 lines)
- Use overrides for shared patterns
- Split large apps into sub-routes

**Status**: Performance optimization opportunity  
**Fix**: Parallel parsing, config caching (planned)

### M4: Regex Location Blocks Lower Priority

**Component**: Nginx location matching  
**Impact**: Regex routes (`location ~ /pattern/`) match after exact and prefix

**Symptoms**:
```nginx
location ~ ^/app/  # Regex - lower priority
location /app/     # Prefix - higher priority
```

**Workaround**:
- Use `^~` prefix modifier for most routes
- Use `=` for exact matches
- Use regex only when pattern matching is truly needed

**Status**: Nginx behavior, not a bug  
**Documentation**: Added to CONFIG-MANAGEMENT-GUIDE.md

### M5: Conflicting Server Name Warning

**Component**: Nginx configuration  
**Impact**: Harmless warning in logs

**Symptoms**:
```
nginx: [warn] conflicting server name "_" on 0.0.0.0:80, ignored
```

**Explanation**:
- Multiple server blocks with same server_name
- Nginx picks one, warns about others
- Doesn't affect functionality

**Workaround**: Ignore the warning (safe)

**Status**: Low priority cosmetic issue  
**Fix**: Consolidate server blocks or use unique names (planned)

---

## Low Priority

### L1: Theme Preference Not Synced

**Component**: Status UI  
**Impact**: Theme setting doesn't sync across tabs

**Symptoms**:
- Set dark mode in one tab
- Other tabs remain in light mode until refresh

**Workaround**: Refresh other tabs

**Status**: Browser localStorage limitation  
**Fix**: Use BroadcastChannel API for cross-tab sync (future)

### L2: Chat History Not Synced to Server

**Component**: Calliope chat  
**Impact**: Chat history in browser localStorage may differ from server

**Symptoms**:
- Clear browser data → lose chat history
- Different browsers have different conversations

**Workaround**: Export chat with Copy button before clearing browser data

**Status**: Design decision (client-side chat for performance)  
**Fix**: Add server-side sync option (planned)

### L3: No Auto-Cleanup for Old Artifacts

**Component**: File management  
**Impact**: `.artifacts/` directory grows unbounded

**Symptoms**:
- Hundreds of old health reports
- Disk usage increases over time (slowly)

**Workaround**:
```bash
# Manual cleanup
curl -X POST http://localhost:3001/api/reports/prune -d '{"keep":10}'
rm -rf .artifacts/ui/*
```

**Status**: Manual maintenance required  
**Fix**: Automatic cleanup task (planned for roadmap)

### L4: WebSocket Connections Show as Errors in Logs

**Component**: Nginx logging  
**Impact**: Console shows failed upgrade attempts for closed connections

**Symptoms**:
```
upstream prematurely closed connection while reading response header
```

**Explanation**: Normal WebSocket behavior (HMR connections close frequently)

**Workaround**: Ignore these specific errors (they're harmless)

**Status**: Nginx logging verbosity  
**Fix**: Filter logs or adjust log level (cosmetic)

### L5: Status Dashboard Doesn't Auto-Refresh

**Component**: Status UI  
**Impact**: Need manual refresh to see config changes

**Symptoms**:
- Add new route via API
- Status page doesn't show it until refresh

**Workaround**: Click Rescan button or refresh page

**Status**: Design decision (avoid constant network traffic)  
**Fix**: Add auto-refresh toggle (planned)

### L6: Embedding Reindex Requires API Running

**Component**: RAG system  
**Impact**: Can't reindex if Calliope API is offline

**Symptoms**:
```bash
./smart-build.sh reindex
❌ Calliope API is not running on port 3001
```

**Workaround**:
```bash
# Start API first
./smart-build.sh up
# Then reindex
./smart-build.sh reindex
```

**Status**: Dependency on API service  
**Fix**: Standalone reindex script (future)

---

## Limitations

### L1: Single nginx Instance

**Limitation**: No built-in load balancing across multiple nginx containers

**Impact**: Single point of failure for proxying

**Workaround**: Use external load balancer if high availability needed

**Future**: Multi-nginx cluster support

### L2: No TLS for Inter-Container Communication

**Limitation**: devproxy network uses plain HTTP

**Impact**: Traffic visible to other containers on same host

**Mitigation**: Docker network isolation provides adequate security for dev

**Future**: Optional mTLS for sensitive environments

### L3: Healing Patterns Are Generic

**Limitation**: Patterns can't reference specific app names or file paths

**Impact**: Some app-specific fixes require manual intervention

**Mitigation**: Use overrides/ for app-specific proxy-side fixes

**Future**: App-scoped pattern namespaces

### L4: OpenAI Dependency for Advanced Features

**Limitation**: AI Q&A and novel issue analysis require OpenAI API

**Impact**: Cost and external dependency

**Mitigation**: Pattern-based healing works without OpenAI

**Future**: Support local LLMs (Ollama, LocalAI)

### L5: No Built-In Authentication

**Limitation**: Status dashboard and API have no auth

**Impact**: Anyone with network access can view/modify configs

**Mitigation**: Use only in trusted development networks

**Future**: Optional basic auth or OAuth integration

### L6: Limited to Docker Networks

**Limitation**: Apps must be Docker containers on devproxy network

**Impact**: Can't proxy to host services easily

**Workaround**: Use `host.docker.internal` for host services

**Future**: Better host integration options

---

## Resolved Issues

### R1: Nginx Won't Start If Upstream Is Down

**Resolution**: Implemented variable-based upstream resolution (v0.9)

**Fix**: All proxy_pass directives now use nginx variables with runtime DNS

### R2: Mixed Content Errors on HTTPS Tunnel

**Resolution**: Added proper X-Forwarded-Proto headers and absolute_redirect off

**Fix**: nginx forwards correct protocol information to apps

### R3: Apps Interfere with Each Other's Routes

**Resolution**: Implemented conflict detection and precedence rules

**Fix**: generateAppsBundle.js detects and resolves conflicts automatically

### R4: No Way to Override App Configurations

**Resolution**: Created overrides/ directory system

**Fix**: Overrides take precedence over apps, allowing proxy-managed fixes

### R5: Manual nginx Reloads Required

**Resolution**: API automatically regenerates and reloads

**Fix**: POST /api/apps/install triggers end-to-end update

### R6: Calliope Couldn't Access Documentation

**Resolution**: Implemented RAG system with embeddings

**Fix**: Calliope now has semantic search over all docs (v1.0)

### R7: No Detection of Documentation Changes

**Resolution**: Added automatic reindexing to smart-build.sh

**Fix**: Doc changes detected via hashing, triggers reindex automatically

### R8: Calliope Chat Buttons Fall Outside Drawer

**Resolution**: Fixed flexbox constraints and removed sticky positioning

**Fix**: Input and buttons now stay together in drawer (December 2025)

---

## Reporting Issues

### How to Report

1. **Check this document** - Issue may be known
2. **Check TROUBLESHOOTING.md** - Solution may exist
3. **Ask Calliope** - She may have insights
4. **Check logs**: 
   ```bash
   ./smart-build.sh logs proxy
   ./smart-build.sh logs config-api
   ```

### Information to Include

- System info (OS, Docker version)
- Proxy logs (last 50 lines)
- Config files (sanitized, no secrets)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if UI issue)

### Priority Definitions

- **Critical**: System unusable, data loss, security issue
- **High**: Major feature broken, significant workaround needed
- **Medium**: Feature partially broken, workaround exists
- **Low**: Minor inconvenience, cosmetic, or nice-to-have

---

## See Also

- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Solutions to common problems
- **[Roadmap](ROADMAP.md)** - Planned fixes and features
- **[Security](SECURITY.md)** - Security considerations

