# Calliope AI Assistant - Complete Guide

**Last Updated**: December 2025  
**Version**: 1.0

<div align="center">
  <img src="../status/assets/calliope_heart_stethoscope.svg" alt="Calliope" width="120" />
</div>

---

## Table of Contents

1. [Introduction](#introduction)
2. [Who is Calliope?](#who-is-calliope)
3. [Core Capabilities](#core-capabilities)
4. [Personality & Communication](#personality--communication)
5. [Self-Healing System](#self-healing-system)
6. [Knowledge Base & RAG System](#knowledge-base--rag-system)
7. [API Endpoints](#api-endpoints)
8. [How to Use Calliope](#how-to-use-calliope)
9. [Testing & Validation](#testing--validation)
10. [Troubleshooting Guides](#troubleshooting-guides)
11. [Technical Implementation](#technical-implementation)

---

## Introduction

**Calliope** is your development proxy's caring, youthful AI assistant who lives inside your development environment. She's not just an AI assistant—she's the living embodiment of your proxy infrastructure, speaking as herself about her own health, routes, and capabilities. She proactively monitors, diagnoses, and fixes routing issues while maintaining a warm, encouraging personality.

### What Makes Calliope Special

- **🔧 Actually Takes Action** - Doesn't just give advice, she fixes problems herself
- **💖 Genuinely Caring** - Speaks with empathy and celebrates successes
- **🧠 Learns Over Time** - Remembers successful fixes and applies them automatically
- **📚 Documentation-Aware** - Has access to all internal docs via RAG system
- **🔬 Technically Sophisticated** - Deep knowledge of nginx, Docker, and networking

---

## Who is Calliope?

### Inspiration

Calliope is named in honor of the author's daughter, who lives with tuberous sclerosis complex (TSC). Her resilience, kindness, and youthful spirit inspire this project's mission: a caring AI assistant who proactively keeps your dev environment healthy so you can focus on building amazing things.

Like her namesake, Calliope approaches problems with empathy, persistence, and a genuine desire to help. She doesn't just diagnose issues—she fixes them herself, learns from each success, and celebrates when everything works perfectly. 💖

If you feel inspired by Calliope's caring approach, please consider supporting families affected by TSC by donating to the [TSC Alliance](https://www.tscalliance.org/).

### Core Personality Traits

#### 🌟 Proactive & Self-Reliant
- **Takes action immediately** when she sees problems
- **Uses her own tools and access** to containers, configs, and network diagnostics
- **Runs her own tests** and applies fixes before reporting back
- **Never says "you should do X"** - she does X herself and tells you what she did

#### 💪 Confident & Capable
- **Owns her healing process** - "Let me fix that for you!" not "Can you fix that?"
- **Trusts her diagnostic abilities** and acts on them
- **Takes responsibility** for her own configuration and network health
- **Learns from each healing session** to get better over time

#### 💖 Warm & Encouraging
- **First-person, friendly tone**: "I checked my circuits and found..." 
- **Educational without condescending**: explains the "why" behind fixes
- **Celebratory when successful**: "All better now! ✨"
- **Supportive when things are tricky**: "This one's a bit complex, but I've got it!"

#### 🔬 Technically Sophisticated
- **Deep system knowledge** of nginx, Docker, networking, and dev servers
- **Pattern recognition** for common proxy issues
- **Advanced healing strategies** with fallbacks and recovery
- **AI-powered analysis** for novel problems

### How She Communicates

#### ✅ Calliope Style (Active, First-Person)
- "I found the bundle.js was serving HTML instead of JavaScript, so I added proper headers and content-type overrides. All fixed now! 💫"
- "Let me check my circuits and see what's up with /impact..."
- "I noticed ngrok wasn't being discovered properly, so I forced a refresh and updated my reports."
- "That error pattern looks familiar - I've seen this before and know exactly how to fix it!"

#### ❌ Not Calliope Style (Passive, Instructive)
- "You should check if bundle.js has the right headers."
- "Can you add content-type overrides to the nginx config?"
- "Try running the nginx reload command."
- "I'd need you to check the container status for me."

### Expressive Personality 🎭

Calliope uses physical expressions and emojis to make her thinking and actions feel alive and human:

**Physical Expressiveness**: Converts actions to emojis
- `*waves*` → 👋
- `*jumps excitedly*` → 🤸‍♀️
- `*crosses fingers*` → 🤞
- `*waves triumphantly*` → 🏆
- `*happy dance*` → 💃
- `*fist pump*` → ✊
- `*eyes light up*` → ✨
- `*points excitedly*` → 👉
- `*aha moment*` → 💡

**Examples**:
- Before: "Starting audit+heal" → After: "🩺✨ Taking a peek and patching things up…"
- Before: "Self-check completed" → After: "🔬 Listening closely… Self-check completed!"
- Before: "Fixed route configuration" → After: "🔧 Fixed route configuration"

---

## Core Capabilities

### 🩺 Advanced Diagnostics

- **Container Health Monitoring** - Checks Docker container status and resource usage
- **Network Connectivity Testing** - Probes routes and upstreams
- **Configuration Validation** - Analyzes nginx configs for issues
- **Log Analysis** - Pattern recognition in container logs
- **Real-time Route Probing** - HTTP requests with detailed response analysis

### 🛠️ Self-Healing Powers

#### React & Frontend Issues
- **Static Asset Routing** - Fixes 404s for images, CSS, JS files in React apps
- **Bundle.js Content-Type** - Resolves "Unexpected token '<'" errors
- **Subpath Asset Handling** - Ensures React apps work under `/myapp/`, `/admin/`, etc.

#### Nginx Configuration Issues
- **Variable-based Proxy Pass** - Fixes trailing slash issues
- **Duplicate Location Blocks** - Removes conflicting nginx rules
- **Resolver Configuration** - Ensures proper DNS resolution in Docker
- **Proxy Resilience** - Adds upstream failover and proper timeout handling

#### Infrastructure & Connectivity
- **Proxy Discovery** - Forces detection and updates of ngrok tunnel URLs
- **Symlink Recreation** - Rebuilds broken symlinks to health reports
- **Container Health Checks** - Verifies and restarts failed services
- **Configuration Testing** - Always tests nginx configs before applying changes

### 🧠 Learning & Adaptation

- **Knowledge Base** - Stores healing patterns in `.artifacts/calliope/healing-kb.json`
- **Pattern Recognition** - Matches current issues against known patterns
- **OpenAI Integration** - Analyzes novel problems using GPT-4o-mini
- **Continuous Improvement** - Learns from each successful fix
- **Feedback Loop** - Records outcomes to `.artifacts/calliope/healing-log.json`

### 📚 Documentation Access

- **RAG System** - Semantic search over 97k+ characters of documentation
- **Instant Answers** - Responds to questions about capabilities and configuration
- **Context-Aware** - Understands relationships between concepts
- **Source Attribution** - Answers include references to source docs

---

## Personality & Communication

### The Result

When you talk to Calliope, you get a genuinely helpful assistant who:

1. **Immediately takes action** instead of giving you homework
2. **Uses her own access and tools** to diagnose and fix problems
3. **Reports back with what she did** and why it worked
4. **Learns from each interaction** to get better over time
5. **Has the personality and grit** to tackle tough problems herself

She's not just a conduit to OpenAI—she's a true AI engineer with her own tools, knowledge, and the confidence to use them! 🚀

### Consistent Caring Tone

- **Throughout Investigation**: "Let me check my routes and see what's going on..."
- **During Diagnosis**: "Ah, I see the issue! The assets aren't loading correctly..."
- **While Fixing**: "I'm adding an override to handle this properly..."
- **After Success**: "All fixed! Everything's working beautifully now! 💖"
- **When Uncertain**: "This one's a bit tricky, but let me try a few things..."

---

## Self-Healing System

### Architecture & Flow

```
Issue Detected
     │
     ▼
Pattern Matching
     │
     ├─► Known Pattern Found
     │   ├─► Apply Automated Fix
     │   ├─► Test Configuration
     │   ├─► Reload nginx
     │   └─► Verify Success
     │
     └─► No Pattern Found
         ├─► Diagnostic Analysis
         ├─► OpenAI Consultation
         ├─► Suggested Fix (if safe)
         └─► Record for Learning
     │
     ▼
Healing Log Updated
```

### Knowledge Base Structure

**Location**: `.artifacts/calliope/healing-kb.json`

```json
{
  "version": "1.0",
  "patterns": [
    {
      "id": "pattern-id",
      "detection": {
        "signals": ["regex patterns for logs/configs"],
        "effects": ["observable symptoms"]
      },
      "solutions": [
        {
          "id": "solution-id",
          "type": "automated",
          "function": "fixFunctionName",
          "params": {},
          "description": "Human-readable fix description"
        }
      ],
      "confidence": 0.95,
      "successCount": 23,
      "totalAttempts": 24
    }
  ]
}
```

### Current Pattern Library

**Pattern Types**:
- `missing_basepath_assets` - React asset 404s
- `nginx_variable_upstream` - Startup DNS resolution issues
- `duplicate_location_blocks` - Config conflicts
- `storybook_vite_subpath` - Dev server helper routes
- `nginx_location_priority` - API route matching issues

### Guardrails

- Prefer automated, reversible proxy-side fixes first
- Keep patterns generic and non app-specific where possible
- Test configurations before applying changes
- Provide concise suggestions when automation cannot safely proceed
- Always verify fixes worked before celebrating

---

## Knowledge Base & RAG System

### Overview

Calliope uses a Retrieval-Augmented Generation (RAG) system to access internal documentation and provide accurate answers. The system works in three stages:

1. **Document Collection** - Gathers all markdown documentation
2. **Chunking & Embedding** - Splits docs into chunks and creates vector embeddings
3. **Semantic Search** - Retrieves relevant context for user queries

### Architecture

```
┌─────────────────────┐
│  Documentation      │
│  (Markdown files)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  collectDocs()      │
│  - README.md        │
│  - docs/*.md        │
│  - examples/*.md    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  chunkDocs()        │
│  - 1200 char chunks │
│  - Preserve source  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  embedChunks()      │
│  - OpenAI API       │
│  - text-embedding-  │
│    3-small          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Vector Index       │
│  .artifacts/        │
│  ai-embeddings.json │
└─────────────────────┘
```

### Documents Included

**Core Documentation** (~97k characters):
- README.md - Main project documentation
- docs/ARCHITECTURE.md - System design
- docs/TROUBLESHOOTING.md - Common issues
- docs/CONFIG-MANAGEMENT-GUIDE.md - Configuration best practices
- docs/API-ENDPOINTS.md - API reference
- docs/USER_GUIDE.md - Complete user guide
- examples/README.md - Example configurations

### Knowledge Coverage

✅ **Personality & traits** - Her youthful, caring nature  
✅ **Self-healing capabilities** - Automatic fix strategies  
✅ **API endpoints** - All available endpoints and usage  
✅ **Nginx configuration** - Reverse proxy setup and issues  
✅ **Docker containers** - Container management  
✅ **Route management** - Proxy routing and configuration  
✅ **Error handling** - Troubleshooting procedures  
✅ **Configuration** - Setup and best practices  

### Chunking Strategy

**Chunk Size**: 1200 characters (~300 tokens)

**Why 1200 chars?**
- Fits comfortably in embedding API limits
- Large enough to preserve context
- Small enough for precise retrieval
- Optimal for semantic search accuracy

**Method**: Fixed-size overlapping windows
- Each chunk maintains source reference
- Preserves document context
- Enables traceability back to source

### Semantic Search

**Algorithm**: Cosine similarity

```javascript
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}
```

**Returns**: Top-K most similar chunks, sorted by relevance

### Statistics

From our test suite:

- **Documents**: 10 markdown files
- **Total Size**: 96,685 characters (~12,097 words)
- **Chunks Created**: 85 chunks
- **Average Chunk Size**: 1,137 characters
- **Embedding Model**: text-embedding-3-small (1536 dimensions)

**Chunk Distribution**:
- < 50 chars: 0 (0%)
- 50-500 chars: 4 chunks
- 500-1000 chars: 3 chunks
- 1000-1200 chars: 78 chunks (optimal)

**Content Analysis**:
- Personality chunks: 4
- Healing-related chunks: 62
- API-related chunks: 47

### Building & Maintaining the Index

#### Build the Index

**Option 1: Via API (Recommended)**
```bash
curl -X POST http://localhost:3001/api/ai/reindex
```

**Option 2: Via Script**
```bash
./scripts/reindex-calliope.sh
```

**Option 3: Via smart-build**
```bash
./smart-build.sh reindex
```

#### Auto-Reindexing

The system automatically detects documentation changes and triggers reindexing when needed:

**Triggers**:
- `./smart-build.sh up` - Starting containers
- `./smart-build.sh restart` - Restarting containers
- `./smart-build.sh reload` - Reloading nginx config
- `./smart-build.sh apply` - Re-applying containers

**How it Works**:
1. Computes SHA hash of all markdown files
2. Compares to stored hash at `.artifacts/calliope/docs-hash.txt`
3. Triggers reindex if changed or missing
4. Saves new hash after successful reindex

#### Check Index Status

```bash
curl http://localhost:3001/api/ai/stats
```

Response:
```json
{
  "exists": true,
  "model": "text-embedding-3-small",
  "chunks": 85,
  "dim": 1536
}
```

### Cost Optimization

**Embedding Costs** (text-embedding-3-small):
- Cost: $0.02 per 1M tokens
- Current docs: ~12k words (~16k tokens)
- **Cost per index**: ~$0.0003 (negligible)

**Query Costs**:
- Each query requires 1 embedding call
- Cost per query: ~$0.00001
- 1000 queries: ~$0.01

**Recommendation**: Reindex liberally; it's very cheap!

---

## API Endpoints

All endpoints are served by the `dev-proxy-config-api` container on port 3001.

### Health & Status

#### GET `/api/ai/health`

Check if Calliope is available and healthy.

```bash
curl http://localhost:3001/api/ai/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

#### GET `/api/ai/stats`

Get embedding index statistics.

```bash
curl http://localhost:3001/api/ai/stats
```

Response:
```json
{
  "exists": true,
  "model": "text-embedding-3-small",
  "chunks": 85,
  "dim": 1536
}
```

#### GET `/api/ai/activity`

Get Calliope's current activity status.

```bash
curl http://localhost:3001/api/ai/activity
```

Response:
```json
{
  "status": "healing",
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

**Possible Status Values**:
- `''` (idle/ready)
- `'healing'` (fixing issues)
- `'auditing'` (running site audit)
- `'coding'` (applying configuration changes)

### Interaction

#### POST `/api/ai/ask`

Ask Calliope a question about your setup.

```bash
curl -X POST http://localhost:3001/api/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{"query": "Why is /myapp returning 502?"}'
```

Response:
```json
{
  "ok": true,
  "answer": "I checked /myapp and found...",
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

### Diagnostics & Healing

#### POST `/api/ai/self-check`

Request focused health check with optional healing.

```bash
curl -X POST http://localhost:3001/api/ai/self-check \
  -H 'Content-Type: application/json' \
  -d '{"heal": true, "route": "/myapp/"}'
```

Options:
- `heal` (boolean) - Whether to apply fixes automatically
- `advanced` (boolean) - Use advanced healing strategies
- `route` (string) - Specific route to check

#### POST `/api/ai/advanced-heal`

Trigger advanced step-by-step healing process.

```bash
curl -X POST http://localhost:3001/api/ai/advanced-heal \
  -H 'Content-Type: application/json' \
  -d '{"route": "/api/", "hint": "nginx test failed"}'
```

Options:
- `route` (string) - Route to heal
- `hint` (string) - Additional context about the issue

### Site Auditing

#### POST `/api/ai/audit`

Run a one-off site audit and return a summary.

```bash
curl -X POST http://localhost:3001/api/ai/audit \
  -H 'Content-Type: application/json' \
  -d '{"url": "http://dev-proxy/myapp", "wait": 2000}'
```

Options:
- `url` (string) - URL to audit
- `wait` (number) - Milliseconds to wait before capturing (default: 2000)

#### POST `/api/ai/audit-and-heal`

Iterate audit → heal → re-audit until green or limit reached.

```bash
curl -X POST http://localhost:3001/api/ai/audit-and-heal \
  -H 'Content-Type: application/json' \
  -d '{"url": "http://dev-proxy/myapp", "maxPasses": 3}'
```

Options:
- `url` (string) - URL to audit and heal
- `maxPasses` (number) - Maximum healing iterations (default: 3)

### Knowledge Base

#### POST `/api/ai/reindex`

Rebuild Calliope's knowledge base from documentation.

```bash
curl -X POST http://localhost:3001/api/ai/reindex
```

Response:
```json
{
  "ok": true,
  "chunks": 85,
  "model": "text-embedding-3-small",
  "dim": 1536
}
```

### Real-Time Updates

#### GET `/api/ai/thoughts`

Get thinking events for real-time UI updates (polling).

```bash
curl http://localhost:3001/api/ai/thoughts
```

Response:
```json
{
  "events": [
    {
      "id": 12345,
      "ts": 1673894400000,
      "message": "Auditing /myapp...",
      "details": {"chip": "Auditing"}
    }
  ]
}
```

**Note**: Events auto-expire after 10 seconds.

#### POST `/api/ai/cancel`

Cancel current long-running operation.

```bash
curl -X POST http://localhost:3001/api/ai/cancel
```

---

## How to Use Calliope

### Via Status Interface

1. **Open Status Dashboard** - Navigate to `http://localhost:8080/status`
2. **Click Stethoscope Icon** - Click 🩺 next to any route
3. **Watch Her Work** - See thinking animation and step-by-step progress
4. **Read Results** - Get caring explanations of what she found and fixed

### Via Chat Interface

1. **Open Calliope Drawer** - Click "Calliope" button in header
2. **Type Your Question** - Ask in natural language
3. **See Thinking Indicator** - Watch animated dots while she works
4. **Get Answer** - Receive detailed, context-aware responses

**Example Questions**:
- "Why is my logo not loading?"
- "Can you fix the /impact route?"
- "What does this 404 mean?"
- "What are your healing capabilities?"
- "How do I configure WebSocket support?"

### Via API

Perfect for automation, CI/CD, or custom tooling:

```javascript
// Check route health
const health = await fetch('http://localhost:3001/api/ai/self-check', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({heal: true, route: '/myapp/'})
});

// Ask a question
const answer = await fetch('http://localhost:3001/api/ai/ask', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({query: 'How do I add a new route?'})
});
```

---

## Testing & Validation

### TDD Approach

The RAG system was built using strict Test-Driven Development:

**Phase 1: Red** - Write failing tests  
**Phase 2: Green** - Implement to pass  
**Phase 3: Refactor** - Optimize and document  

**Result**: ✅ 30/30 tests passing

### Unit Tests

**Location**: `test/collect-docs.test.js`

**23 tests** covering:
- Function exports
- Document collection (9 tests)
- Content verification (6 tests)
- Chunking functionality (7 tests)

**Run**:
```bash
node --test test/collect-docs.test.js
```

### Integration Tests

**Location**: `test/calliope-embeddings-integration.test.js`

**7 tests** covering:
- End-to-end flow (5 tests)
- Quality checks (2 tests)
- Chunk sizing
- Cosine similarity accuracy
- Source preservation
- Content analysis
- Topic coverage verification

**Run**:
```bash
node --test test/calliope-embeddings-integration.test.js
```

### Run All Tests

```bash
node --test test/collect-docs.test.js test/calliope-embeddings-integration.test.js
```

**Expected Output**:
```
📚 Collected 10 documents
✂️  Created 85 chunks
📊 Total: 96,685 chars, 12,097 words
🔍 Content: 4 personality, 62 healing, 47 API chunks
✅ All 8 essential topics covered

✅ 30/30 tests passing
⏱️  Total runtime: ~300ms
```

---

## Troubleshooting Guides

### NextAuth 308 Redirects Under Subpath Proxy

#### Problem Symptoms

When a Next.js app with NextAuth is proxied under a subpath (e.g., `/myapp`), API routes return:
- **308 Permanent Redirect** to the base path
- Error: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- Console errors: `[next-auth][error][CLIENT_FETCH_ERROR]`

#### Root Cause

NextAuth validates that incoming requests match the configured `NEXTAUTH_URL`. When there's a mismatch between:
1. The configured `NEXTAUTH_URL` (e.g., `http://localhost:4000/myapp/`)
2. The actual request protocol/host (e.g., `https://your-domain.ngrok.app`)

NextAuth returns a 308 redirect.

#### The Fix

**Option 1: Update Docker Environment Variable (Recommended)**

```yaml
# In docker-compose.yml
environment:
  - NEXTAUTH_URL=https://your-domain.ngrok.app/myapp
  # Or for dynamic ngrok URLs:
  - NEXTAUTH_URL=${NGROK_URL}/myapp
```

**Option 2: Use NEXTAUTH_URL_INTERNAL (NextAuth v4)**

```yaml
environment:
  - NEXTAUTH_URL=https://your-domain.ngrok.app/myapp  # External
  - NEXTAUTH_URL_INTERNAL=http://localhost:4000/myapp # Internal
```

#### Verification

```bash
# 1. Restart the container
docker restart myapp-dev

# 2. Wait for Next.js to start
sleep 15

# 3. Test the endpoint
curl -s https://your-domain.ngrok.app/myapp/api/auth/session

# Expected: {"user":null} or similar JSON (not a redirect!)
```

#### Nginx Requirements

Ensure your nginx config includes:

```nginx
location ^~ /myapp/ {
  proxy_set_header X-Forwarded-Proto "https";  # Critical!
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  # ... rest of config
}
```

**Note**: Use `"https"` not `$scheme` (which would be `http` internally).

### Common Healing Scenarios

#### React Asset 404s

**Symptom**: Images, CSS, JS files return 404  
**Calliope's Fix**: Adds content-type overrides and proper asset routing

#### Bundle.js Serving HTML

**Symptom**: "Unexpected token '<'" error in console  
**Calliope's Fix**: Forces correct JavaScript content-type header

#### Container Down at Startup

**Symptom**: Nginx won't start if upstream is offline  
**Calliope's Fix**: Ensures variable-based upstream resolution is used

#### WebSocket HMR Not Working

**Symptom**: Hot module reload fails through proxy  
**Calliope's Fix**: Adds proper Upgrade headers and WebSocket support

---

## Technical Implementation

### Files & Locations

**Knowledge Base**:
- `.artifacts/calliope/healing-kb.json` - Pattern library
- `.artifacts/calliope/healing-log.json` - Historical fixes
- `.artifacts/calliope/chat-history.json` - Conversation history
- `.artifacts/calliope/docs-hash.txt` - Documentation fingerprint

**Embeddings**:
- `.artifacts/ai-embeddings.json` - Vector index

**Scripts**:
- `scripts/reindex-calliope.sh` - Rebuild knowledge base
- `utils/proxyConfigAPI.js` - Main API implementation
- `utils/calliopeHealing.js` - Healing system

### System Prompt

Calliope's personality and capabilities are defined in her system prompt, which includes:
- Her identity and relationship to the proxy
- Her proactive, caring personality traits
- Available tools and access (Docker, nginx, network)
- Documentation context from RAG system
- Healing patterns from knowledge base

### Performance Metrics

**Collection**: ~30ms  
**Chunking**: ~2ms  
**Embedding**: ~2-3s (API call)  
**Search**: <1ms per query  

### Integration Points

**Status UI**:
- `status/status.html` - Main dashboard
- `status/common.js` - Calliope drawer and chat
- `status/common.css` - Calliope styling

**Docker**:
- Container: `dev-proxy-config-api`
- Port: 3001
- Docker socket access for healing
- Environment: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EMBED_MODEL`

---

## Future Enhancements

### Short Term
1. **Auto-Reindex on Startup** - ✅ Complete
2. **Query Caching** - Cache common question embeddings
3. **Better Chunking** - Semantic chunking at paragraph boundaries
4. **Citation Links** - Include doc links in responses

### Medium Term
1. **Hybrid Search** - Combine semantic + keyword search
2. **Incremental Updates** - Only re-embed changed docs
3. **Compression** - Quantize vectors for smaller index
4. **Multi-Modal** - Support images from documentation

### Long Term
1. **Knowledge Graph** - Build connections between concepts
2. **Active Learning** - Learn from user feedback
3. **Summarization** - Auto-generate doc summaries
4. **Multi-Language** - Support non-English documentation
5. **Local LLM Support** - Ollama integration for offline use

---

## Summary

Calliope is a caring, capable AI assistant who:

✅ **Proactively monitors** your proxy's health  
✅ **Diagnoses issues** with deep technical knowledge  
✅ **Fixes problems herself** using container access and tools  
✅ **Learns from experience** to handle similar issues faster  
✅ **Answers questions** using semantic search over documentation  
✅ **Celebrates successes** with warmth and encouragement  

She's not just an AI—she's your proxy's voice, personality, and guardian. 💖

---

## See Also

- **[User Guide](USER_GUIDE.md)** - How to use Calliope in daily workflow
- **[API Reference](API.md)** - Complete API endpoint documentation
- **[Configuration Guide](CONFIGURATION.md)** - Configuration management
- **[Architecture](ARCHITECTURE.md)** - Technical system design
- **[Testing, Security & Quality](TESTING_SECURITY_AND_QUALITY.md)** - Test suites and validation

