# Unified GPT ↔ Local App MCP: remaining validation and shareability (NON-EXECUTABLE DRAFT)

**DEVPROXY-001 prepared — no Engineer started by this document.** The Dev Tunnel Proxy project now owns its independent shared-gateway implementation lane and its one primary Cursor Engineer; no Tiger Slam or Wizardmaker primary Engineer assignment is modified, interrupted, or duplicated. The bounded next source-first handoff is [DEVPROXY-001 first real local read-only proof](../handoffs/DEVPROXY_001_FIRST_REAL_LOCAL_MCP_READONLY.md), coordinated by [DevProxy issue #4](https://github.com/leorami/Dev-Tunnel-Proxy/issues/4). Existing PR #2 and independent policy PR #3 are reconciled as source on a new CTO branch for native verification. This source proposal authorizes no deployment, proxy configuration change, public endpoint, connector installation, protected merge, app account action, or credential request.

## Truth and source gate

Canonical shared repo: `leorami/Dev-Tunnel-Proxy`, base `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`. CTO branch `cto/unified-gpt-local-app-mcp-bridge-v1-20261101` (read its actual current tip from the eventual draft PR, not from an assumed earlier commit).

Cross-project sources:
- Wizardmaker PR #375 `7d1f78f1...` introduced the fixed, local Node app registry; **superseded for transport compatibility** by dependent Wizardmaker PR #376 `750156fc55f70ae6f205e90eae2bec287cb356b4`. `gateway.mjs` and 16 Node tests in the shared repo derive from #376, not an obsolete Initialize/Ping version.
- Tiger Slam PR #581 `67f6506cd5de74da1fd291f1eb5579341f88e8a8` contributed the pure role/scope/audience/grant version/intent policy, ported to zero-dependency JavaScript. Its previous read-only dispatcher is **not** a second network server: keep a single actual gateway runtime.
- Neither origin PR is merged in its source repo; all three original active primary engineers/workflows remain independent.

## Already committed by CTO (don't duplicate)

- `packages/dev-proxy-mcp/gateway.mjs` — stateless MCP 2026-07-28 /mcp POST, strict mirrored headers, `server/discover`, `app.list`, `app.status`, `app.command`, fixed app registration, token/Host/Origin/size/timeout/one-use local approval. `validateAppCommandArguments` exported for app policy.
- `packages/dev-proxy-mcp/app-policy.mjs` — grant evaluation, app/resource/environment/role/scope, canonical hashes, expected version/idempotency, distinct owner-only privileged check. **No OAuth issuer or durable data store; NOT auto-applied by gateway**.
- `tests/unit/dev-proxy-mcp.test.mjs` — 16 Wizardmaker-derived tests; `tests/unit/dev-proxy-mcp-app-policy.test.mjs` — scope/grant/adversarial policy tests.
- `examples/mcp/local-app-readonly.mjs` — isolated loopback read-only sample; does not auto-launch an app or a tunnel.
- `smart-build.sh` now includes both MCP suites in the native `test:unit` path.
- `docs/architecture/UNIFIED_GPT_LOCAL_APP_MCP_GATEWAY_V1.md` and `packages/dev-proxy-mcp/README.md` — single source of truth, adoption, external approval boundaries.

## Formal QA and adoption handoff (now committed)

- **Full adversarial QA matrix and explicit evidence receipt:** [`docs/qa/UNIFIED_GPT_LOCAL_APP_MCP_RELEASE_QA.md`](../qa/UNIFIED_GPT_LOCAL_APP_MCP_RELEASE_QA.md). It distinguishes local proxy, app-user identity, real cloud MCP access, and irreversible writes, including specific fail-closed checks.
- **Optional instruction reusable by any project:** [`docs/adoption/GENERIC_PROJECT_MCP_ADOPTION_INSTRUCTION.md`](../adoption/GENERIC_PROJECT_MCP_ADOPTION_INSTRUCTION.md). This is a proposal/assessment instruction, not an automatic installation or Engineer assignment.
- **Primary engineering priority stays unchanged.** Owner will coordinate any further Dev Tunnel Proxy work from that project. Source PR #2 remains DRAFT, untested after extraction, and never grants merge/deploy/tunnel privileges.

## Remaining work in ONE future test/release boundary

1. Re-establish actual DevProxy `master` and draft PR head. Code-read actual diff, unexpected removals and origin provenance. Confirm all source files have generic model-safe names and no private project data, media, credentials or real user domains. Check MIT notices and any dependency compatibility before public sharing.
2. RED/failing-first source tests on the proxy **before** implementation adjustment. Run `node --test tests/unit/dev-proxy-mcp.test.mjs tests/unit/dev-proxy-mcp-app-policy.test.mjs` on Node 22 and `./smart-build.sh test:unit`; then `./smart-build.sh test:all` in a clean isolated environment. Reconcile any actual test failures with minimal code fixes, preserving current proxy routing and ngrok config.
3. Personally connect two **test-owned** registered app adapters to real fixed loopback endpoints on isolated ports: `app.list`, `app.status`, `app.command` read from actual app state. Show that a model cannot select a new port/host/path or execute any unregistered command. Reuse declared schemas; report valid 2026-07-28 wire and a negative legacy handshake case. Verify Host/Origin DNS rebinding, unauthorized Bearer, untrusted input, wrong app, app unavailable, timeout, public access DENIED, unknown status and replay.
4. Verify the **app-owned** authorization boundary independently. Do NOT treat shared proxy bearer as a human account. The per-app policy is intentionally separate from generic gateway, so add a narrowly scoped trusted adapter if and only if a real test app supplies verified actor/resource/role/scope/context. No fabricated OWNER, no stubbed owner records, no write operations against real user data. For writes require actual app-domain transactional idempotency/audit, exact approved intent, and no uncertain replay. If missing, ship read-only scope only.
5. Separate ChatGPT connectivity from local functionality. Only when owner/workspace already has Secure MCP Tunnel permission and credentials should the engineer validate `tunnel-client doctor`, an existing tunnel and a genuine remote ChatGPT `app.status` call against a non-sensitive test app. Never public-forward the loopback service, copy tokens into chat, or infer plugin activation from a 200 GET. Report cloud connector **BLOCKED** if permissions aren't configured.
6. Preserve existing users' long-running DEV nginx/management apps, the Tiger Slam research OAuth /mcp route, Wizardmaker live model work and all owner worktrees. Do not overwrite a working app-specific OAuth connector with the new shared bridge. Record actual source SHAs, test counts, exact response and one primary Engineer evidence receipt. CTO code-reads resulting committed diff; owner approval remains separate for merge, credentials, release or public package publish.

## Release authority

The owner requested consolidation in the **public** shared Dev Tunnel Proxy repository, not unconditional deployment or public ChatGPT marketplace publication. Keep the PR DRAFT pending actual tests and owner-governed review. Only after one actual app end-to-end and tested isolation should a stable package version/tag, multi-repository adoption guidance, and optional external publication be considered. The package is shareable as *reviewable source today*, not as a production-ready remotely executing GPT plugin.
