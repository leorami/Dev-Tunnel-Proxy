# Unified GPT ↔ Local App MCP — Release QA and Adversarial Acceptance

**Status:** QA instructions and evidence template. NOT an executed test receipt, release authorization, or connection request. Review together with `docs/architecture/UNIFIED_GPT_LOCAL_APP_MCP_GATEWAY_V1.md` and the existing `docs/plans/unified-gpt-local-app-mcp-release-plan.md`. The owner has delegated future execution to the **Dev Tunnel Proxy project**; other product projects retain their existing primary Engineer-I assignments.

## Source and invariant lock

- Repo: `leorami/Dev-Tunnel-Proxy`; draft PR **#2**, branch `cto/unified-gpt-local-app-mcp-bridge-v1-20261101`; fetch exact latest PR head, baseline `master`, full diff and CI *before* tests. Never infer the current tip from this document.
- Provenance: Wizardmaker PR #375 (original Node gateway) → dependent PR #376 (corrected MCP 2026 transport, **16 isolated Node tests passed in Wizardmaker**), plus Tiger Slam PR #581 (authorization policy, tests **not run there**). The extracted files are **not automatically green**.
- No existing nginx/ngrok configuration, proxy management API, app routes, daemon, Docker network, production database or external ChatGPT/plugin workspace changes are authorized by this PR.
- The package's local machine token is not proof of app-user identity or per-app consent. `app-policy.mjs` is **not wired automatically** to `gateway.mjs`; evaluate the real integrated path before allowing sensitive reads, all writes or remote exposure.
- Gate 0: verify the actual Node runtime meets Node 22; verify no proprietary application records, tokens, real image bytes, private user data or third-party source snapshots entered the public package.

## Ordered executable QA — preserve the installed proxy

| Gate | Procedure | Required result | Receipt |
| --- | --- | --- | --- |
| 1. Deterministic unit | `node --test tests/unit/dev-proxy-mcp.test.mjs tests/unit/dev-proxy-mcp-app-policy.test.mjs` on *exact PR SHA*, then `./smart-build.sh test:unit` | Every test GREEN, full count + exit 0; do not cite Wizardmaker's 16/16 as the consolidated result | Node version, SHA, complete output, command/exits |
| 2. Canonical regression | In disposable environment run `./smart-build.sh test:all`; inspect the actual installed nginx app route/config diff | Existing routes and proxy management unaffected; no new public `/mcp` automatically exposed | Command/exits, route and config evidence |
| 3. Actual fixed local app | With a test-owned non-sensitive app on a fixed loopback port and a privately provisioned local bearer, run example gateway; use an independent conforming MCP client | `server/discover`, `tools/list`, `app.list`, `app.status`, `app.command(health.check)` return **actual app state**; no synthetic status substituted | Sanitized MCP request/result, URL/port, app PID/source, correlation IDs |
| 4. Two-app isolation | Register two distinct test-owned apps on fixed different loopback ports | Correct app routing and identity; no cross-app data; unregistered third app/command denied | Per-app responses and negative proof |
| 5. Protocol/version | Check 2026-07-28 stateless metadata and mirrored `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, encoded tool name, `resultType:complete`, safe unknown-version response | Mismatched/missing headers/metadata fail before any handler runs; deprecated `initialize`/`ping` not accidentally accepted | Raw sanitized HTTP status, error code, no-call counter |
| 6. Input isolation | Fuzz arbitrary host/URL/port/path, `../../`, `__proto__`, shell, git, Docker, SQL, unknown property, malformed JSON/UTF-8, nested/oversized input and result | Strict rejection; no SSRF, shell, file or proxy-admin access; response cap enforced, errors sanitized | Negative tests + observed app no-op |
| 7. Browser/network boundary | Try alternate `Host`/`Origin`, DNS rebinding, non-loopback listener, anonymous bearer, invalid/revoked/expired local secret and missing Content-Type | Deny before app handler; no wildcard CORS, no public exposure from checked-in nginx; local bearer never logged | Route list, bound sockets, network/status proof |
| 8. Risk and concurrency | Use ONLY isolated test adapters for one-use local approval: missing/mismatched/expired/used grant, simultaneous replay, timeout during mutating adapter, handler exception | One-use exactly once, timeout `APP_OUTCOME_UNKNOWN_DO_NOT_RETRY`, no blind retry, secret-safe error | Explicit state-change count and post-timeout receipt |
| 9. True user authority | Supply a test-owned app-specific verified OAuth identity with correct resource audience, environment, role, scope; also wrong app/scope/role/audience and revoked session | Correct per-user authorization; local bearer alone **must not** authorize sensitive read/write. If no real integration, mark **BLOCKED_SENSITIVE_ACTIONS** and ship only non-sensitive fixed read | Identity/source, safe scope report, negative proof |
| 10. Data consistency | In a disposable app DB verify expected-version conflict, idempotency replay, exact-intent grant consumption and durable actor audit; test simultaneous two-device edits | No last-writer data loss, no duplicate mutation, correct actor and before/after revisions. If missing, **WRITES_NOT_AVAILABLE** | Transaction/receipt and revision proof |
| 11. Remote ChatGPT | Only if an authorized Secure MCP Tunnel + workspace permissions already exist: authenticate actual ChatGPT client, invoke `app.status` on test-owned local app | Independent **real cloud GPT → local app** proof; correct environment and audience. Otherwise **BLOCKED_REMOTE_MCP_CONNECTION** (not PASS) | Redacted connection record and tool result |
| 12. Shutdown/rollback | Close listener, revoke token, restart one test app, verify old grants invalid and no proxy route changed | No lingering process, background agent, public listener or app state mutation; rollback documented | PIDs/ports before/after and recovery result |

### QA traps requiring explicit fail-closed decisions

- **Public exposure:** `localhost:5927/mcp` passing is not evidence that `ramileo.ngrok.app` or another public tunnel is safe or accessible. Do not add an nginx `/mcp` route to make a test green.
- **Application identity:** a static gateway bearer plus local app registration must never be accepted as OWNER or ADMIN. All app-specific protected data requires verified user identity and app permission at the actual domain-service boundary.
- **Grant logic not integrated:** the pure policy returning `allowed:true` is not execution authorization by itself; persistence, approval issuer, audit and transaction checks remain separate.
- **Time-limited writes:** single-use memory approvals do not supply durable idempotency or rollback. A timeout may have executed; never automatically retry.
- **Conformance claims:** use the declared exact protocol version and an independent MCP client. A successful handcrafted request proves only that wire path, not ChatGPT interop.
- **Operating system exposure:** no optional flag should grant unrestricted `shell`, `exec`, `docker`, `git`, arbitrary network fetch, source file reading, local secrets, filesystem navigation or cross-app credentials. New operations require explicit separate design/owner authority.
- **Existing production research:** Tiger Slam's live authenticated Research MCP has different protocol semantics and scopes; this shared gateway must not replace it.
- **Public repo:** review license attribution, secret grep, fixture provenance and private-data absence before merge or publishing any package.

## Exact final QA receipt

Return ONE source-exact receipt containing: repository/branch/full SHA, base and diff, Node/version and commands with *real* counts/exits, full matrix status (PASS/FAIL/BLOCKED/NOT_RUN), real fixed-app source/proof, authentication actor and resource without secret values, negative results, public ports/Host/Origin/route proof, caveats, mutation/write availability, cross-project non-regression, rollback and the smallest real remaining blocker.

**Shipping gates:** (A) source review + unit/native tests; (B) independently exercised **non-sensitive local** app read; (C) real OAuth app identity/scope; (D) real remote GPT tunnel; (E) transactionally auditable owner-authorized writes. Never convert an earlier gate into later-gate PASS. Owner approves protected merge, external connection, production install and public package release separately. No independent agent assignment arises from this QA document.
