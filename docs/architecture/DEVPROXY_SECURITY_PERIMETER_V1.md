# Dev Tunnel Proxy — security perimeter contract (DEVPROXY-002)

**Source-only CTO proposal; no live containment, password rotation, deployment, or owner approval has occurred.** Baseline is `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`. This branch deliberately does not depend on the concurrently completed DevProxy-001 gateway draft PR #5; reconcile both after exact CTO review. All existing nginx/ngrok services must remain untouched pending a separately authorized deploy/rollout.

## Threat model

- The ngrok public tunnel terminates into nginx via Docker networking: Docker private-address origin is **not** evidence that the internet user is local.
- `/admin/show-password` previously used an untrusted Host header or forwarded address as an OR condition for local access; never return an admin secret over HTTP.
- `/.artifacts/` previously served a mounted directory with `autoindex on`. The same host-side `.artifacts/` tree contains `admin-session.json`, Calliope chat and operational artifacts. Private files are not public resources.
- `utils/proxyConfigAPI.js` previously allowed anonymous `POST /devproxy/api/ai/reindex`, `POST /devproxy/api/ai/ask` (which can auto-heal and change routes), chat history, AI events/cancel, and auto-scan GET/POST; route promotions were not included in its protected prefix check. Every management verb and unknown endpoint must be authenticated by default. The API also retains legacy `/api/config/:file` GET/POST handlers outside the configurable namespace; those paths must be explicitly gated to prevent a direct-port read/write bypass.
- The notifications sidecar has no independent authentication. Nginx must enforce auth on its ingress; the two privileged direct host-published Node API ports must bind to loopback. Docker peers remain a separate concern in DEVPROXY-003/004.
- Route inventory and service telemetry can expose internal topology; restrict `/routes`, `/routes.json`, `/status.json`, `/dashboard` and `/nginx_status`. Preserve public `/health.json` for Docker health-check compatibility, with a future data-minimization audit.

## Contract and implementation

1. `utils/managementAuthPolicy.cjs`: a single dependency-free, method-sensitive classifier. **Only** `GET <BASE>/ai/health` is anonymous. Any request under the configured `PROXY_API_BASE_PATH` otherwise invokes existing `requireAuth`, even unknown routes. The classifier is pure and importable for RED tests; no implicit authority based on an API label.
2. `utils/proxyConfigAPI.js`: remove the HTTP password display handler, replace the broad legacy public allowlist/prefix exceptions with the classifier. Do not rewrite session credentials or install a new identity provider inside this emergency slice.
3. Both `config/default.conf` and `config/default.production.conf`: explicit 404 for `/admin/show-password`; exact authenticated browser-compatibility aliases for `/.artifacts/reports/health-latest.json` and `/.artifacts/calliope/healing-log.json`; otherwise `^~ /.artifacts/` returns 404. Sensitive management endpoint locations use `auth_request /admin/check` as a second line of defense, including notifications. Route inventory and dashboard require authentication; nginx status permits `127.0.0.1` only, then `deny all`.
4. Dev and production Docker Compose: management Node ports 3001/3002 bind to host loopback, not 0.0.0.0. This **does not** isolate them from other containers on the shared Docker network.
5. Browser login and README no longer instruct visiting `/admin/show-password`; password recovery is a trusted local operator action. Legacy E2E anonymous AI reindex expectation now requires an authentication refusal.
6. `tests/security/management-perimeter.test.mjs` was committed RED-first as a no-server, no-live-state source/authorization contract before implementation. Its final version adds private route-inventory requirements. Canonical `./smart-build.sh test:unit` invokes this suite. **No actual RED or GREEN execution has been performed by CTO.**

## Nonnegotiable verification before any rollout

- Test under a clean isolated worktree with the canonical `./smart-build.sh test:unit` and standalone Node security suite; expected result GREEN with real exits and SHA.
- Check `nginx -t` and both Docker Compose configurations in a **test-only** sandbox without restarting existing proxy/ngrok. Test exact anonymous GET/POST for health, reindex, chat history, asks, auto-scan, promotion, notifications, route inventory, password display and private artifacts. Test access through an HTTP hop that simulates ngrok's private Docker source IP, not just a local browser.
- Confirm authenticated routes still function (status, dashboard, health fallback, healing log, promotions, notifications), and `/health.json` still supports Docker's probe.
- Password/session exposure incident assessment: if any real session credentials were accessed or made public, **separately authorize** secret rotation, session invalidation, endpoint maintenance and incident response. No automatic credential disclosure, log harvesting or deletion.
- Prove no changes to live management app configuration, unrelated app routes, protected branch, database, nginx/ngrok service state or local owner files.
- `tests/security` are necessary but not sufficient; Engineer must add genuine isolated HTTP+nginx integration evidence rather than treating source regex checks as a complete penetration test.

## Known remaining security debt, NOT authorized in DEVPROXY-002

- `crypto.timingSafeEqual` on differently sized login passwords can throw; session and CSRF/rate controls need a separately tested security contract (003).
- The notifications sidecar accepts unauthenticated requests from trusted Docker peers or host localhost; Docker socket is mounted into the root config API. Separate principal/authorization and process isolation (003/004).
- The public repository includes `.certs/dev.key`, a development private key. Treat as exposed; determine actual deployment usage before rotating/replacing. Do not rewrite Git history, rotate credentials or alter existing live certs without owner authority.
- Public `/health.json` response may include operational metadata; investigate and minimize, preserving internal Docker health semantics.
- Historical `./smart-build.sh test:all` includes mutating live Calliope API calls. Test isolation is required before it may be run (010).
- The new MCP `app-policy.mjs` in PR #5 is not yet runtime-wired; keep sensitive reads and writes CLOSED. No gateway route is added by this plan.

## Definition of done

At least one faithful isolated nginx+API test, exact source/commit receipt, tested routing parity in both configurations, no unauthenticated control-plane writes, sensitive artifact denial, no owner live interruption. Green unit tests alone are insufficient. Owner UAT and any rollout/merge remain separate approval gates.
