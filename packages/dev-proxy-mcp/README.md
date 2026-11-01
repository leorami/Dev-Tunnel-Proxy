# Dev Tunnel Proxy · App-Centric MCP Gateway

A reusable **Node.js 22, zero-external-dependency** gateway for GPTs and other MCP clients to discover and query explicitly registered **local applications** through named tools. Included in the shared Dev Tunnel Proxy repository; no separate copy of the core should be maintained by each app.

**Status:** prototype committed for review. Not launched, not exposed by nginx/ngrok, not connected to ChatGPT, not production-approved. Node tests under `tests/unit/dev-proxy-mcp*.test.mjs`. The originating Wizardmaker implementation independently ran 16 green tests before extraction; the unified source still requires its own project test gate.

## Architecture

```
ChatGPT / Codex / other MCP client
      | secure authentication and approved tunnel, separately configured
      v
local MCP gateway (127.0.0.1 only; named allowlisted apps)
      | app-owned status and typed commands
      v
application's existing domain handlers and permissions
```

The **Dev Tunnel Proxy** may route to installed apps, but routing does **not** create user authorization. The proxy's `ADMIN_PASSWORD` is for nginx config management, **not** an MCP credential. This package's separate local bearer token is **machine-local** and is not a substitute for OAuth user identity. If a command accesses protected per-user information, the app must authenticate the actor using its actual verified application session or OAuth audience/scope/role rules; a model cannot invent that identity.

## Included modules

- `gateway.mjs` — Wizardmaker-derived and spec-corrected **MCP 2026-07-28** stateless HTTP implementation; `server/discover`, `tools/list`, `tools/call`; tools `app.list`, `app.status`, `app.command`; exact Host/Origin check, strict fixed command schemas, bounded request/response and timeouts, local static bearer, server-internal one-use approvals for simulated writes. Does not include shell/SQL/Git/Docker/file/URL arbitrary execution.
- `app-policy.mjs` — port of Tiger Slam's stricter **per-app command policy**: verified resource audience, app/environment, role/scope, exact JSON schema, immutable intent fingerprint, expectedVersion, idempotencyKey and trusted server-side action grant. This is an **isolated policy library**. **Important:** `gateway.mjs` does not yet invoke this policy automatically. Consumer adapters must wire it to app-owned principal verification and transactional audit before sensitive reads or any real writes.
- `../../tests/unit/dev-proxy-mcp.test.mjs` — transplanted Wizardmaker HTTP, origin, replay, approval, timeout and protocol tests.
- `../../tests/unit/dev-proxy-mcp-app-policy.test.mjs` — policy scope/audience/grant/denial tests.
- `../../examples/mcp/local-app-readonly.mjs` — opt-in generic read-only fixed-loopback app health example.

## Local proof (explicit, does not change running proxy)

The reference program refuses to start without a local private token and exact app port. Do **not** set credentials in chat or Git.

```sh
# Only after the operator securely provisions these variables locally:
node examples/mcp/local-app-readonly.mjs

# Run independent Node tests without starting nginx, Docker, ngrok or an app:
node --test tests/unit/dev-proxy-mcp.test.mjs tests/unit/dev-proxy-mcp-app-policy.test.mjs

# Native proxy unit gate also includes these suites:
./smart-build.sh test:unit
```

A local operator can validate `server/discover`, `tools/list`, and `tools/call(app.status)` with a conforming 2026-07-28 client and headers. A real ChatGPT connector needs a **separately configured Secure MCP Tunnel** or an independently reviewed authenticated HTTPS endpoint. This package does not create either, and **does not auto-route /mcp through public ngrok**.

## Registration and authority model

App adapters must register only fixed app IDs, fixed local endpoint/service, named command IDs and strict JSON argument schemas. GPT can choose among **existing** registered tools; it cannot send a new implementation, arbitrary process command or network destination.

A shared `app.command` read should return only a **model-safe, non-personal projection**. Per-user reads need verified app user identity, scopes, and role. No credentials, images under unlicensed rights, private files or other-app data should appear in tool responses.

Write/destructive implementation in the Wizardmaker-derived gateway is a local-only proof requiring an explicit one-use local approval issued by trusted host code, not a callable MCP tool. **It is not sufficient for production writes:** a released app adapter must ALSO enforce per-user app authorization, version checks, durable idempotency, transactional receipts, and a human-approved action when necessary. An uncertain timeout yields `APP_OUTCOME_UNKNOWN_DO_NOT_RETRY`.

## Existing implementations to migrate *after* acceptance

- Wizardmaker reference source and tests: `leorami/wizardmaker-ai` draft PR **#375** and protocol correction PR **#376**. PR #376 descends from #375. Do not integrate #375 separately, as it advertises modern protocol while implementing the old `initialize` handshake. The shared `gateway.mjs` here derives from corrected PR #376.
- Tiger Slam app-centric policy prototype: `leorami/tiger-slam` draft PR **#581**. Its original TypeScript/Zod authorization policy and read-only dispatcher were not connected to a live HTTP server. The shared `app-policy.mjs` retains relevant authorization invariants without Zod. Tiger Slam's existing production OAuth Research MCP is live and should not be replaced or upgraded blindly: it implements a different protocol version and user scopes.
- The shared proxy itself is `leorami/Dev-Tunnel-Proxy` (public MIT). No cross-repo merge, automatic deploy, package publish, or provider connection is implied by this branch.

See `docs/architecture/UNIFIED_GPT_LOCAL_APP_MCP_GATEWAY_V1.md` for the owner-controlled authority, compatibility and adoption gates.
