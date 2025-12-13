# Product Overview: Dev Tunnel Proxy

**Last Updated**: December 2025  
**Version**: 1.0

## Vision

**Dev Tunnel Proxy** is a development infrastructure platform that makes microservices development feel like working on a monolith—without the coupling. It provides intelligent routing, secure tunneling, and AI-powered self-healing so teams can focus on building features instead of wrestling with infrastructure.

## The Problem We Solve

### Development Environment Complexity

Modern development involves:
- **Multiple services** running simultaneously
- **Different ports** to remember and manage
- **Routing conflicts** between projects
- **Tunnel management** for sharing work
- **Configuration duplication** across projects
- **Integration debugging** across service boundaries

Traditional solutions:
- ❌ Manual proxy configs (error-prone, hard to maintain)
- ❌ Port mapping chaos (app1:3000, app2:3001, app3:8080...)
- ❌ Each app configures its own tunnel (resource waste)
- ❌ No visibility into what's working or broken

### Our Approach

✅ **Single unified proxy** for all development services  
✅ **Automatic conflict detection** with clear resolution paths  
✅ **Shared ngrok tunnel** for all apps simultaneously  
✅ **Visual dashboard** showing health and routes  
✅ **AI assistant** that fixes routing issues automatically  
✅ **Configuration as code** with programmatic API

## Core Value Propositions

### 1. Zero Configuration Overhead

**Problem**: Every new service requires proxy setup, tunnel config, route coordination

**Solution**: Apps contribute their routing needs via simple nginx snippets. Proxy composes, deconflicts, and applies automatically.

```javascript
// From within your app container
fetch('http://dev-proxy:8080/api/apps/install', {
  method: 'POST',
  body: JSON.stringify({
    name: 'myapp',
    content: nginxConfig
  })
});
// → App is now routed and tunneled
```

**Value**: 5 minutes from app start to public URL, every time.

### 2. Team Collaboration Without Friction

**Problem**: Sharing localhost requires ngrok setup per developer, different URLs for each service

**Solution**: Single persistent tunnel serves all apps. One URL to share, works for entire stack.

```
https://your-team.ngrok.app/
  ├─► /lyra/      → Lyra app
  ├─► /encast/    → Encast app
  ├─► /api/       → Shared API
  └─► /admin/     → Admin dashboard
```

**Value**: Stakeholders bookmark one URL, see all work in progress.

### 3. Intelligent Conflict Resolution

**Problem**: Multiple apps want `/api/`, unclear which should win

**Solution**: Automatic detection with visual conflict UI and programmatic resolution API.

**Value**: No more "it works on my machine" debugging.

### 4. Proactive Health Monitoring

**Problem**: Silent failures in dev environments waste hours

**Solution**: Continuous scanning + visual dashboard + Calliope alerts

**Value**: Know about problems before you encounter them.

### 5. AI-Powered Self-Healing

**Problem**: Routing bugs require nginx expertise to diagnose and fix

**Solution**: Calliope AI assistant learns common patterns and fixes them automatically

**Example Scenario**:
- React app deploys with new build
- Assets return 404 (forgot to set basePath)
- Calliope detects pattern, applies fix, verifies success
- Developer notified: "I noticed /myapp had asset 404s and fixed them! 💖"

**Value**: 80% of routing issues heal themselves.

## Key Features

### Configuration Management

**Composition-Based Architecture**
- Apps contribute nginx snippets (gitignored, local)
- Proxy composes into single bundle
- Automatic conflict detection and precedence
- Provenance tracking (know which file contributed what)

**Smart Defaults**
- Variable-based upstreams (nginx starts even if apps are down)
- WebSocket support (HMR just works)
- Proper proxy headers (apps see correct client info)
- TLS termination (HTTPS tunnel → HTTP internally)

**API-First**
- Programmatic config management
- No manual file editing required
- Transactional updates (test before apply)
- Rollback on failure

### Status Dashboard

**Visual Route Management**
- Grouped by upstream service
- Parent-child relationships
- Collapsible cards
- Color-coded health (green/yellow/red)

**Advanced Filtering**
- Search by route path
- Filter by severity (ok/warn/err)
- Filter by status code (200, 404, 502)
- Target-specific filters (ngrok:200, localhost:404)

**Live Actions**
- Open route in new tab (via tunnel)
- Diagnose with Calliope
- Reload configurations
- Export route data

**Theme Support**
- Light and dark modes
- Persistent preference
- Accessible design

### Calliope AI Assistant

**Personality**: Caring, youthful, proactive—like a junior engineer who genuinely wants to help

**Core Capabilities**:
- Natural language Q&A about capabilities and configuration
- Automatic detection of common routing issues
- Pattern-based healing (no OpenAI needed for known issues)
- Deep analysis with GPT-4o-mini (for novel problems)
- Learning system (successful fixes become patterns)

**Interaction Modes**:
- Chat interface (ask questions)
- Route diagnostics (click stethoscope icon)
- Automatic monitoring (proactive checks)
- API endpoints (programmatic healing)

**Knowledge Base**:
- RAG system with semantic search
- ~97k characters of documentation embedded
- Automatic reindexing when docs change
- Answers grounded in actual project documentation

### Secure Tunneling

**ngrok Integration**
- Static or dynamic domains
- Single tunnel for all apps
- Automatic discovery and registration
- Web interface (port 4040)

**Security Features**:
- TLS termination at tunnel edge
- Self-signed certs for local HTTPS (optional)
- Network isolation via Docker
- No auth by default (dev use case)

### Testing & Quality

**Automated Health Monitoring**
- Continuous route scanning (every 15s)
- Local and tunnel target testing
- Historical reports
- JSON API for integration

**UI Testing**
- Playwright-based test suite
- Screenshot capture
- Failure videos
- Trace debugging

**Site Auditor**
- Multi-viewport screenshots
- Console error detection
- Network failure tracking
- Computed styles export
- Crawling support

## Use Cases

### 1. Microservices Development

**Scenario**: Team building e-commerce platform with separate frontend, API, admin, and payment services

**Benefits**:
- Single tunnel URL for all services
- Automatic routing with conflict detection
- Health dashboard shows entire system state
- Calliope helps debug integration issues

### 2. Client Demos

**Scenario**: Designer needs to show work-in-progress to client

**Benefits**:
- Persistent ngrok URL (never changes)
- Client bookmarks URL, checks progress anytime
- Multiple apps under single domain
- Professional appearance (not localhost:3000)

### 3. Integration Testing

**Scenario**: QA needs to test frontend + backend integration

**Benefits**:
- Both services accessible via proxy
- Route health monitoring detects failures
- Playwright tests can run against tunneled URLs
- Historical reports for debugging

### 4. Learning/Training

**Scenario**: Teaching web development or DevOps concepts

**Benefits**:
- Students don't need local nginx expertise
- Visual feedback on routing concepts
- Calliope explains what's happening
- Examples for common frameworks

### 5. Open Source Development

**Scenario**: Contributor wants to test pull request with real infrastructure

**Benefits**:
- Quick setup (docker-compose up)
- No cloud account needed
- Shareable tunnel URL
- Self-healing reduces setup friction

## Target Audience

### Primary Users

**Full-Stack Developers**
- Need local development environment
- Work with multiple services
- Value automation and smart defaults
- Want to focus on features, not infrastructure

### Secondary Users

**DevOps Engineers**
- Evaluate for team adoption
- Appreciate clean architecture
- May extend or customize
- Care about Docker best practices

**Engineering Teams**
- Need consistent development setup
- Share work frequently
- Value collaboration tools
- Want less time on environment setup

### Adjacent Users

**Designers/Product Managers**
- Need access to development work
- Don't run services locally
- Benefit from stable tunnel URLs
- Appreciate visual dashboard

## Competitive Landscape

### vs. Local Reverse Proxies (Caddy, Traefik)

**Strengths**:
- ✅ Tailored for development workflows
- ✅ AI-powered troubleshooting
- ✅ Visual dashboard with health monitoring
- ✅ Automatic conflict detection

**Trade-offs**:
- ❌ Less general-purpose
- ❌ Docker-focused (not bare-metal friendly)

### vs. ngrok Alone

**Strengths**:
- ✅ Multiple services under one tunnel
- ✅ Intelligent routing and conflict resolution
- ✅ Health monitoring and debugging tools
- ✅ Configuration management API

**Trade-offs**:
- ❌ More complex setup
- ❌ Docker required

### vs. Cloud Development Environments (Gitpod, Codespaces)

**Strengths**:
- ✅ Run locally (no cloud dependency)
- ✅ Lower latency (no round-trip to cloud)
- ✅ Works offline (except tunnel)
- ✅ Full Docker socket access

**Trade-offs**:
- ❌ Requires local Docker
- ❌ Less reproducible (local configs vary)

### vs. Kubernetes in Docker (kind, k3d)

**Strengths**:
- ✅ Simpler mental model (nginx, not k8s)
- ✅ Faster startup (no cluster overhead)
- ✅ Lower resource usage
- ✅ Better for individual developers

**Trade-offs**:
- ❌ Not production-like
- ❌ No pod orchestration

## Business Model

### Current: Open Source (MIT License)

**Value Creation**:
- Reduce development friction
- Improve team collaboration
- Accelerate onboarding
- Demonstrate AI capabilities

**Value Capture**:
- None (free and open)
- Community contributions
- Inspiration for commercial products

### Future Possibilities

**Hosted Version**:
- SaaS tunnel service with enhanced features
- Team management and analytics
- Integration with CI/CD platforms
- Enterprise support

**Professional Features**:
- Advanced security (auth, mTLS, secrets management)
- Multi-environment support (dev/staging/prod)
- Kubernetes integration
- Premium healing patterns

**Training/Consulting**:
- Workshops on development workflows
- Custom integration services
- Architecture consulting

## Success Metrics

### User Adoption

- GitHub stars and forks
- Docker Hub pulls
- Community contributions
- Issue reports and discussions

### User Value

- Time saved on environment setup (target: 80% reduction)
- Routing issues self-healed (target: 80%)
- Config conflicts prevented (target: 95%)
- Team collaboration improvements (qualitative)

### Technical Quality

- Test coverage (>80%)
- Documentation completeness
- Performance (reload <100ms)
- Reliability (proxy uptime >99.9%)

## Roadmap Highlights

### Near-Term (Next 3 Months)

- Automatic artifact cleanup
- Parallel health scanning
- Local LLM support (Ollama)
- Enhanced conflict resolution UI

### Mid-Term (3-6 Months)

- Multi-environment support
- Kubernetes integration
- Real-time WebSocket updates
- Advanced analytics

### Long-Term (6-12 Months)

- Hosted service beta
- Enterprise features (auth, secrets)
- VS Code extension
- CI/CD integrations

See **[Roadmap](ROADMAP.md)** for complete details.

## Why This Matters

### Development Should Be Joyful

Infrastructure problems drain energy and creativity. Every minute spent debugging routing is a minute not spent building features. Dev Tunnel Proxy removes friction so developers can focus on what they love: building great products.

### AI Should Empower, Not Replace

Calliope demonstrates thoughtful AI integration—she handles repetitive tasks (routing fixes) while empowering developers to understand and control their systems. She's an assistant, not a replacement.

### Inspiration from Resilience

Named after the author's daughter who lives with tuberous sclerosis complex (TSC), Calliope embodies resilience, empathy, and proactive problem-solving. Just as she navigates challenges with determination and care, the Calliope AI helps development environments stay healthy and productive.

If this project inspires you, consider supporting families affected by TSC through the [TSC Alliance](https://www.tscalliance.org/).

---

## See Also

- **[User Guide](USER_GUIDE.md)** - Getting started with Dev Tunnel Proxy
- **[Architecture](ARCHITECTURE.md)** - Technical design and decisions
- **[Roadmap](ROADMAP.md)** - Future plans and priorities
- **[Calliope AI Assistant](CALLIOPE-AI-ASSISTANT.md)** - Capabilities and personality

