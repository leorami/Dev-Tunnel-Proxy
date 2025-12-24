# Testing, Security & Quality Assurance

**Last Updated**: December 2025  
**Version**: 1.0

This guide covers testing strategies, security considerations, known issues, and operational best practices for Dev Tunnel Proxy.

---

## Table of Contents

1. [Testing](#testing)
2. [Security](#security)
3. [Known Issues](#known-issues)
4. [Operational Best Practices](#operational-best-practices)

---

## Testing

### Testing Philosophy

#### Principles

1. **Test Behavior, Not Implementation** - Focus on user-facing outcomes
2. **Fast Feedback** - Unit tests run in milliseconds, integration tests in seconds
3. **Realistic Environments** - UI tests use actual Docker containers
4. **Test-Driven Development** - Write tests before implementing features (where feasible)
5. **Clear Assertions** - Tests should clearly express intent and expected outcomes

#### Test Pyramid

```
         ┌─────────────┐
         │   E2E/UI    │  ~10 tests
         │  (Slowest)  │
         ├─────────────┤
         │ Integration │  ~30 tests
         │  (Medium)   │
         ├─────────────┤
         │    Unit     │  ~60+ tests
         │   (Fast)    │
         └─────────────┘
```

**Rationale**: More unit tests (fast, isolated), fewer E2E tests (slow, fragile)

### Test Categories

#### 1. Unit Tests

**Purpose**: Test individual functions and modules in isolation

**Location**: `test/*.test.js`

**Key Test Suites**:

**Document Collection** (`test/collect-docs.test.js`):
- ✅ collectDocs() returns array of documents
- ✅ Includes README.md, TROUBLESHOOTING.md
- ✅ Includes Calliope-specific docs
- ✅ Handles missing files gracefully
- ✅ Filters non-markdown files

**Run**:
```bash
node test/collect-docs.test.js
```

**Configuration Parser** (`utils/nginxParser.js`):
- ✅ Extracts location blocks
- ✅ Identifies upstream services
- ✅ Detects route conflicts
- ✅ Handles malformed configs

**Run**:
```bash
node test/nginx-parser.test.js
```

#### 2. Integration Tests

**Purpose**: Test multiple components working together

**Location**: `test/*integration*.js`, `test/*embeddings*.js`

**Calliope Embeddings Integration** (`test/calliope-embeddings-integration.test.js`):
- ✅ Document collection and chunking
- ✅ Chunk size distribution (should favor 1000-1200 chars)
- ✅ Cosine similarity calculations
- ✅ Source attribution preserved
- ✅ Relevant Calliope information in chunks
- ✅ Coverage of key topics (healing, configuration, API)

**Run**:
```bash
node test/calliope-embeddings-integration.test.js
```

**API Probing** (`test/scanApps.js`):
- ✅ Parses nginx configurations
- ✅ Probes routes via HTTP
- ✅ Detects asset loading issues
- ✅ Discovers API endpoints from HTML/JS
- ✅ Tests WebSocket support
- ✅ Generates health reports

**Run**:
```bash
node test/scanApps.js
```

#### 3. End-to-End UI Tests

**Purpose**: Test user interactions in real browser environment

**Location**: `test/ui/tests/*.spec.ts`

**Framework**: Playwright (TypeScript)

**Test Suites**:

**Status Dashboard** (`status.spec.ts`):
- ✅ Page loads successfully
- ✅ Route cards display
- ✅ Filtering works (by severity, status code)
- ✅ Theme toggle (light/dark)
- ✅ Calliope drawer opens/closes

**Calliope Integration** (`calliope-*.spec.ts`):
- ✅ Chat drawer functionality
- ✅ Thinking indicator animations
- ✅ Message sending and receiving
- ✅ Action buttons (Ask, Self-Check, Clear)
- ✅ Style consistency between enable/disable states
- ✅ Chip status updates
- ✅ Layout positioning (no overflow)

**Route Auditing** (`routes-audit-half.spec.ts`):
- ✅ Routes are accessible
- ✅ Assets load correctly
- ✅ No console errors
- ✅ Health status accurate

**Run Tests**:
```bash
# From workspace root
npm run ui:test

# Or via Docker
docker run --rm --network devproxy \
  -e UI_BASE_URL=http://dev-proxy \
  -v "$PWD":/work -w /work/test/ui \
  mcr.microsoft.com/playwright:v1.46.0-jammy \
  bash -lc 'npm install && npx playwright install --with-deps && npm test'
```

**Configuration** (`test/ui/playwright.config.ts`):
```typescript
{
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.UI_BASE_URL || 'http://localhost:8080',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  }
}
```

**Artifacts**:
- Screenshots: `.artifacts/ui/screenshots/`
- Videos: `.artifacts/ui/videos/`
- Traces: `.artifacts/ui/traces/`

#### 4. Site Auditor

**Purpose**: Comprehensive page analysis with screenshots and error detection

**Location**: `site-auditor-debug/`

**Features**:
- Multi-viewport screenshots
- Console error capture
- Network failure detection
- Computed styles export
- Crawling with sitemap support

**Run Single Page Audit**:
```bash
cd site-auditor-debug
pnpm install
pnpm run build

# Audit a single route
node dist/cli.js http://dev-proxy/myapp/
```

**Run Crawl Mode**:
```bash
node dist/cli.js --crawl \
  --start-urls http://dev-proxy/myapp/ \
  --max-pages 25 \
  --concurrency 3
```

**Output**:
- Location: `site-auditor-out/TIMESTAMP/`
- Files:
  - `report.json` - Full audit data
  - `screenshots/*.png` - Per-viewport screenshots
  - `computed-styles.json` - CSS analysis (if enabled)

### Running Tests

#### All Tests

```bash
# Run all unit and integration tests
npm test

# Or via smart-build.sh (future)
./smart-build.sh test:all
```

#### Specific Test Suites

```bash
# Unit tests
node test/collect-docs.test.js
node test/calliope-embeddings-integration.test.js

# Integration tests
node test/scanApps.js

# UI tests
npm run ui:test

# Site auditor
cd site-auditor-debug
pnpm test
```

#### Watch Mode

```bash
# For Node.js built-in test runner
node --test --watch test/**/*.test.js

# For UI tests (Playwright)
cd test/ui
npx playwright test --ui  # Interactive UI mode
```

#### Debug Mode

```bash
# Node.js debugger
node --inspect-brk test/collect-docs.test.js

# Playwright debug
cd test/ui
PWDEBUG=1 npx playwright test
```

### Test Coverage

**Current Coverage**:

| Component | Coverage | Notes |
|-----------|----------|-------|
| Document Collection | 95% | All major paths covered |
| RAG System | 90% | Embeddings integration tested |
| Configuration Parser | 80% | Edge cases WIP |
| API Endpoints | 70% | Healing endpoints need more tests |
| UI Components | 85% | Calliope drawer thoroughly tested |

**Measuring Coverage**:

```bash
# Using c8 (recommended for Node.js)
npm install --save-dev c8

# Run with coverage
c8 node test/collect-docs.test.js

# Generate HTML report
c8 --reporter=html node test/**/*.test.js
open coverage/index.html
```

### Performance Testing

#### Route Scanning Performance

```bash
# Time a single scan
time node test/scanApps.js
```

**Target**: <5 seconds for 20 routes

#### Bundle Generation Performance

```bash
# Time bundle generation
time node utils/generateAppsBundle.js
```

**Target**: <100ms for 50 configs

#### Embedding Query Performance

```javascript
// test/performance/rag-query-perf.js
const { loadEmbeddings, rankByVector, embedText } = require('../utils/proxyConfigAPI');

async function benchmarkQuery() {
  const embeddings = loadEmbeddings();
  const queryVec = await embedText('How do I configure nginx?');
  
  const start = Date.now();
  const results = rankByVector(embeddings, queryVec, 5);
  const duration = Date.now() - start;
  
  console.log(`Query took ${duration}ms`);
  console.assert(duration < 10, 'Query should be <10ms');
}
```

**Target**: <1ms for similarity search (in-memory)

### Best Practices

#### 1. Test Isolation

Each test should be independent:
```javascript
// ❌ Bad - tests depend on each other
let sharedState = null;
test1() { sharedState = getData(); }
test2() { assert.ok(sharedState); }

// ✅ Good - each test sets up its own state
test1() { const data = getData(); assert.ok(data); }
test2() { const data = getData(); assert.ok(data); }
```

#### 2. Clear Assertions

```javascript
// ❌ Bad - unclear what failed
assert.ok(result);

// ✅ Good - clear intent and context
assert.ok(result, `Expected valid result, got ${JSON.stringify(result)}`);
```

#### 3. Test Real Scenarios

```javascript
// ❌ Bad - testing implementation detail
assert.strictEqual(internalCounter, 3);

// ✅ Good - testing user-visible behavior
assert.strictEqual(renderedItems.length, 3);
```

#### 4. Use Descriptive Names

```javascript
// ❌ Bad
test('test1', ...);

// ✅ Good
test('should return 404 when route does not exist', ...);
```

#### 5. Keep Tests Fast

- Mock external services
- Use in-memory data where possible
- Avoid unnecessary sleeps
- Run expensive tests in separate suite

---

## Security

### Security Philosophy

#### Development-First Design

**Assumption**: Proxy runs in trusted development networks where:
- Developers have legitimate access to services
- Convenience and productivity outweigh hardened security
- Learning and experimentation are encouraged
- Systems are temporary and non-critical

**Not Designed For**:
- ❌ Production environments
- ❌ Untrusted networks (public WiFi, etc.)
- ❌ Hosting customer data
- ❌ Compliance requirements (HIPAA, PCI-DSS, etc.)

#### Defense in Depth

Even in development, we apply multiple security layers:
1. **Network Isolation** - Docker network boundaries
2. **Principle of Least Privilege** - Containers have minimal necessary permissions
3. **Secure Defaults** - Safe configurations out of the box
4. **Secret Management** - Environment variables, never in code
5. **Audit Trails** - Logs of configuration changes

### Threat Model

#### In Scope

We protect against:
- ✅ Accidental credential exposure (secrets in logs/configs)
- ✅ Container escape attempts (read-only mounts where possible)
- ✅ Resource exhaustion (malicious or accidental)
- ✅ Configuration tampering (backups, validation)
- ✅ Network eavesdropping (between containers)

#### Out of Scope

We do NOT protect against:
- ❌ Malicious container images (user's responsibility to vet)
- ❌ Host-level attacks (Docker host security assumed)
- ❌ Physical access to development machine
- ❌ Advanced persistent threats (APTs)

### Network Security

#### Container Isolation

**devproxy Network**:
- Bridge network (isolated from default bridge)
- Only explicitly joined containers can communicate
- DNS-based service discovery (no IP exposure)
- No direct access from host network (except exposed ports)

**Exposed Ports**:
```
8080 (HTTP)   → dev-proxy (nginx)
443  (HTTPS)  → dev-proxy (nginx, optional TLS)
3001 (API)    → dev-proxy-config-api (Node.js)
4040 (ngrok)  → dev-ngrok (tunnel admin)
```

**Recommendation**: Firewall these ports on public-facing interfaces

#### TLS/HTTPS

**Internal Communication**:
- Plain HTTP between containers (performance, complexity trade-off)
- Adequate for trusted Docker network

**External Tunnel**:
- ngrok provides TLS termination at tunnel edge
- HTTPS enforced for external access
- Self-signed certs available for localhost HTTPS (optional)

**Generating Self-Signed Certs**:
```bash
./smart-build.sh setup
# Creates .certs/dev.crt and .certs/dev.key
```

**Recommendation**: Use TLS for any non-local access

#### Tunnel Security

**ngrok Considerations**:
- Tunnel URL is publicly accessible by default
- Anyone with URL can access services
- ngrok logs requests (review privacy policy)

**Hardening Options**:
```yaml
# config/ngrok.yml
authtoken: YOUR_TOKEN
tunnels:
  dev-proxy:
    proto: http
    addr: dev-proxy:80
    # Add authentication
    auth: "username:password"
    # Or restrict by IP
    ip_restriction:
      allow_cidrs:
        - 203.0.113.0/24
```

**Recommendation**: Use ngrok auth or IP restrictions if sharing sensitive work

### Authentication & Authorization

#### Current State

**Built-In Password Authentication** (v1.0+):
- Admin password protection for all admin pages (`/status`, `/health`, `/reports`)
- Session-based authentication (7-day sessions)
- Auto-generated passwords if not configured
- API endpoints protected by session cookies
- Localhost-only password display endpoint

**Authentication Endpoints** (Fixed Paths):
- `POST /admin/login` - Authenticate and create session
- `POST /admin/logout` - Destroy session
- `GET /admin/show-password` - View password (localhost only)
- `GET /admin/check` - Internal auth validation (nginx `auth_request`)

**Security Features**:
- ✅ Auto-generated secure passwords (64 chars)
- ✅ Session-based auth with HttpOnly cookies
- ✅ Constant-time password comparison
- ✅ Rate limiting on failed attempts
- ✅ No default passwords

**Configuration**:
```bash
# .env
ADMIN_PASSWORD=your-secure-password-here
```

If not set, a secure random password is auto-generated and saved to `.env` on first startup.

**View Auto-Generated Password**:
```bash
# Localhost only (security restriction)
curl http://localhost:8080/admin/show-password
# Or visit in browser
open http://localhost:8080/admin/show-password
```

#### Additional Security Options

**Network-Level**:
```bash
# Only bind to localhost (not 0.0.0.0)
ports:
  - "127.0.0.1:8080:80"
  - "127.0.0.1:3001:3001"
```

**VPN/Tunnel**:
- Run proxy behind VPN for remote access
- Use SSH tunnel for port forwarding
- Configure ngrok with authentication

#### Future Enhancements

**Version 1.3** (see [PRODUCT.md](PRODUCT.md#roadmap)):
- Multiple authentication providers (OAuth, API keys)
- Role-based access control (read-only vs admin)
- User management UI
- Audit logging for all actions

### Secrets Management

#### Environment Variables

**Required Secrets**:
- `NGROK_AUTHTOKEN` - ngrok authentication
- `ADMIN_PASSWORD` - Admin dashboard password (auto-generated if not set)
- `OPENAI_API_KEY` - OpenAI API access (optional)

**Storage**: `.env` file (gitignored)

**Example**:
```bash
# .env
NGROK_AUTHTOKEN=your_token_here
ADMIN_PASSWORD=your-secure-password-here
OPENAI_API_KEY=sk-...
NGROK_STATIC_DOMAIN=your-domain.ngrok.app
```

**Security Practices**:
- ✅ Never commit .env to git
- ✅ Use different keys for different environments
- ✅ Rotate keys periodically
- ✅ Limit API key scopes (if provider supports)

#### Configuration Files

**Apps and Overrides**:
- Gitignored by default
- May contain sensitive upstream URLs or internal service names
- Backup files also gitignored

**Recommendation**: Don't hardcode credentials in nginx configs, use environment variables:
```nginx
# ❌ Bad
proxy_set_header Authorization "Bearer secret-token-123";

# ✅ Good
proxy_set_header Authorization $upstream_auth_token;
# Set $upstream_auth_token in separate env-based config
```

#### Chat History and Logs

**Calliope Chat History**:
- Stored in `.artifacts/calliope/chat-history.json`
- May contain sensitive questions or context
- Gitignored by default

**Healing Logs**:
- May reveal internal service names, routes
- Gitignored

**Recommendation**: Don't ask Calliope questions containing secrets (API keys, passwords)

### Container Security

#### Privileged Access

**dev-proxy-config-api**:
- Runs as root (required for Docker socket access)
- Mounts `/var/run/docker.sock` (can control host Docker)
- Can exec into other containers

**Risk**: Compromised config-api container can affect host

**Mitigation**:
- Use official base images only
- Regularly update dependencies
- Review code changes carefully
- Consider read-only Docker socket (limits healing capabilities)

#### Read-Only Filesystems

**dev-proxy (nginx)**:
- Most mounts are read-only (`:ro` flag)
- Config changes applied via regeneration, not direct edits

**Exception**: `.artifacts/` is read-write (for health reports)

#### Image Scanning

**Recommendation**: Scan images for vulnerabilities

```bash
# Using Trivy (example)
trivy image nginx:1.25-alpine
trivy image node:18-alpine
trivy image ngrok/ngrok:latest
```

**Update Policy**:
- Monitor security advisories for base images
- Update promptly for critical vulnerabilities
- Test updates in isolated environment first

### Data Security

#### Data at Rest

**Sensitive Files**:
- Configuration files (apps/, overrides/)
- Chat history (.artifacts/calliope/)
- Healing logs
- API keys (.env)

**Encryption**: Not encrypted by default (local filesystem security assumed)

**Recommendation**:
- Use encrypted filesystems (FileVault, LUKS, BitLocker)
- Secure backups if needed
- Delete old artifacts periodically

#### Data in Transit

**Internal (Container-to-Container)**:
- Plain HTTP (trusted network)
- Adequate for development

**External (Internet)**:
- HTTPS via ngrok tunnel
- TLS 1.2+ enforced by ngrok

#### Data Sent to Third Parties

**OpenAI API** (if enabled):
- User queries
- Selected documentation chunks (for context)
- System prompts

**NOT sent**:
- Configuration files
- Secret environment variables
- Full chat history

**ngrok**:
- All proxied HTTP traffic
- See ngrok privacy policy

**Recommendation**: Review OpenAI and ngrok privacy policies before using with sensitive data

### Logging and Monitoring

#### What Gets Logged

**nginx Access Logs**:
- Request paths, methods, status codes
- Client IPs (usually Docker IPs)
- User agents
- Response sizes and times

**API Logs** (stdout/stderr):
- Configuration changes
- Healing operations
- API requests
- Errors and warnings

**Health Reports**:
- Route status (up/down)
- HTTP status codes
- Response times

#### Log Security

**Secrets in Logs**:
- ✅ API keys NOT logged
- ✅ Environment variables NOT logged
- ⚠️ URLs may contain sensitive paths or query params

**Log Retention**:
- Docker logs: Limited by Docker config (default: JSON-file driver, no rotation)
- Health reports: Accumulate in `.artifacts/` until pruned
- Chat history: Last 200 messages

**Recommendation**:
```bash
# Rotate Docker logs
# docker-compose.yml
x-logging:
  &default-logging
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"

services:
  proxy:
    logging: *default-logging
```

### Incident Response

#### Suspected Compromise

**If you suspect container compromise**:

1. **Stop the proxy**:
   ```bash
   ./smart-build.sh down
   ```

2. **Inspect logs**:
   ```bash
   ./smart-build.sh logs proxy > proxy.log
   ./smart-build.sh logs config-api > api.log
   # Review for suspicious activity
   ```

3. **Check configuration changes**:
   ```bash
   git status
   git diff
   # Look for unexpected config modifications
   ```

4. **Rotate secrets**:
   - Generate new NGROK_AUTHTOKEN
   - Rotate OPENAI_API_KEY
   - Update .env file

5. **Rebuild from scratch**:
   ```bash
   docker-compose down -v  # Remove volumes
   docker system prune -a  # Clean images
   git pull origin main    # Get latest code
   ./smart-build.sh setup  # Fresh setup
   ```

#### Reporting Vulnerabilities

**Security issues should be reported privately**:

Email: security@example.com (or GitHub private report)

**Please include**:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

**We commit to**:
- Acknowledge within 48 hours
- Provide fix timeline within 7 days
- Credit reporter (unless they prefer anonymity)
- Publish advisory after fix is released

### Hardening Recommendations

#### For Local Development (Default)

1. ✅ Use .env for secrets (never commit)
2. ✅ Keep Docker and images updated
3. ✅ Firewall exposed ports from internet
4. ✅ Don't share ngrok URL publicly
5. ✅ Review third-party configs before installing

#### For Shared Development Environments

1. ✅ All of the above, plus:
2. ✅ Enable ngrok authentication
3. ✅ Bind ports to 127.0.0.1 only
4. ✅ Use VPN for remote access
5. ✅ Implement rate limiting
6. ✅ Regular security reviews

#### For Production-Like Environments

**Do NOT use Dev Tunnel Proxy in production without significant hardening**

If you must:
1. ✅ Enable authentication and authorization
2. ✅ Remove Docker socket access from config-api
3. ✅ Use read-only root filesystem where possible
4. ✅ Implement comprehensive logging and monitoring
5. ✅ Use real TLS certificates
6. ✅ Regular security audits and penetration testing
7. ✅ Disable Calliope or restrict to read-only mode

**Better**: Use production-grade proxies (nginx, Traefik, Envoy with proper hardening)

### Security Checklist

#### Initial Setup

- [ ] Create strong ngrok authtoken
- [ ] Set secure OPENAI_API_KEY (if using)
- [ ] Add .env to .gitignore (already included)
- [ ] Firewall ports 8080, 3001, 4040 from internet
- [ ] Review docker-compose.yml for custom needs

#### Ongoing Operations

- [ ] Rotate secrets quarterly
- [ ] Update Docker images monthly
- [ ] Review logs for anomalies weekly
- [ ] Prune old artifacts monthly
- [ ] Backup critical configs

#### Before Sharing Work

- [ ] Enable ngrok authentication
- [ ] Review configs for hardcoded secrets
- [ ] Test with least-privileged user
- [ ] Document access instructions securely
- [ ] Set expiration for shared URLs

---

## Known Issues

### Critical Issues

#### None Currently

All critical issues have been resolved. Previously resolved:
- ✅ Nginx refusing to start with offline upstreams (fixed with variable resolution)
- ✅ Mixed content errors on HTTPS tunnels (fixed with proxy headers)
- ✅ Duplicate location blocks causing conflicts (fixed with generator precedence)

### High Priority

#### H1: Port Conflicts on Fresh Install

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

#### H2: Initial Bundle Generation Failure

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

### Medium Priority

#### M1: Calliope RAG Requires OpenAI API Key

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

#### M2: ngrok Tunnel Discovery Delay

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

#### M3: Large Config Files Slow Bundle Generation

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

#### M4: Regex Location Blocks Lower Priority

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
**Documentation**: Added to CONFIGURATION.md

#### M5: Conflicting Server Name Warning

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

### Low Priority

#### L1: Theme Preference Not Synced

**Component**: Status UI  
**Impact**: Theme setting doesn't sync across tabs

**Symptoms**:
- Set dark mode in one tab
- Other tabs remain in light mode until refresh

**Workaround**: Refresh other tabs

**Status**: Browser localStorage limitation  
**Fix**: Use BroadcastChannel API for cross-tab sync (future)

#### L2: Chat History Not Synced to Server

**Component**: Calliope chat  
**Impact**: Chat history in browser localStorage may differ from server

**Symptoms**:
- Clear browser data → lose chat history
- Different browsers have different conversations

**Workaround**: Export chat with Copy button before clearing browser data

**Status**: Design decision (client-side chat for performance)  
**Fix**: Add server-side sync option (planned)

#### L3: No Auto-Cleanup for Old Artifacts

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

#### L4: WebSocket Connections Show as Errors in Logs

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

#### L5: Status Dashboard Doesn't Auto-Refresh

**Component**: Status UI  
**Impact**: Need manual refresh to see config changes

**Symptoms**:
- Add new route via API
- Status page doesn't show it until refresh

**Workaround**: Click Rescan button or refresh page

**Status**: Design decision (avoid constant network traffic)  
**Fix**: Add auto-refresh toggle (planned)

#### L6: Embedding Reindex Requires API Running

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

### Limitations

#### L1: Single nginx Instance

**Limitation**: No built-in load balancing across multiple nginx containers

**Impact**: Single point of failure for proxying

**Workaround**: Use external load balancer if high availability needed

**Future**: Multi-nginx cluster support

#### L2: No TLS for Inter-Container Communication

**Limitation**: devproxy network uses plain HTTP

**Impact**: Traffic visible to other containers on same host

**Mitigation**: Docker network isolation provides adequate security for dev

**Future**: Optional mTLS for sensitive environments

#### L3: Healing Patterns Are Generic

**Limitation**: Patterns can't reference specific app names or file paths

**Impact**: Some app-specific fixes require manual intervention

**Mitigation**: Use overrides/ for app-specific proxy-side fixes

**Future**: App-scoped pattern namespaces

#### L4: OpenAI Dependency for Advanced Features

**Limitation**: AI Q&A and novel issue analysis require OpenAI API

**Impact**: Cost and external dependency

**Mitigation**: Pattern-based healing works without OpenAI

**Future**: Support local LLMs (Ollama, LocalAI)

#### L5: No Built-In Authentication

**Limitation**: Status dashboard and API have no auth

**Impact**: Anyone with network access can view/modify configs

**Mitigation**: Use only in trusted development networks

**Future**: Optional basic auth or OAuth integration

#### L6: Limited to Docker Networks

**Limitation**: Apps must be Docker containers on devproxy network

**Impact**: Can't proxy to host services easily

**Workaround**: Use `host.docker.internal` for host services

**Future**: Better host integration options

### Resolved Issues

#### R1: Nginx Won't Start If Upstream Is Down

**Resolution**: Implemented variable-based upstream resolution (v0.9) and graceful error handling (v1.1)

**Fix**: 
- All proxy_pass directives now use nginx variables with runtime DNS resolution
- Added `proxy_intercept_errors on` and error_page handlers for unavailable upstreams
- Nginx now starts successfully even when configured services are offline
- Returns proper JSON error messages (503) when services are unavailable
- Emergency fallback disables app bundle if core config has issues

#### R2: Mixed Content Errors on HTTPS Tunnel

**Resolution**: Added proper X-Forwarded-Proto headers and absolute_redirect off

**Fix**: nginx forwards correct protocol information to apps

#### R3: Apps Interfere with Each Other's Routes

**Resolution**: Implemented conflict detection and precedence rules

**Fix**: generateAppsBundle.js detects and resolves conflicts automatically

#### R4: No Way to Override App Configurations

**Resolution**: Created overrides/ directory system

**Fix**: Overrides take precedence over apps, allowing proxy-managed fixes

#### R5: Manual nginx Reloads Required

**Resolution**: API automatically regenerates and reloads

**Fix**: POST /api/apps/install triggers end-to-end update

#### R6: Calliope Couldn't Access Documentation

**Resolution**: Implemented RAG system with embeddings

**Fix**: Calliope now has semantic search over all docs (v1.0)

#### R7: No Detection of Documentation Changes

**Resolution**: Added automatic reindexing to smart-build.sh

**Fix**: Doc changes detected via hashing, triggers reindex automatically

#### R8: Calliope Chat Buttons Fall Outside Drawer

**Resolution**: Fixed flexbox constraints and removed sticky positioning

**Fix**: Input and buttons now stay together in drawer (December 2025)

### Reporting Issues

#### How to Report

1. **Check this document** - Issue may be known
2. **Check USER_GUIDE.md** - Solution may exist
3. **Ask Calliope** - She may have insights
4. **Check logs**: 
   ```bash
   ./smart-build.sh logs proxy
   ./smart-build.sh logs config-api
   ```

#### Information to Include

- System info (OS, Docker version)
- Proxy logs (last 50 lines)
- Config files (sanitized, no secrets)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if UI issue)

#### Priority Definitions

- **Critical**: System unusable, data loss, security issue
- **High**: Major feature broken, significant workaround needed
- **Medium**: Feature partially broken, workaround exists
- **Low**: Minor inconvenience, cosmetic, or nice-to-have

---

## Operational Best Practices

### Maintenance Schedule

#### Daily
- Monitor status dashboard for route health
- Review any new configuration changes

#### Weekly
- Check logs for anomalies
- Review Calliope healing logs
- Verify all routes are accessible

#### Monthly
- Update Docker images
- Prune old artifacts
- Review and rotate secrets
- Update documentation

#### Quarterly
- Full security review
- Rotate all API keys
- Backup critical configurations
- Performance assessment

### Backup Strategy

**What to Backup**:
- Configuration files (apps/, overrides/)
- Healing knowledge base (.artifacts/calliope/)
- Important chat history
- Custom scripts and tools

**What NOT to Backup**:
- Generated bundles (regenerated)
- Health reports (regenerated)
- Test artifacts
- Docker images (pull from registry)

**Recommended Approach**:
```bash
# Create backup directory
mkdir -p backups/$(date +%Y-%m-%d)

# Backup configs
cp -r apps/ backups/$(date +%Y-%m-%d)/
cp -r overrides/ backups/$(date +%Y-%m-%d)/

# Backup Calliope data
cp -r .artifacts/calliope/ backups/$(date +%Y-%m-%d)/

# Create archive
tar -czf backups/dev-proxy-$(date +%Y-%m-%d).tar.gz backups/$(date +%Y-%m-%d)/
```

### Monitoring

**Key Metrics to Track**:
- Proxy uptime
- Route health (% healthy)
- Config reload success rate
- Calliope healing success rate
- Response times
- Error rates

**Tools**:
- Built-in health reports
- Status dashboard
- Docker stats (`docker stats`)
- Custom monitoring scripts

### Disaster Recovery

**Scenario 1: Complete Proxy Failure**
```bash
# 1. Stop everything
./smart-build.sh down

# 2. Restore from backup
tar -xzf backups/dev-proxy-YYYY-MM-DD.tar.gz
cp -r backups/YYYY-MM-DD/apps/* apps/
cp -r backups/YYYY-MM-DD/overrides/* overrides/

# 3. Rebuild
./smart-build.sh setup
./smart-build.sh up
```

**Scenario 2: Corrupted Configuration**
```bash
# 1. Check git status
git status

# 2. Restore specific files
git checkout HEAD -- apps/problematic.conf

# 3. Or use backup files
cp apps/myapp.conf.backup.TIMESTAMP apps/myapp.conf

# 4. Reload
./smart-build.sh reload
```

**Scenario 3: Lost Tunnel URL**
```bash
# Check ngrok logs
docker logs dev-ngrok | grep "https://"

# Or check API
curl http://localhost:4040/api/tunnels | jq
```

---

## See Also

- **[USER_GUIDE.md](USER_GUIDE.md)** - Getting started and daily workflows
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and data flow
- **[CONFIGURATION.md](CONFIGURATION.md)** - Configuration management
- **[CALLIOPE_ASSISTANT.md](CALLIOPE_ASSISTANT.md)** - AI assistant capabilities
- **[API.md](API.md)** - Complete API reference
- **[PRODUCT.md](PRODUCT.md)** - Product vision and roadmap

