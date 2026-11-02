# Dev Tunnel Proxy — security rollout decision gate (no live changes authorized)

**CTO owner-decision document, 2026-11-01. This is NOT a deployment plan that may execute automatically.** The source improvements have been tested separately in disposable environments, but the live proxy is still running the earlier code. No project should claim the tunnel, macOS bridge or admin login is protected by unmerged branches.

## Exact release candidates and dependencies

| Boundary | Source / independent engineering evidence | Status |
| --- | --- | --- |
| Public nginx/API management and private artifact ingress | DEVPROXY-002 [draft PR #7](https://github.com/leorami/Dev-Tunnel-Proxy/pull/7), Engineer return `d875bf7a8de5449c70eb8e49fe4a3aee99bebb3d`, isolated nginx+API negative matrix, 10/10 security tests | SOURCE TESTED, NOT DEPLOYED |
| Mac Messages/LaunchAgent localhost bridge | P0 [draft PR #11](https://github.com/leorami/Dev-Tunnel-Proxy/pull/11), Engineer return `92e0d2105f9b0afddc7abcaaf3f6fe37bfd3ec39`, 10/10 tests and mock-only localhost proof | SOURCE TESTED, NOT INSTALLED |
| Admin login/session persistence and external cookie attributes | DEVPROXY-003A current CTO branch, **stacked on PR #7** | CTO SOURCE ONLY, NATIVE VALIDATION NOT YET RUN |
| GPT-to-local-app MCP read-only proof | DEVPROXY-001 [draft PR #5](https://github.com/leorami/Dev-Tunnel-Proxy/pull/5), Engineer return `3abb397181d5ee7886e4b6eafebf5f42d47c6319`; only test-owned apps | LOCAL PROOF ONLY; REMOTE CLOUD BLOCKED |

The branches are NOT independent release switches: DEVPROXY-003A inherits DEVPROXY-002, while P0 bridge PR #11 starts from older protected `master`. An actual integration/release candidate must preserve both accepted changes and prove combined tests. Do not close or implicitly merge draft PRs to fabricate a release.

## Owner-visible release blockers

1. Real project production nginx image with its custom brotli module must load the config successfully; stock `nginx:1.25-alpine` does NOT load the project brotli module. Validate in disposable image built by the project's canonical build procedure before touching live nginx.
2. Authenticated owner browser UAT is not yet complete for status/dashboard, session login/logout, route inventory, notification pairing and exact localhost/HTTPS tunnel contexts. Use fixture secrets only for automated tool transcripts; owner performs private pairing outside shared tool logs. Wrong-length password previously returned 500 and is being repaired in DEVPROXY-003A.
3. Live proxy and ngrok stable health/port/route snapshot and **private** backup/rollback plan must be confirmed immediately before maintenance. Do not copy actual `.artifacts/admin-session.json`, `.env`, `.certs/dev.key`, or bridge pairing token to issues, build logs or agent memory.
4. Production tunnel path must be verified via existing authorized public address with negative anonymous requests for `/.artifacts/admin-session.json`, `/admin/show-password`, `/routes.json`, AI chat history/ask, notifications and override routes; expect appropriate 404/401/302. Keep legitimate public `/health.json` non-sensitive. **Never use a leaked/recovered session to test.**
5. Separate Mac bridge deployment requires an owner-controlled LaunchAgent restart and a one-time browser-tab pairing. No test service should send Messages or modify real LaunchAgents. Review whether remote ngrok origin is enabled and explicitly consented to.
6. No automatically authorized credential rotation, token revocation, host Docker permission change or route migration; these actions may invalidate active work and require owner authorization.
7. `./smart-build.sh test:all` includes scripts that may POST to the **live** Calliope self-healing API. Never run this unmodified against production. Test isolation is a release blocker, not a reason to ignore tests.
8. Post-rollout verification must show old app routes unchanged, no interruption of running apps, login restoration, Docker health returning green, and immediate rollback if status/login or tunnel unexpectedly fails.

## Recommended rollout sequence after explicit owner approval

**Gate 0: hold.** Existing runtime remains as-is. Identify actual deployed SHA/image and a tested rollback artifact privately, without exposing secrets; capture baseline route health. 
**Gate 1: stage.** Combine/review accepted 002 + 003A security code on a single release candidate and reproduce isolated Node22 nginx and browser UAT with real production-like brotli image. Keep P0 Mac bridge as a separate installable component.
**Gate 2: owner accept.** Owner sees precise impact of login cookie/renewal, new bridge pairing step, rollback point and any temporary dashboard interruption. Require explicit merge/deploy authorization.
**Gate 3: guarded production change.** A qualified operator applies an approved change under a maintenance-safe window with backup; do not use ChatGPT to silently restart services. Verify real public ingress negative requests, signed-in owner status and no route drift, and log a redacted receipt.
**Gate 4: Mac owner install.** Separately authorize service restart, confirm token file ownership/permissions, pair in private owner browser, verify safe status/UI and optionally owner-requested test notification. Never send arbitrary messages on behalf of owner.
**Gate 5: observe and close.** Recheck stable services, repeat no-leak tests and obtain explicit owner acceptance. Only then describe the release as deployed and security gates as passed.

## Stop / escalation

If any public endpoint actually exposes a current auth secret or active session data, **do not paste it into chat**. Advise owner of a confirmed incident with evidence limited to HTTP status/metadata and prepare **separate explicit** containment and credential/session rotation approval. A high-risk source configuration alone is not proof of historical breach.
