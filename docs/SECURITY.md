# Security Guide

**Last Updated**: December 2025  
**Version**: 1.0

## Overview

Dev Tunnel Proxy is designed for **local development environments** where security requirements differ from production. This document outlines the current security model, known considerations, and recommendations for different deployment scenarios.

---

## Security Philosophy

### Development-First Design

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

### Defense in Depth

Even in development, we apply multiple security layers:
1. **Network Isolation** - Docker network boundaries
2. **Principle of Least Privilege** - Containers have minimal necessary permissions
3. **Secure Defaults** - Safe configurations out of the box
4. **Secret Management** - Environment variables, never in code
5. **Audit Trails** - Logs of configuration changes

---

## Threat Model

### In Scope

We protect against:
- ✅ Accidental credential exposure (secrets in logs/configs)
- ✅ Container escape attempts (read-only mounts where possible)
- ✅ Resource exhaustion (malicious or accidental)
- ✅ Configuration tampering (backups, validation)
- ✅ Network eavesdropping (between containers)

### Out of Scope

We do NOT protect against:
- ❌ Malicious container images (user's responsibility to vet)
- ❌ Host-level attacks (Docker host security assumed)
- ❌ Physical access to development machine
- ❌ Advanced persistent threats (APTs)

---

## Network Security

### Container Isolation

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

### TLS/HTTPS

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

### Tunnel Security

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

---

## Authentication & Authorization

### Current State

**No Built-In Authentication**:
- Status dashboard is publicly accessible (on devproxy network)
- API endpoints have no auth
- Configuration changes are unrestricted

**Rationale**: Development simplicity, trusted environment assumption

### Workarounds

**Network-Level**:
```bash
# Only bind to localhost (not 0.0.0.0)
ports:
  - "127.0.0.1:8080:80"
  - "127.0.0.1:3001:3001"
```

**Nginx Basic Auth** (for dashboard):
```nginx
location /status {
  auth_basic "Dev Proxy Dashboard";
  auth_basic_user_file /etc/nginx/.htpasswd;
  # ... rest of config
}
```

**API Gateway** (for API):
- Run proxy behind authenticated gateway
- Use VPN for remote access
- SSH tunnel for port forwarding

### Future Plans

**Version 1.3** (see [Roadmap](ROADMAP.md)):
- Optional authentication (off by default)
- Multiple auth providers (basic, OAuth, API keys)
- Role-based access control (read-only, admin)

---

## Secrets Management

### Environment Variables

**Required Secrets**:
- `NGROK_AUTHTOKEN` - ngrok authentication
- `OPENAI_API_KEY` - OpenAI API access (optional)

**Storage**: `.env` file (gitignored)

**Example**:
```bash
# .env
NGROK_AUTHTOKEN=your_token_here
OPENAI_API_KEY=sk-...
NGROK_STATIC_DOMAIN=your-domain.ngrok.app
```

**Security Practices**:
- ✅ Never commit .env to git
- ✅ Use different keys for different environments
- ✅ Rotate keys periodically
- ✅ Limit API key scopes (if provider supports)

### Configuration Files

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

### Chat History and Logs

**Calliope Chat History**:
- Stored in `.artifacts/calliope/chat-history.json`
- May contain sensitive questions or context
- Gitignored by default

**Healing Logs**:
- May reveal internal service names, routes
- Gitignored

**Recommendation**: Don't ask Calliope questions containing secrets (API keys, passwords)

---

## Container Security

### Privileged Access

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

### Read-Only Filesystems

**dev-proxy (nginx)**:
- Most mounts are read-only (`:ro` flag)
- Config changes applied via regeneration, not direct edits

**Exception**: `.artifacts/` is read-write (for health reports)

### Image Scanning

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

---

## API Security

### Input Validation

**POST /api/apps/install**:
- Validates nginx syntax (basic)
- No SQL injection risk (no database)
- No script injection (configs are parsed, not executed as shell)

**Known Limitation**: Advanced nginx syntax errors may not be caught until `nginx -t`

### Rate Limiting

**Current**: None (trusted environment assumption)

**Recommendation for Shared Environments**:
```nginx
# Add to config/default.conf
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
location /api/ {
  limit_req zone=api burst=20;
  # ...
}
```

### CORS

**Current**: CORS not enforced (API and dashboard on same origin)

**If Separating**: Configure appropriate CORS headers

```javascript
res.setHeader('Access-Control-Allow-Origin', 'https://trusted-dashboard.example.com');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
```

---

## Data Security

### Data at Rest

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

### Data in Transit

**Internal (Container-to-Container)**:
- Plain HTTP (trusted network)
- Adequate for development

**External (Internet)**:
- HTTPS via ngrok tunnel
- TLS 1.2+ enforced by ngrok

### Data Sent to Third Parties

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

---

## Logging and Monitoring

### What Gets Logged

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

### Log Security

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

---

## Incident Response

### Suspected Compromise

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

### Reporting Vulnerabilities

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

---

## Hardening Recommendations

### For Local Development (Default)

1. ✅ Use .env for secrets (never commit)
2. ✅ Keep Docker and images updated
3. ✅ Firewall exposed ports from internet
4. ✅ Don't share ngrok URL publicly
5. ✅ Review third-party configs before installing

### For Shared Development Environments

1. ✅ All of the above, plus:
2. ✅ Enable ngrok authentication
3. ✅ Bind ports to 127.0.0.1 only
4. ✅ Use VPN for remote access
5. ✅ Implement rate limiting
6. ✅ Regular security reviews

### For Production-Like Environments

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

---

## Compliance Considerations

### GDPR (EU Data Protection)

**Personal Data Handling**:
- Chat history may contain personal info
- Logs may contain IP addresses
- OpenAI processes queries (review DPA)

**User Rights**:
- Right to deletion (clear .artifacts/)
- Right to access (export chat history, logs)
- Right to portability (JSON exports available)

### HIPAA (US Healthcare)

**Not Compliant**: Do not use for healthcare data without:
- Business Associate Agreements with ngrok, OpenAI
- Encryption at rest
- Comprehensive audit logging
- Access controls
- Risk analysis

### PCI-DSS (Payment Card Industry)

**Not Compliant**: Do not use for payment card data

---

## Security Checklist

### Initial Setup

- [ ] Create strong ngrok authtoken
- [ ] Set secure OPENAI_API_KEY (if using)
- [ ] Add .env to .gitignore (already included)
- [ ] Firewall ports 8080, 3001, 4040 from internet
- [ ] Review docker-compose.yml for custom needs

### Ongoing Operations

- [ ] Rotate secrets quarterly
- [ ] Update Docker images monthly
- [ ] Review logs for anomalies weekly
- [ ] Prune old artifacts monthly
- [ ] Backup critical configs

### Before Sharing Work

- [ ] Enable ngrok authentication
- [ ] Review configs for hardcoded secrets
- [ ] Test with least-privileged user
- [ ] Document access instructions securely
- [ ] Set expiration for shared URLs

---

## References

### External Resources

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [nginx Security Controls](https://docs.nginx.com/nginx/admin-guide/security-controls/)
- [ngrok Security](https://ngrok.com/docs/secure-tunnels/)
- [OpenAI Security & Privacy](https://openai.com/security)
- [OWASP Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)

### Internal Documentation

- **[Architecture](ARCHITECTURE.md)** - System design and container topology
- **[Data Lifecycle](DATA_LIFECYCLE.md)** - How data flows through system
- **[Known Issues](KNOWN_ISSUES.md)** - Current limitations

---

## Security Roadmap

See **[Roadmap](ROADMAP.md)** for planned security features:

- **v1.3**: Authentication and authorization
- **v1.3**: Secrets management (Vault integration)
- **Future**: mTLS for inter-container communication
- **Future**: Comprehensive audit logging
- **Future**: RBAC (role-based access control)

---

**Remember**: Dev Tunnel Proxy prioritizes developer experience in trusted environments. For production use cases, evaluate security requirements carefully and apply appropriate hardening.

