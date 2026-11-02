# DEVPROXY-001 — first source-verified live, read-only app MCP proof

## Goal and source-contract gate

Deliver **one genuine working read-only GPT-compatible MCP invocation into an actual running local app**, plus verifiable two-app isolation, without touching the user's existing Dev Tunnel Proxy/nginx/ngrok services or granting user-data writes. This is a testable functional milestone, not a governance exercise, credential setup request, remote Cloud ChatGPT claim or production deployment.

Repository: `leorami/Dev-Tunnel-Proxy`. Parent coordination: [issue #4](https://github.com/leorami/Dev-Tunnel-Proxy/issues/4). Existing SOURCE DRAFT PRs [#2](https://github.com/leorami/Dev-Tunnel-Proxy/pull/2) and [#3](https://github.com/leorami/Dev-Tunnel-Proxy/pull/3) must not be merged/closed by this assignment.

- Protected release baseline: `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a` at CTO branch preparation.
- Direct source ancestor (latest shared PR #2): `cto/unified-gpt-local-app-mcp-bridge-v1-20261101@3240420ce0ec70328f2d64e9e19e1b6ff186d59e`.
- Independent security source PR #3: `cto/shared-mcp-policy-untrusted-inputs-20261101@28e0c15dc46eebac162704fc66c83a7d7c47f18f`, from **older** shared PR #2 ancestor `b5213d17ac2d1c8cce69960d6a144171749f6195`.
- CTO unified source branch: `cto/first-real-local-mcp-proof-20261101` at **the exact full commit SHA in the sole Cursor instruction**. Do not infer it from these prose references. No implementation agent has been observed as STARTED merely because this handoff was committed.

## What CTO already implemented (do not repeat)

1. Ported PR #3's actual seven adversarial RED-oriented tests into the latest PR #2 *before* updating the policy source. Then ported PR #3's exact safe immutable snapshot implementation into `packages/dev-proxy-mcp/app-policy.mjs`. These prevent untrusted getters, symbols, forged prototype values, cycles and post-authorization argument swaps in the pure shared app policy. The original PR #3 remains available as evidence; do not double-apply it.
2. Preserved `docs/architecture/MCP_APP_POLICY_UNTRUSTED_SNAPSHOT_GATE.md` and updated `docs/architecture/UNIFIED_GPT_LOCAL_APP_MCP_GATEWAY_V1.md` without discarding PR #2's newer complete QA and adoption documents.
3. Added a Node HTTP regression to `tests/unit/dev-proxy-mcp.test.mjs` for **two independently running, real loopback HTTP services** with distinct ports; verifies observed statuses, 503 transition, no arbitrary client port override and no third-app discovery.
4. Did **not** run actual `node --test`, DevProxy canonical native suite, owner's Mac, Docker, nginx, ngrok, cloud ChatGPT, OAuth or real app integration. Commit order is test-first but not a claimed executed RED/GREEN transcript.

## Primary Engineer contract — one coherent assignment

One main Cursor Engineer-I owns inspection, implementation adjustments, appropriate safe specialists (none expected), integration, actual validation and ONE consolidated receipt. If an existing DevProxy Engineer assignment is found actually running, preserve its frozen work and reconcile before accepting this handoff. Never start a second primary agent.

**Step 1 — read and protect actual environment.**
Read `README.md`, `smart-build.sh`, `packages/dev-proxy-mcp/{README.md,gateway.mjs,app-policy.mjs}`, both tests, `docs/architecture/UNIFIED_GPT_LOCAL_APP_MCP_GATEWAY_V1.md`, `docs/qa/UNIFIED_GPT_LOCAL_APP_MCP_RELEASE_QA.md`, and prior PRs #2/#3. Recheck current branch/SHA and inspect local dirty files; preserve owner files, running nginx/ngrok/services, production sessions, proxy routes, Docker network, secret configuration and other project tasks. No blanket stash/clean/reset or shadow long-running proxy stack.

**Step 2 — source & security confirmation, RED-first.**
Code-review the exact CTO diff versus PR #2. Confirm the PR #3 policy implementation and adversarial cases were ported faithfully while latest PR #2 QA/adoption remains. Execute `node --test tests/unit/dev-proxy-mcp.test.mjs tests/unit/dev-proxy-mcp-app-policy.test.mjs` under actual Node 22 and report real pass/fail and exit. Then run canonical `./smart-build.sh test:unit`. Repair any genuine source/test defect **within** this assignment, tests first, never weaken test or substitute old Wizardmaker counts. The existing test-only one-use approval is NOT authorization to expose production writes.

**Step 3 — real local-app proof.**
Without changing current live proxy, use short-lived, test-owned localhost HTTP services on distinct safe ports, or already-approved NON-SENSITIVE live dev apps if source and access are actually verified. Independently POST conforming MCP 2026-07-28 `server/discover`, `tools/list`, `tools/call` for `app.list`, `app.status`, `app.command(health.check)`. Show real responding process/source identity, port, request correlation and bounded response. Demonstrate one app goes unavailable/503 while other remains healthy; reject unregistered third app, forged hostname/origin, non-loopback listener, arbitrary client port/path/command/shell and invalid/expired local bearer. Verify modern mirrored version/method/name headers and request `_meta`; negative legacy `initialize`/mismatch. A handcrafted Node client proves local wire only, **not** remote ChatGPT connection. No fake "app healthy" status.

**Step 4 — native regression without service disruption.**
Inspect what `./smart-build.sh test:all` actually starts/touches; if safe for existing running proxy, execute it and report counts/exit. If unsafe for owner live services, run the safe documented nonmutating verification subset, mark native full gate BLOCKED with exact reason rather than restart production or claim GREEN. Inspect unchanged `apps/`, `overrides/`, generated nginx routing/public listener and existing `/admin` / `/devproxy/api` / Tiger Slam research routes; no new public `/mcp`.

**Step 5 — strict authority limits.**
Source only fixed model-safe, non-personal local health/read data. The machine-local Bearer is **not** verified user identity. Shared `app-policy.mjs` is still **not wired automatically** into `gateway.mjs`. Never try protected personal reads, real application writes or privileged commands without actual per-app authenticated principal, resource/audience/scope, server-owned exact grant, durable idempotency and domain audit. Mark `BLOCKED_SENSITIVE_ACTIONS` / `WRITES_NOT_AVAILABLE` honestly. Only if an already configured, authorized trusted ChatGPT Secure MCP Tunnel is truly available may you check a real cloud-to-local non-sensitive read, without creating/installing/altering public ingress or credentials. Otherwise mark `BLOCKED_REMOTE_MCP_CONNECTION`, no owner interruption.

**Step 6 — one evidence-backed return.**
Commit the actual code/test fixes and a `docs/receipts/DEVPROXY_001_FIRST_REAL_LOCAL_MCP_ENGINEER_COMPLETION.md` with:
- exact branch, immutable tested product SHA, GitHub evidence, Node version;
- one table for gates 0–12 from the current QA plan: PASS/FAIL/BLOCKED/NOT_RUN and actual tests/exits;
- actual local app source/port/health response, two-app isolation and negative Host/Origin/unknown command results;
- protected proxy/route non-regression; cleanup of only short-lived test-owned services;
- actual independent client proof vs remote Cloud ChatGPT; any blocked per-app OAuth/tunnel/write authority;
- surviving owner work/risks; explicitly unperformed merge/deployment/spend/credential setup;
- one Engineer-executed observable/owner-equivalent UAT verdict.

Post and GET/readback genuine STARTED→IMPLEMENTING→VERIFYING→RETURNED on issue #4; no invented statuses or specialists. STOP for CTO exact committed-diff review. No owner-facing production/UAT claim before that review.

## Frozen boundaries

Protect existing nginx/ngrok production DEV routing and auth, preserve draft PR #2/#3 and Wizardmaker/Tiger Slam work, no production browser session takeover, no protected main merge, no CLI credential login, no owner proxy restart, no user records, no app-data modifications, no unreviewed external ChatGPT connection, no public package publish. The first accepted capability is ONE *real*, non-sensitive local read from a running app with correct source evidence. Do not expand the acceptance fence to credential provisioning or future full cross-app write governance.
