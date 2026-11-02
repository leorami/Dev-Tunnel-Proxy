# DEVPROXY-002 — first security containment (one primary Engineer-I)

## Goal

Ensure **anonymous clients cannot read admin secrets, private artifacts, route inventory, AI chats or change the proxy/control-plane** through the public tunnel or host Node ports. Preserve every already-working authenticated owner flow and the Docker `/health.json` probe. This is a bounded **source-and-test implementation** milestone; NOT authorization to merge, deploy, rotate credentials, restart proxy/ngrok or alter production apps.

## Exact source and authority

- Repository `leorami/Dev-Tunnel-Proxy`.
- Original protected baseline `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`.
- Your **only** input is the exact immutable commit in the Cursor handoff command on `cto/devproxy-002-security-containment-20261101`; do not guess or fetch a moving latest.
- Parent coordination [issue #6](https://github.com/leorami/Dev-Tunnel-Proxy/issues/6). Canon [security perimeter V1](../architecture/DEVPROXY_SECURITY_PERIMETER_V1.md), [next ten consequential milestones](../roadmaps/DEVPROXY_NEXT_TEN_CONSEQUENTIAL_PLANS_V1.md).
- DEVPROXY-001 is already RETURNED, with tested source `83da0ccdf55ca0073edc32c721a271e8f003cba7` and separate draft PR #5 receipt at `3abb397181d5ee7886e4b6eafebf5f42d47c6319`. Do **not** edit or merge PRs #2, #3, #5, or its branch; security Plan002 is independently based on actual `master`.
- Owner has authorized project implementation planning and review **not** privileged live service or secrets mutations. Before any Git state-modifying command, honor root `.cursorrules`' authorization policy and the exact approved handoff boundary. No force/reset/clean, no protected branch writes.

## CTO-completed RED-first core

1. `tests/security/management-perimeter.test.mjs` introduced before source changes, and later expanded for previously overlooked `/api/config/:file` legacy GET/POST and nginx-private route inventory. These are **source/pure-function contracts**; CTO has not executed Node tests on owner Mac.
2. `utils/managementAuthPolicy.cjs` introduced pure deny-by-default classification. `utils/proxyConfigAPI.js` uses that gate for all configured management routes AND legacy direct `/api/config/:file`; only exact GET `/ai/health` anonymous. Old HTTP `/admin/show-password` handler removed; secret-recovery link and README advice corrected.
3. Both nginx configurations prevent `/admin/show-password`, deny raw `/.artifacts/` while authenticating two exact pre-existing UI fallback paths, protect notifications/AI route metadata/promotions/auto-scan, restrict `/dashboard`, `/routes`, `/routes.json`, `/status.json`, and keep `/nginx_status` truly loopback-only. Crucial: the public ngrok sidecar has a private Docker IP, **not** a trusted local user.
4. Both Compose variants restrict host-published config and notification API ports 3001/3002 to 127.0.0.1. `test/e2e/nginx-proxy-pass.test.js` now expects denied anonymous reindex. `smart-build.sh test:unit` includes nonmutating security contracts. The public `/health.json` Docker probe remains intentionally available.
5. `docs/architecture/DEVPROXY_SECURITY_PERIMETER_V1.md` records threat model, root causes, stop rules and remaining critical work (auth/session/CSRF, Docker socket, tracked dev private key, full test isolation).
6. CTO performed static connector readback of 16 source invariants, **not** native tests or nginx build; mark as unverified until Engineer receipts.

## Engineer implementation and verification — narrow remaining work

**Phase A: truth/read-only audit.** First check Issue #6 and PR state in GitHub, exact owner checkout dirty files, current services and source SHA. Start only if no other primary DevProxy assignment has started. Use an isolated test worktree and preserve owner checkout/runtime. Code-read every CTO diff and server auth paths, not just tests. No "all tests green" inference from static checks.

**Phase B: RED/GREEN.** Execute Node 22 `node --test tests/security/management-perimeter.test.mjs`, then `./smart-build.sh test:unit` in a safe isolated environment. Report actual pass/fail exit and exact source SHA; if failed, reproduce/repair via new RED tests first, without weakening checks. Test default and configured alternate API prefixes; legacy direct `/api/config` must not bypass auth.

**Phase C: isolated live HTTP and nginx matrix.** Do not point tests at owner's live ports 8080/3001/3002, current nginx/ngrok containers or user project files. Start **disposable test-owned** Node API on a free localhost port with a newly generated temporary fixture-only admin password; ensure no temporary test secret is printed, committed or reused. Test anonymous GET and POST for health, asks, reindex, thoughts, chat history, settings, promotions, legacy `/api/config/:file`, unknown management paths and `/admin/show-password`. Authenticated GETs must still work; authenticated mutation tests may only touch a test-owned isolated fixture. Confirm false password lengths return denied response rather than exposing a password or crashing (if this defect is encountered, note DEVPROXY-003 ownership and safely fix only if it blocks gateway acceptance).

Use **disposable nginx** configuration and ports to verify `nginx -t` both dev and production configurations, with upstream stubs and fixture paths (do not use production host certificates or runtime). Test realistic public-hop forwarding where network origin is private Docker IP but no valid admin cookie, negative `Host` and forged forwarded headers, direct raw `/.artifacts/admin-session.json` denial, exact authenticated status/healing fallbacks, private status/dashboard/routes and localhost-only `/nginx_status`. Ensure Docker-health `/health.json` still returns a non-sensitive health body.

Confirm Compose config parsing without `up/down/restart`, exact host loopback port mapping, and no change to live proxy/ngrok or app routes. Do not run `./smart-build.sh test:all` until its live AI-healing calls have been safely isolated; mark it BLOCKED with evidence rather than execute destructive tests. Verify existing browser login/status/dashboard via isolated browser if an isolated service is genuinely accessible; record BLOCKED if not.

**Phase D: consolidate one receipt.** Fix consequential in-scope defects uncovered (RED tests first). One primary Engineer-I coordinates any genuinely useful independent read-only specialist; avoid more agents for tightly coupled auth/nginx work. Commit one integrated source/test result plus `docs/receipts/DEVPROXY_002_SECURITY_CONTAINMENT_ENGINEER_COMPLETION.md`. The receipt must show exact tested 40-character SHA and resulting branch/receipt SHA, real Node/nginx/Compose/browser commands/exits, anonymous/authenticated matrix PASS/FAIL/BLOCKED/NOT_RUN, any remaining defect, source-diff details, evidence of no live owner system impact, and a clear *source ready vs deployed* status. Log verified STARTED→IMPLEMENTING→VERIFYING→RETURNED to issue #6 and read back comments. Stop for CTO independent committed-diff review and owner consequential merge/deploy/UAT decision.

## Nonnegotiable stops

Never show the actual `ADMIN_PASSWORD` or any token in chat/issues/logs. Never access or print live `.artifacts/admin-session.json`, API keys or chat files to prove a weakness. Never change `.certs/dev.key`, force-push or rewrite public history, rotate credentials, install public tunnels, reconfigure current nginx/ngrok or production Docker, migrate state, merge draft PRs, or modify source in Tiger Slam/Wizardmaker/Origin. Do not treat a passed static test as proof the public endpoint is secure. Keep `DEVPROXY-003` authorization/session redesign and `DEVPROXY-004` Docker privilege isolation outside this bounded assignment.

**Definition of Done:** GREEN pure-source contracts + isolated real HTTP/nginx security tests, preserved authorized owner workflows, safe host bindings, no live disruption, one exact Engineer return. No deployment or security incident clearance is implied.
