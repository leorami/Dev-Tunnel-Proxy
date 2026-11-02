# DevProxy Security RC1 — decision-ready rollout evidence (NO-GO today)

**Owner decision packet, NOT deployment authorization.** The installed nginx/ngrok/API and macOS bridge are **unchanged**. This file is source-prepared by CTO after exact Engineer-I RETURNED preflight [issue #17](https://github.com/leorami/Dev-Tunnel-Proxy/issues/17) on `cto/devproxy-rc1-production-packaging-20261101@54cb4c78ba40ac2e71e7123af9a91bacf36de815`. The candidate includes the already-tested perimeter, session, login-return and macOS bridge protections, plus fixed production Compose Brotli image and override handling, all **unmerged**. Public ingress and full live route baseline are NOT validated.

## Confirmed vs outstanding evidence

| Owner milestone | Evidence now | Gate |
| --- | --- | --- |
| Exact source/test history | RC1 first RED + 37/37 security tests; preflight RED (1 pass, 3 fail) and source GREEN; canonical `./smart-build.sh test:unit` exit 0 | PASS, source only |
| Production package | Compose builds project Dockerfile image `sha256:693d99872b2a263caf5a611165a1b7c62e11b055d49a0806934adeb14ae57cb7`; Brotli modules and disposable compressed health check pass | PASS, disposable only |
| Existing API runtime parity | Disposable `node:18-alpine` v18.20.8 login, auth/Origin, session, artifact denials, logout | PASS, partial runtime |
| Owner-equivalent browser fixture | Browser login/redirect/staging screenshot with fake credentials, no owner browser tab | PASS, fixture only |
| Mac notification protection | Mock bridge tests passed; running host bridge was NOT restarted, real Messages/LaunchAgents not touched | PASS mock, NOT INSTALLED |
| Installed proxy identity | Read-only: installed nginx image `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634`, API image `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e` | PASS identity; image IDs are not rollback artifacts |
| Verified offline rollback | Old image IDs have **not** been saved/hashed/restored from an independent owner-private archive | NOT_RUN; **release blocker** |
| Current route/service baseline | Stable active routes and health statuses have not been collected as a private redacted comparison | NOT_RUN; **release blocker** |
| Public tunnel ingress strategy | No owner-authorized external verification; never retrieve old potentially public private-file bodies | NOT_RUN; **release blocker** |
| Owner staging acceptance | Actual owner's login, dashboard, apps/routing, and new Mac tab-pairing experience not personally accepted | NOT_RUN; **release blocker** |
| Bridge host restart/rollback plan | Owner-controlled host LaunchAgent restart and token pairing need independent approval | NOT_RUN; **release blocker** |
| Explicit release authority | No authorization to merge to protected master, restart live proxy/ngrok, touch production ports or rotate secrets | NO; **absolute stop** |

**Current recommendation: NO-GO for changes to live installation.** The fact that release source is tested does not imply the deployed proxy or host Mac bridge is already protected. The running proxy may have known source-level security weaknesses. This status requires owner attention; however no real user token exposure or historical compromise has been proven.

## Read-only evidence plan — next single mini-sprint

1. Preserve all actual owner checkout files, active Cursor assignments and services. Reconfirm GitHub current SHA, issue #17, draft PRs #7/#11/#12/#13/#15/#16/#18, and installed image IDs via **read-only, redacted** inspection; never print container environment, secrets, private proxy route names, session contents or owner directory listings.
2. Prepare a **private redacted route/health baseline** using statuses and counts/hashes only. Prefer captured existing health/status metadata over requesting protected endpoint bodies. No crawling of historical `/.artifacts/`; those may still be exposed in the running version. Do not test dangerous POST/AI self-heal on live service. If a zero-content baseline requires reading privileged config or authenticating with owner's cookie, mark `BLOCKED_OWNER_AUTH` and request a separate owner-controlled run.
3. Prepare a **durable rollback evidence contract**: preserve and tag both exact old image IDs in an owner-private, access-limited storage destination; optionally use offline `docker image save` and SHA-256 verification only **after separate owner authorization**. Image exports may contain application code or embedded credentials, so never upload to GitHub, chat, cloud storage or a public artifact path. This planning slice must NOT export or prune images or alter the live Docker daemon.
4. Map actual public ingress with a proposed *status-only* negative matrix for deployment validation. Do not run old-version requests that might return sensitive bodies through a known open path. Post-release checks must verify anonymous status denial and owner-authenticated app route parity with no confidential response body in logs. All public tunnel/host restarts are separate approvals.
5. Capture staged owner UAT acceptance plan: login success/failure, private reports, app route list, route precedence, dashboard, Calliope safe read and disabled writes, logout, external Secure cookie, and the separate per-tab Mac notification pairing. Owner controls any real app credentials, pairing secret and Messages send.
6. Use `node scripts/release-decision-readonly.mjs` with **non-secret, local-only JSON evidence statuses via STDIN** to produce a redacted fixed-gate report. Exit 2 = NO_GO, exit 0 = READY_FOR_OWNER_DECISION **never authorization**. It does not call Docker, read files, open sockets, rotate secrets or alter state. No values, URLs or secrets are echoed.
7. Return the exact source SHA, full focused/canonical Node22 test exits, one private redacted baseline *summary* without route names, clear BLOCKED cases and a decision-ready rollout/rollback owner checklist. STOP. Do not merge/deploy/trigger owner Mac changes.

## Release gate meanings

**READINESS** and **AUTHORITY** are separate. Even if every evidence gate is marked PASS, the classifier never reports `releaseAuthorized=true` or `installed=true`. Owner must review, explicitly approve the actual change set, maintenance impact and rollback; only a separately authorized operator should apply the production rollout. This is not a mechanism to grant implicit user consent.

## Other unresolved security debt

Trusted-origin CSRF source and disposable staging proof are on draft PR #27 (`f9c3ef…`); Compose now **requires** an explicit operator-provided `DEVPROXY_TRUSTED_ORIGINS` allowlist (exact `scheme://host[:port]` list matching the real owner browser origin and any authorized public static domain) before `docker compose … config` can render either `docker-compose.yml` or `docker-compose.production.yml`. Do not invent wildcards, Host-derived policy, or forwarded-header fallbacks. Private domains/tokens must stay off GitHub and out of receipts. The production API still runs Node18, and privileged Docker socket/root self-healing remains in [DEVPROXY-004 issue #10](https://github.com/leorami/Dev-Tunnel-Proxy/issues/10). The source-only snapshot hardening PR #16 is not yet Engineer tested and should not distract from shipping the existing security fixes.

**Nonnegotiable:** no protected merges, live Docker restarts, `scripts/switch-to-production.sh`, real Messages, LaunchAgent modifications, public MCP exposure, secret rotation or cloud upload from this readiness workflow.
