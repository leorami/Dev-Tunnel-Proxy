# Security RC1 production packaging / explicit owner release gate

**CTO source-only candidate, not a production deployment. No container, nginx/ngrok, Mac bridge or token was changed.** Parent release [issue #14](https://github.com/leorami/Dev-Tunnel-Proxy/issues/14), exact Engineer RETURN `cto/devproxy-security-rc1-integrated-20261101@003f2358bf4e248d58c5963e160c2023f04aff23`. The five security suites passed 37/37 under Engineer-I Node 22, with disposable nginx, API, browser and Mac-mock evidence. This independently reviewed source is still **unmerged and not installed**. The security release is not GO until all remaining gates below are evidenced and the owner explicitly authorizes rollout.

## Newly discovered packaging blocker

`docker-compose.production.yml` declared `image: nginx:1.25-alpine` while mounting `config/nginx.production.conf`, which explicitly loads `ngx_http_brotli_filter_module.so` and `ngx_http_brotli_static_module.so`. The stock image lacks those modules; they are produced by the repository's **multi-stage Dockerfile**. Engineer-I correctly built a custom Brotli image for its disposable `nginx -t`, but that DOES NOT prove the production Compose declaration starts the same image. The candidate production Compose now uses `build: { context: ., dockerfile: Dockerfile }` like the development Compose. This needs an actual **disposable production-compose build and startup** to substantiate; not a raw `nginx -t` against a manually chosen image.

An independent second source defect: `scripts/switch-to-production.sh` writes `docker-compose.override.yml`, then runs `docker-compose -f docker-compose.yml up -d`. An explicit single `-f` means Compose does not automatically load the override. The candidate changes this to include both explicit `-f` arguments. **The script is disruptive and must NEVER be run on owner live services during source tests.** It stops containers, copies live config, rewrites an override and starts containers.

The older `docs/PRODUCTION_MODE.md` claimed the project *is* running in production; that was a historical statement, not verified current deployment evidence. Source docs now distinguish features from actual owner runtime. Do not claim the measured historical performance gains remain current.

## What has been prepared (source only)

- RED-first `tests/security/production-packaging-gate.test.mjs` catches custom Brotli image vs stock-image mismatch, implicit override omission, unverified live-status assertions and unchanged service names/loopback-only admin ports.
- Actual `docker-compose.production.yml`, `scripts/switch-to-production.sh`, and production-mode documentation corrected.
- Hooked the new **read-only** source gate into canonical `./smart-build.sh test:unit` without removing the five returned RC1 suites.
- CTO independent GitHub source review and test-to-source traceability. **CTO has not run Node native tests, `docker compose config`, custom image build, desktop browser UAT or any owner deployment.**

## Engineer release preflight — one bounded mini-sprint

**A. Immutable source and no downtime.** Validate original RC1 Engineer RETURNED SHA, current GitHub branch, owner protected checkout and any truly active primary Cursor assignment. Work in a disposable isolated worktree and test-owned Docker project. No auto-merge of PRs #7/#11/#12/#13/#15 or the queued, untested snapshot PR #16.

**B. Real RED/GREEN:** Verify historical test-only commit on the production-preflight branch fails on stock Compose/ignored override; run native Node22 `node --test tests/security/production-packaging-gate.test.mjs` and canonical `./smart-build.sh test:unit` on test-only fixtures, recording real exits and source SHA. Avoid `test:all` as its legacy Calliope paths target the live API.

**C. Production manifest fidelity:** Run `docker compose -f docker-compose.production.yml config` in a safe test-owned environment, then actually BUILD the declared `proxy` service and demonstrate Brotli modules present. Test `nginx -t` using BOTH production `nginx.production.conf` and `default.production.conf` in a disposable isolated network with temporary upstream stubs, cert fixtures, test-only ports and no externally bound ngrok. Prove `switch-to-production.sh` would honor the override via source/tested Compose merge, but **NEVER EXECUTE that destructive mode-switch script** on the owner. Confirm dashboard, health and 002 private artifact routes remain intact. If a true Compose-service boot cannot be safely isolated, report `BLOCKED` with missing evidence.

**D. Runtime parity:** Current production Compose still runs `node:18-alpine` for the privileged API, whereas prior RC1 tests executed on Node 22. The Engineer must reproduce security login/auth/origin behavior using Node 18 in a disposable fixture or explicitly mark the runtime gap BLOCKED and propose a separate controlled Node22 upgrade. **Do not change the running API image as part of this code-only handoff.** Note that Node18 is a support/maintenance risk independently of test parity.

**E. Decision-ready private rollback:** Produce an operational GO/NO-GO sheet with ACTUAL observed installed mode/image/source SHA when accessible through read-only, redacted inspection; no actual owner `.env`, session JSON, private key, Mac bridge pairing token or secrets in issue/log. Identify exact immutable previous Docker image IDs or offline rollback artifacts *without running down/up/restart*. State what the owner would notice (admin login cookie behavior, Mac per-tab pairing, possible existing sessions, route health) and the precise operator rollback validation plan. If installed SHA/previous image cannot be established, recommend NO-GO; do not fabricate provenance.

**F. Security breadth:** Re-run a concise anonymous/authenticated matrix in safe disposable nginx/API mode: `/.artifacts/admin-session.json`, `/admin/show-password`, `/routes.json`, AI chats/ask/reindex, notifications, config, login/logout, benign fixture route and health. Verify redirect asset loads, no browser password disclosure or credential leak, Mac pairing with mocked effects only. Browser equivalent screenshot evidence is allowed with no real credentials. Owner UAT remains pending.

**G. One return:** One primary Engineer-I writes a single immutable receipt with tested SHA, commands/exits, production Compose source image/digest, safe test topology, Node18/22 parity, pre-release owner decisions and blockers. GitHub issue record STARTED→IMPLEMENTING→VERIFYING→RETURNED, readback. STOP for CTO independent code diff review and owner explicitly granted merge/production rollout only afterward. A clean test is not authorization to deploy.

## Nonnegotiable release STOP

Never run `scripts/switch-to-production.sh`, `scripts/switch-to-development.sh`, `docker compose up/down/restart`, `./smart-build.sh restart`, real `launchctl` or Messages.app on owner running services. Do not open live private artifacts, inspect Docker env vars, dump browser cookies, enable public MCP, rotate credentials, rewrite history, merge protected master or add second main Cursor Engineer. The planned public nginx/sessions/Mac security fixes remain UNINSTALLED. The separate untested DEVPROXY-004A PR #16 deliberately disables previously automatic code snapshots; it is NOT folded into RC1 or a prerequisite for emergency perimeter containment.

**Product milestone:** one justified **release decision** (GO/NO-GO) for the already independently tested security package, not another open-ended feature branch. Owner acceptance, actual installation, public ingress check and rollback rehearsal are separate explicitly authorized gates.
