# Data Lifecycle

**Last Updated**: December 2025

## Overview

This document describes how data flows through the Dev Tunnel Proxy system, from user requests to health monitoring, configuration changes, and AI interactions.

## Request Lifecycle

### 1. Incoming HTTP Request

```
Client Request
  URL: https://example.ngrok.app/myapp/api/users
  Headers: {
    Host: example.ngrok.app
    User-Agent: Mozilla/5.0
    ...
  }
```

**Stage 1: Tunnel Entry**
- Request arrives at ngrok edge server
- ngrok validates domain/authtoken
- Establishes connection to dev-ngrok container
- Forwards to dev-proxy on internal network

**Stage 2: Nginx Processing**
```
dev-proxy receives:
  GET /myapp/api/users HTTP/1.1
  Host: example.ngrok.app
  X-Forwarded-Proto: https
  X-Forwarded-For: client-ip
```

**Stage 3: Location Matching**
```
nginx evaluates in priority order:
1. Exact match:   location = /myapp/api/users  (not found)
2. Prefix match:  location ^~ /myapp/api/      (found!)
3. (stops here, doesn't check regex or generic)
```

**Stage 4: Variable Resolution**
```nginx
location ^~ /myapp/api/ {
  resolver 127.0.0.11;           # Docker DNS
  set $up myapp-backend:3000;    # Runtime DNS lookup
  proxy_pass http://$up/api/;    # Strips /myapp prefix
}
```

**Stage 5: Proxying**
```
nginx → myapp-backend:3000
  GET /api/users HTTP/1.1
  Host: example.ngrok.app
  X-Forwarded-Proto: https
  X-Forwarded-Host: example.ngrok.app
  X-Forwarded-For: client-ip
  X-Forwarded-Prefix: /myapp
```

**Stage 6: Response**
```
myapp-backend → nginx → ngrok → Client
  200 OK
  Content-Type: application/json
  { "users": [...] }
```

**Timing**:
- ngrok overhead: ~100-300ms
- nginx proxy: ~2-5ms
- app processing: varies
- Total: ~150-400ms + app time

## Configuration Lifecycle

### Creation

```
1. Developer creates myapp.conf
   └─► Nginx snippet with location blocks

2. Upload via API or file system
   POST /api/apps/install { name, content }
   or
   Copy to apps/myapp.conf manually

3. proxyConfigAPI receives request
   ├─► Validates nginx syntax (basic check)
   ├─► Writes to apps/myapp.conf
   └─► Returns success

4. Triggers automatic bundle generation
   (or manual: POST /api/apps/regenerate)
```

### Transformation

```
apps/myapp.conf (raw)
         │
         ▼
hardenUpstreams.js
  - Finds hardcoded proxy_pass
  - Converts to variables
  - Adds resolver directives
         │
         ▼
apps/myapp.conf (hardened)
         │
         ▼
generateAppsBundle.js
  - Parses location blocks
  - Detects conflicts
  - Applies precedence
  - Merges with overrides
         │
         ▼
build/sites-enabled/apps.generated.conf
  - Single composed file
  - Source comments preserved
  - Ready for nginx
```

### Activation

```
Bundle Generated
      │
      ▼
nginx -t (test)
      │
      ├─► Valid
      │   └─► nginx -s reload
      │       └─► New config active
      │
      └─► Invalid
          └─► Error logged
              └─► Old config remains
```

### Persistence

**State**: Configuration files
**Location**: `apps/*.conf`, `overrides/*.conf`
**Lifetime**: Permanent (user-managed)
**Backup**: `.conf.backup.*` files on modification

**Metadata**: Bundle diagnostics
**Location**: `build/bundle-diagnostics.json`
**Format**:
```json
{
  "timestamp": "2025-01-15T...",
  "sources": ["apps/myapp.conf", "overrides/critical.conf"],
  "locations": {
    "/myapp/": {
      "source": "apps/myapp.conf",
      "type": "prefix",
      "upstream": "myapp:3000"
    }
  },
  "conflicts": [],
  "skipped": []
}
```

## Health Monitoring Lifecycle

### Continuous Scanning

```
dev-auto-scan container (15-second loop)
         │
         ▼
1. Load current routes from /routes.json
         │
         ▼
2. For each route:
   ├─► HTTP probe (local + tunnel targets)
   ├─► Record status code, timing
   ├─► Check content-type
   └─► Detect errors
         │
         ▼
3. Generate reports
   ├─► health-latest.json (consolidated health)
   ├─► scan-apps-latest.json (detailed per-route)
   └─► Timestamped copies
         │
         ▼
4. Write to .artifacts/reports/
         │
         ▼
5. sleep 15 seconds
         │
         └─► Repeat
```

### Report Structure

**health-latest.json**:
```json
{
  "timestamp": "2025-01-15T12:34:56.789Z",
  "overall": "healthy",
  "routes": {
    "/myapp/": {
      "status": "ok",
      "httpCode": 200,
      "targets": {
        "local": { "status": "ok", "code": 200 },
        "tunnel": { "status": "ok", "code": 200 }
      }
    }
  },
  "summary": {
    "total": 10,
    "ok": 9,
    "warn": 1,
    "err": 0
  }
}
```

### Report Consumption

**Status Dashboard**:
```javascript
// Periodic fetch
setInterval(async () => {
  const data = await fetch('/routes.json').then(r => r.json());
  updateRouteCards(data.routes);
}, 30000);
```

**Calliope Self-Check**:
```javascript
// On-demand probe
const report = await fetch('/health.json').then(r => r.json());
analyzeIssues(report.routes);
```

**API Response**:
```bash
curl http://localhost:8080/health.json
# Returns latest health report
```

## AI Interaction Lifecycle

### Chat Conversation

```
1. User types message in chat drawer
         │
         ▼
2. Frontend sends POST /api/ai/ask { query }
         │
         ▼
3. proxyConfigAPI receives request
   ├─► Loads chat history
   ├─► Embeds query for RAG search
   ├─► Finds relevant docs
   ├─► Builds system prompt
   ├─► Calls OpenAI API
   └─► Saves response to chat history
         │
         ▼
4. Response returned to frontend
         │
         ▼
5. Chat drawer renders assistant message
```

### Chat History Persistence

**Location**: `.artifacts/calliope/chat-history.json`

**Structure**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Why is /myapp returning 502?",
      "ts": "2025-01-15T12:34:56.789Z"
    },
    {
      "role": "assistant",
      "content": "I checked /myapp and found...",
      "ts": "2025-01-15T12:34:58.123Z"
    }
  ]
}
```

**Also Stored**:
- Browser localStorage (`dtpCalliopeChat`)
- Last 200 messages kept
- Synced between API and browser

### Self-Healing Flow

```
1. Issue Detection
   ├─► User reports problem
   ├─► Auto-scan detects anomaly
   └─► Calliope proactive check
         │
         ▼
2. Diagnosis
   ├─► Probe route
   ├─► Check logs
   ├─► Analyze config
   └─► Match against known patterns
         │
         ▼
3. Pattern Matching
   ├─► healing-kb.json lookup
   ├─► Signal matching (regex)
   └─► Effect correlation
         │
         ├─► Pattern Found
         │   └─► Apply automated fix
         │
         └─► No Pattern
             └─► OpenAI analysis
         │
         ▼
4. Fix Application
   ├─► Modify nginx config
   ├─► Test configuration
   ├─► Reload nginx
   └─► Verify fix worked
         │
         ▼
5. Learning
   ├─► Record to healing-log.json
   ├─► Update pattern confidence
   └─► Optionally save new pattern
```

### Healing Log

**Location**: `.artifacts/calliope/healing-log.json`

**Structure**:
```json
{
  "version": "1.0",
  "entries": [
    {
      "timestamp": "2025-01-15T12:34:56.789Z",
      "route": "/myapp/",
      "issue": "404 for bundle.js",
      "patternUsed": "missing_basepath_assets",
      "fixApplied": "addContentTypeOverride",
      "outcome": "success",
      "verificationResult": {
        "before": 404,
        "after": 200
      }
    }
  ]
}
```

## Embedding/RAG Lifecycle

### Index Creation

```
1. Documentation changes detected
   ├─► smart-build.sh calculates hash
   ├─► Compares to stored hash
   └─► Triggers reindex if different
         │
         ▼
2. Document Collection
   ├─► Scan docs/ directory
   ├─► Scan examples/ directory
   ├─► Read README.md
   └─► Collect all *.md files
         │
         ▼
3. Chunking
   ├─► Split into 1200-char chunks
   ├─► Preserve source attribution
   └─► Generate chunk IDs (SHA hash)
         │
         ▼
4. Embedding
   ├─► Call OpenAI API (batch of 16)
   ├─► Get 1536-dim vectors
   └─► Associate with chunks
         │
         ▼
5. Storage
   └─► Write to .artifacts/ai-embeddings.json
         │
         ▼
6. Hash Update
   └─► Save new doc hash to docs-hash.txt
```

### Query Processing

```
1. User asks Calliope a question
   "What are your healing capabilities?"
         │
         ▼
2. Query Embedding
   ├─► Call OpenAI embeddings API
   └─► Get query vector (1536-dim)
         │
         ▼
3. Similarity Search
   ├─► Load ai-embeddings.json
   ├─► Compute cosine similarity
   ├─► Rank all chunks
   └─► Select top 5 most relevant
         │
         ▼
4. Context Building
   ├─► Extract chunk text
   ├─► Include source references
   └─► Add to system prompt
         │
         ▼
5. OpenAI Chat
   ├─► System prompt + context + query
   ├─► GPT-4o-mini generates answer
   └─► Answer grounded in documentation
         │
         ▼
6. Response
   └─► Return answer to user with sources
```

## Artifact Management

### Report Retention

**auto-scan generates**:
- `health-latest.json` (overwritten)
- `health-TIMESTAMP.json` (archived)
- `scan-apps-latest.json` (overwritten)
- `scan-apps-TIMESTAMP.json` (archived)

**Retention Policy**:
- Keep latest (always)
- Keep last 50 timestamped reports
- Auto-prune via POST /api/reports/prune

**Cleanup**:
```bash
# Manual
curl -X POST http://localhost:3001/api/reports/prune \
  -H 'content-type: application/json' \
  -d '{"keep": 10}'

# Auto (via Calliope healing)
POST /api/ai/advanced-heal
→ May trigger cleanup if disk space is an issue
```

### Backup Files

**Created**: When configs are modified
**Naming**: `filename.conf.backup.TIMESTAMP`
**Location**: Same directory as original
**Retention**: Manual cleanup (not auto-deleted)

**Example**:
```
apps/lyra.conf
apps/lyra.conf.backup.1734567890123
apps/lyra.conf.backup.1734568000456
```

### Test Artifacts

**Playwright Tests**:
- Location: `.artifacts/ui/`
- Contents:
  - Screenshots (on failure)
  - Videos (on failure)
  - Traces (debug mode)
- Retention: Not auto-cleaned (manual)

**Site Auditor**:
- Location: `site-auditor-out/TIMESTAMP/`
- Contents:
  - report.json
  - screenshots/*.png
  - Computed styles (if enabled)
- Retention: Manual cleanup

## Temporary State

### Thinking Events

**Purpose**: Real-time UI updates during long operations

**Storage**: In-memory queue in proxy-config-api

**Structure**:
```javascript
[
  {
    id: 12345,
    ts: Date.now(),
    message: "Auditing /myapp...",
    details: { chip: "Auditing" }
  }
]
```

**Lifecycle**:
- Event created → Queued
- 10-second TTL
- Frontend polls GET /api/ai/thoughts
- Events auto-expire

**TTL Reason**: Prevents memory growth, keeps UI responsive

### Activity Status

**Purpose**: Show Calliope's current state

**Storage**: In-memory variable

**Values**:
- `''` (idle/ready)
- `'healing'` (fixing issues)
- `'auditing'` (running site audit)
- `'coding'` (applying configuration changes)

**API**: `GET /api/ai/activity`

**Lifecycle**: Set at operation start, cleared on completion

## Configuration State

### Source of Truth

```
Primary Source: File System
  ├─► apps/*.conf          (app-managed)
  └─► overrides/*.conf     (proxy-managed)
         │
         ▼
Derived Artifact: Build Output
  └─► build/sites-enabled/apps.generated.conf
         │
         ▼
Active Configuration: Nginx Memory
  └─► nginx loaded config (after reload)
```

### State Transitions

```
Apps Change
  (new file, edit, delete)
        │
        ▼
  Detect via:
    - API upload
    - File watch (future)
    - Manual trigger
        │
        ▼
  Generate bundle
        │
        ▼
  Test config (nginx -t)
        │
        ├─► Valid → Reload → Active
        │
        └─► Invalid → Reject → No Change
```

### Conflict Resolution State

**Storage**: `.artifacts/route-resolutions.json`

**Structure**:
```json
{
  "/api/": {
    "route": "/api/",
    "winner": "myapp.conf",
    "timestamp": "2025-01-15T12:34:56.789Z",
    "alternatives": ["otherapp.conf"]
  }
}
```

**Lifecycle**:
- Conflict detected → User resolves → Recorded
- Persists across restarts
- Cleared manually via API
- Reused for automatic resolution

## Knowledge Base Evolution

### Pattern Discovery

```
1. Issue Occurs
   └─► User reports or auto-detected
         │
2. Calliope Diagnoses
   └─► Identifies root cause
         │
3. Fix Applied
   └─► Configuration change or command
         │
4. Verification
   ├─► Route probing
   └─► Confirms fix worked
         │
5. Pattern Extraction
   └─► If successful, record as pattern
         │
6. Knowledge Base Update
   └─► Add to healing-kb.json
         │
7. Future Occurrences
   └─► Automatic detection and fix
```

### Pattern Structure

```json
{
  "id": "unique-pattern-id",
  "detection": {
    "signals": [
      "regex pattern 1",
      "regex pattern 2"
    ],
    "effects": [
      "Observable symptom 1",
      "Observable symptom 2"
    ]
  },
  "solutions": [
    {
      "id": "solution-id",
      "description": "Human-readable description",
      "implementation": {
        "type": "automated",
        "function": "fixFunctionName",
        "params": {}
      }
    }
  ],
  "confidence": 0.95,
  "successCount": 23,
  "totalAttempts": 24
}
```

### Pattern Evolution

- **Initial**: Manually crafted patterns
- **Learning**: Calliope adds patterns from successful fixes
- **Refinement**: Confidence scores updated with each use
- **Pruning**: Low-confidence patterns can be removed

## Cache and Performance

### No Traditional Caching

**By Design**: System prioritizes freshness over caching

**Rationale**:
- Dev environments change frequently
- Config changes need immediate effect
- Health status must be current
- Cache invalidation is hard

**Performance Strategy**:
- Fast operations (nginx is quick)
- Efficient scanning (parallel probing - future)
- Minimal data transformation
- Direct file reads (no DB)

### Browser Caching

**Static Assets** (status UI):
```nginx
location /status/ {
  expires -1;  # No cache during dev
  add_header Cache-Control "no-store, no-cache, must-revalidate";
}
```

**API Responses**:
```javascript
res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
```

**Rationale**: Development environments need up-to-date data, caching causes confusion

## Cleanup and Maintenance

### Automatic Cleanup

**Currently**: None (manual management)

**Future Plans**:
- Auto-prune old reports (keep last 50)
- Remove stale backup files (older than 30 days)
- Clean test artifacts (after N days)
- Compress old healing logs

### Manual Cleanup

```bash
# Remove old reports
curl -X POST http://localhost:3001/api/reports/prune \
  -H 'content-type: application/json' \
  -d '{"keep": 10}'

# Clean test artifacts
rm -rf .artifacts/ui/*
rm -rf site-auditor-out/*

# Remove backup files
find apps/ -name "*.backup.*" -mtime +30 -delete
```

### Data Recovery

**Lost chat history**:
- Check browser localStorage
- Check `.artifacts/calliope/chat-history.json`
- Recent messages recoverable

**Lost config**:
- Check backup files (*.conf.backup.*)
- Restore from git history
- Regenerate from examples/

**Lost health reports**:
- Reports regenerate every 15 seconds
- Historical reports in .artifacts/reports/
- Not critical (transient data)

## Data Privacy

### Sensitive Data

**Never Stored in Repository**:
- NGROK_AUTHTOKEN (in .env only)
- OPENAI_API_KEY (in .env only)
- App-specific configs (apps/ is gitignored)
- User chat conversations (artifacts/ is gitignored)

**Stored Locally Only**:
- Configuration files
- Chat history
- Healing logs
- Health reports
- Test artifacts

### External Data Sharing

**OpenAI API**:
- Query text (user questions)
- Selected documentation chunks (for context)
- System prompts (personality, capabilities)
- **NOT sent**: Config files, app details, secrets

**ngrok**:
- HTTP traffic passes through tunnel
- ngrok sees request/response data
- Use ngrok's security features (auth, IP restrictions)

## Data Retention Recommendations

### Keep Forever

- Configuration files (apps/, overrides/)
- Documentation (docs/)
- Test files (test/)
- Examples (examples/)

### Keep 30 Days

- Health reports (.artifacts/reports/)
- Healing logs (.artifacts/calliope/healing-log.json)
- Backup configs (*.conf.backup.*)

### Keep 7 Days

- Test artifacts (.artifacts/ui/)
- Site auditor outputs (site-auditor-out/)
- Chat history (can truncate to last 200 messages)

### Can Delete Anytime

- Thinking events (in-memory only)
- Activity status (in-memory only)
- Latest reports (regenerate in 15s)
- Bundle diagnostics (regenerate on demand)

---

## See Also

- **[Architecture](ARCHITECTURE.md)** - System design and container topology
- **[Testing](TESTING.md)** - Test data generation and validation
- **[Security](SECURITY.md)** - Data security considerations

