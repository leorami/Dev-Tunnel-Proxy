# DevProxy Security RC1 — owner decision packet (NO-GO)

**Owner decision packet, NOT deployment authorization.** Installed nginx/ngrok/API and the macOS bridge are **unchanged**. Classifier flags stay `releaseAuthorized=false` and `installed=false` even if every readiness gate later passes.

**Current recommendation: NO-GO** for live cutover. Remaining blockers are owner UAT, explicit owner approval, Mac bridge host plan, and an authorized production rollout — not another backup sprint.

## Reconciled evidence (source-linked; no private archive bytes)

| Milestone | Evidence | Gate |
| --- | --- | --- |
| Source / unit tests | Node 22 canonical `./smart-build.sh test:unit` exit 0 on RC1 tip `031de0d0e8d4f87e9badbdd2853d6506577e8b0e` and this evidence branch | `sourceTests` **PASS** |
| Production Compose package | Preflight disposable Brotli image proof (PR #18 / issue #17); Compose still unmerged | `productionCompose` **PASS** (disposable) |
| Node 18 API parity | Disposable `node:18-alpine` session/login proofs across RC1 receipts | `node18Parity` **PASS** |
| Fixture browser | Preflight + PR #27 headless signed-in staging screenshots (fixture credentials) | `fixtureBrowser` **PASS** |
| Mac bridge mock | RC1 mock authorization tests; live LaunchAgent/bridge **not** restarted | `macBridgeMock` **PASS** (mock only) |
| Installed image identity | Read-only: proxy `sha256:bfc92bd8…fac41634`, API `sha256:8d6421d6…a09d9e`, ngrok `sha256:141f5645…bf2bfa` (still running) | `currentImageIdentified` **PASS** |
| Offline rollback archive + restore | Owner-private image+config archives already created (Issue #19 / PR #25). Issue #26 verified named-tag binding in disposable dind, exact route mtime restore, fail-closed RO nginx at `62b1846…`. Archives **preserved**, not recreated | `rollbackArchiveVerified` **PASS** |
| Redacted route/health fingerprint | Live proxy/API/ngrok **running**; loopback `/health.json` HTTP 200 (body not published); owner checkout `apps/*.conf` count **17**; no route names or response bodies in this packet | `routeBaselineRecorded` **PASS** (counts/status only — **not** live cutover parity) |
| Public ingress **plan** review | Source-only review of ngrok static/dynamic entrypoint, nginx `$host` / `X-Forwarded-*`, and mandatory `DEVPROXY_TRUSTED_ORIGINS` (PR #28). **No** live public probe or domain discovery | `publicIngressPlanReviewed` **PASS** (plan only) |
| Owner staging UAT | Disposable loopback staging remains at `http://127.0.0.1:18090/admin/login` (PR #27). Owner has not recorded acceptance | `ownerStagingUat` **NOT_RUN** |
| Mac bridge owner plan | Separate authorization required before LaunchAgent/token work | `macBridgeOwnerPlan` **NOT_RUN** |
| Explicit owner approval | Not granted by this packet | `ownerExplicitApproval` **NOT_RUN** |

## Public ingress plan (source-only; no live probe)

1. **ngrok:** `scripts/ngrok-entrypoint.sh` uses `NGROK_STATIC_DOMAIN` when set (HTTPS hostname tunnel to `dev-proxy:80`); otherwise copies `config/ngrok.dynamic.yml` (HTTP proto, `bind_tls: true`, dynamic domain). Inspect enabled in both templates.
2. **nginx:** Forwards `Host $host` (portless) and often `X-Forwarded-Proto $scheme` / `X-Forwarded-For`. Management APIs use `auth_request /admin/check`. Do **not** treat Host or forwarded headers as the CSRF trust root.
3. **Trusted origins:** API allowlists exact `DEVPROXY_TRUSTED_ORIGINS` (`scheme://host[:port]`). Both Compose files **fail config** if unset (PR #28). For any future authorized public cutover, operator must set origins to the real browser origin **and** the authorized public HTTPS origin (static domain when used). No wildcards, Host-derived policy, or client-controlled header fallback.
4. **Post-cutover checks (future, separate authority):** anonymous denials on management paths; owner-authenticated UI parity; never log confidential bodies. **Not performed here.**

## Remaining blockers (owner / separate authority)

1. **Owner staging UAT** on `http://127.0.0.1:18090/admin/login` (password only in private disposable `api.env`; do not paste to GitHub).
2. **Mac bridge host plan** (LaunchAgent / pairing) — not a restart task in this sprint.
3. **Explicit owner GO** for merge/restart/credential/public ingress — none of which this packet grants.
4. Unmerged security/RC1 draft stack (including #27/#28 and earlier RC1 drafts) vs protected `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`.
5. Broader debt remains tracked elsewhere (e.g. DEVPROXY-004 Docker socket / issue #10).

## Owner UAT checklist (loopback staging only)

- [ ] Login success / wrong-password failure on staging
- [ ] Dashboard / status navigation while signed in
- [ ] Logout and anonymous denial
- [ ] Confirm you did **not** use the public tunnel or live `:8080` admin for this UAT
- [ ] Record GO or NO-GO for live change (separate from this packet)

## Authority boundary

**READINESS ≠ AUTHORITY.** No protected merge, live proxy/ngrok restart, public staging exposure, archive replacement, Mac bridge change, token rotation, password publication, or deployment is authorized by a PASS gate or by this file.
