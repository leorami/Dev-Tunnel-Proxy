# Dev Tunnel Proxy Roadmap

**Last Updated**: December 2025  
**Current Version**: 1.0  
**Planning Horizon**: 12 months

## Roadmap Philosophy

This roadmap balances three priorities:

1. **Developer Experience** - Make common workflows effortless
2. **AI Intelligence** - Expand Calliope's capabilities thoughtfully
3. **Production Readiness** - Bridge the gap from dev to production

Features are prioritized based on:
- User impact (how many developers benefit?)
- Implementation complexity
- Dependencies on other features
- Community feedback

---

## Version 1.1 (Q1 2025) - Polish & Performance

**Theme**: Refinement of core features, performance optimization

### Automatic Artifact Cleanup

**Status**: Planned  
**Priority**: High  
**Effort**: Medium

**Description**: Automatic management of generated files to prevent unbounded disk growth

**Features**:
- Auto-prune health reports (keep last 50 by default)
- Clean test artifacts older than N days
- Remove stale backup configs (>30 days)
- Configurable retention policies via API
- Manual cleanup remains available

**Benefit**: "Set and forget" artifact management

### Parallel Health Scanning

**Status**: Planned  
**Priority**: High  
**Effort**: Medium

**Description**: Concurrent route probing for faster scan cycles

**Current**: Serial probing (~100ms per route)  
**Proposed**: Parallel with configurable concurrency (~20ms total for 10 routes)

**Features**:
- Configurable concurrency level (default: 5)
- Connection pooling for efficiency
- Timeout handling per route
- Aggregate reporting

**Benefit**: 5-10x faster health monitoring

### Enhanced Conflict Resolution UI

**Status**: Planned  
**Priority**: Medium  
**Effort**: Medium

**Description**: Visual conflict resolution workflow in status dashboard

**Features**:
- Visual diff of conflicting location blocks
- One-click resolution (choose winner)
- Route renaming wizard
- Preview of changes before applying
- Automatic bundle regeneration

**Benefit**: Reduce time to resolve conflicts from minutes to seconds

### Incremental Documentation Reindexing

**Status**: Planned  
**Priority**: Medium  
**Effort**: Low

**Description**: Only re-embed changed documentation files

**Current**: Full reindex on any doc change  
**Proposed**: Track per-file hashes, embed only changed files

**Features**:
- SHA hash per document
- Incremental embedding
- Cost optimization (pay only for changes)
- Faster reindex (seconds instead of ~10s)

**Benefit**: 90% reduction in reindex time and cost

---

## Version 1.2 (Q2 2025) - Intelligence & Integration

**Theme**: Expand AI capabilities, improve integrations

### Local LLM Support (Ollama)

**Status**: Planned  
**Priority**: High  
**Effort**: High

**Description**: Support local language models as alternative to OpenAI

**Features**:
- Ollama integration for chat
- Local embedding models (e.g., mxbai-embed-large)
- Automatic fallback (local → OpenAI)
- Configuration via .env
- Model download helper

**Models Considered**:
- Chat: llama2, mistral, codellama
- Embeddings: nomic-embed-text, mxbai-embed-large

**Benefit**: No API costs, works offline, better privacy

### Pattern Confidence Scoring

**Status**: Planned  
**Priority**: Medium  
**Effort**: Medium

**Description**: Statistical tracking of healing pattern success rates

**Features**:
- Success/failure tracking per pattern
- Confidence scores (0.0-1.0)
- Automatic pattern disabling (if confidence <0.5)
- Pattern effectiveness dashboard
- A/B testing for new patterns

**Benefit**: More reliable automatic healing

### Multi-App Site Audits

**Status**: Planned  
**Priority**: Medium  
**Effort**: Medium

**Description**: Audit multiple apps in single operation

**Features**:
- Crawl all routes from /routes.json
- Per-app audit reports
- Aggregated issues dashboard
- Automated healing suggestions
- Scheduled audit runs

**Benefit**: Comprehensive health visibility across entire system

### Real-Time Configuration Updates

**Status**: Planned  
**Priority**: Low  
**Effort**: Medium

**Description**: WebSocket-based config sync to dashboard

**Current**: Polling every 30s  
**Proposed**: Server-sent events or WebSocket

**Features**:
- Instant UI updates on config changes
- Live health status streaming
- Calliope thinking events via WebSocket
- Reduced network overhead

**Benefit**: Better user experience, lower latency

---

## Version 1.3 (Q3 2025) - Scale & Security

**Theme**: Production-grade features, enterprise readiness

### Authentication & Authorization

**Status**: Planned  
**Priority**: High  
**Effort**: High

**Description**: Secure access to dashboard and API

**Options Considered**:
- Basic auth (simple, widely supported)
- OAuth 2.0 (Google, GitHub)
- API keys for programmatic access
- Role-based access control (read-only, admin)

**Features**:
- Optional auth (off by default for dev)
- Multiple auth providers
- API key management
- Audit logging

**Benefit**: Safe for non-local networks

### Secrets Management

**Status**: Planned  
**Priority**: High  
**Effort**: High

**Description**: Secure handling of sensitive configuration

**Features**:
- Vault integration (optional)
- Encrypted storage of secrets
- Secret injection into apps
- Environment variable management
- Rotation support

**Benefit**: Production-ready security

### Multi-Environment Support

**Status**: Planned  
**Priority**: Medium  
**Effort**: High

**Description**: Manage dev, staging, and production configs

**Features**:
- Environment-specific configuration
- Promotion workflows (dev → staging → prod)
- Environment variables per environment
- Isolated networks
- Config diff and rollback

**Benefit**: Bridge dev-to-prod gap

### Kubernetes Integration

**Status**: Planned  
**Priority**: Medium  
**Effort**: Very High

**Description**: Deploy proxy into Kubernetes clusters

**Features**:
- Helm chart for deployment
- Ingress controller integration
- Service discovery via k8s DNS
- ConfigMap-based configuration
- Pod-to-pod routing

**Benefit**: Production-grade orchestration

---

## Version 1.4 (Q4 2025) - Ecosystem & Extensions

**Theme**: Integrations, developer tools, community features

### VS Code Extension

**Status**: Planned  
**Priority**: High  
**Effort**: High

**Description**: Manage proxy directly from editor

**Features**:
- View routes in sidebar
- Quick actions (diagnose, reload, open)
- Calliope chat in panel
- Route health indicators
- Config validation

**Benefit**: Never leave the editor

### CI/CD Integration

**Status**: Planned  
**Priority**: Medium  
**Effort**: Medium

**Description**: Use proxy in automated pipelines

**Features**:
- GitHub Actions workflow
- GitLab CI template
- Docker Compose override for CI
- Headless mode (no dashboard)
- Test result exports

**Benefit**: E2E testing in CI

### Plugin System

**Status**: Planned  
**Priority**: Medium  
**Effort**: High

**Description**: Extensibility framework for custom features

**Features**:
- Plugin manifest format
- Hooks (pre-reload, post-heal, etc.)
- Custom healing patterns
- Dashboard widgets
- API endpoint extensions

**Benefit**: Community-driven features

### Analytics Dashboard

**Status**: Planned  
**Priority**: Low  
**Effort**: Medium

**Description**: Usage insights and trends

**Features**:
- Request volume over time
- Most-used routes
- Healing success rates
- Performance metrics
- Export to CSV/JSON

**Benefit**: Data-driven optimization

---

## Beyond 1.4 - Future Vision

### Hosted SaaS Version

**Description**: Cloud-hosted Dev Tunnel Proxy as a service

**Features**:
- No local setup required
- Team collaboration features
- Persistent tunnels
- Enhanced analytics
- Premium support

**Business Model**: Freemium (free tier + paid plans)

### Advanced AI Features

**Possible Capabilities**:
- Predictive issue detection (before failure)
- Automatic performance optimization
- Load testing recommendations
- Security vulnerability scanning
- Code generation for new routes

**Challenge**: Balancing automation with developer control

### Production Mode

**Description**: Use same proxy from dev to production

**Features**:
- High-availability setup (multiple nginx instances)
- Production-grade logging (structured, centralized)
- Observability integration (Prometheus, Grafana)
- Advanced rate limiting and security
- Blue-green deployments

**Challenge**: Maintaining dev-friendly UX while adding production complexity

### Mobile App

**Description**: Monitor and manage proxy from mobile device

**Features**:
- Health dashboard on mobile
- Push notifications for issues
- Quick actions (reload, diagnose)
- Calliope chat
- Route browser

**Platform**: React Native (iOS + Android)

---

## Community Wishlist

**Features requested by users** (vote on GitHub Discussions)

### Under Consideration

- 🗳️ **Docker Desktop Extension** - Manage proxy from Docker Desktop UI
- 🗳️ **GraphQL API** - Alternative to REST for complex queries
- 🗳️ **Terraform Provider** - Infrastructure as code integration
- 🗳️ **Windows Subsystem for Linux (WSL) Support** - Better Windows integration
- 🗳️ **Safari Extension** - Quick access to tunnel and routes
- 🗳️ **Slack Bot** - Calliope integration for team chat
- 🗳️ **Auto-SSL with Let's Encrypt** - Production TLS certificates

### Not Planned (But Open to PR)

- Custom nginx modules (too specific, use overrides/)
- Database-backed configuration (adds complexity)
- Built-in load testing (use external tools like k6)

---

## How to Influence the Roadmap

### 1. GitHub Discussions

Vote on features, share use cases, propose new ideas

### 2. GitHub Issues

Report bugs, request features, provide detailed requirements

### 3. Pull Requests

Contribute implementations (coordinate first for large features)

### 4. Community Forum

Share your workflow, learn from others, discover patterns

---

## Development Principles

As we build new features, we maintain these principles:

### 1. Developer Experience First

- Intuitive defaults
- Minimal configuration
- Clear error messages
- Helpful documentation

### 2. AI as Assistant, Not Replacement

- Calliope augments, doesn't replace developer judgment
- Always show what's happening
- Allow manual override
- Transparent decision-making

### 3. Backward Compatibility

- Existing configs keep working
- Opt-in for new features
- Clear migration paths
- Deprecation warnings (1 version ahead)

### 4. Performance Matters

- Fast startup (<5s for proxy)
- Quick reloads (<100ms)
- Efficient scanning
- Low resource usage

### 5. Security by Design

- Secure defaults
- Principle of least privilege
- No secrets in logs
- Regular security reviews

---

## Version History

### v1.0 (December 2025) - Current

**Major Features**:
- ✅ Multi-container architecture
- ✅ Composition-based configuration
- ✅ Automatic conflict detection
- ✅ Calliope AI assistant with personality
- ✅ RAG system with documentation embeddings
- ✅ Auto-reindexing on doc changes
- ✅ Enhanced status dashboard
- ✅ Playwright UI testing
- ✅ Site auditor integration

### v0.9 (November 2025)

**Major Features**:
- ✅ Variable-based upstream resolution
- ✅ Pattern-based healing
- ✅ Healing knowledge base
- ✅ Overrides system
- ✅ Bundle diagnostics

### v0.8 (October 2025)

**Major Features**:
- ✅ REST API for configuration
- ✅ Status dashboard with health monitoring
- ✅ Auto-scan service
- ✅ ngrok tunnel integration

### v0.7 (September 2025)

**Initial Release**:
- ✅ Basic nginx proxy
- ✅ Docker Compose setup
- ✅ Manual configuration
- ✅ Simple health checks

---

## See Also

- **[Product Overview](PRODUCT.md)** - Vision and value propositions
- **[Architecture](ARCHITECTURE.md)** - Technical design
- **[Known Issues](KNOWN_ISSUES.md)** - Current limitations
- **[Contributing Guide](../README.md#how-to-contribute)** - How to help build these features

