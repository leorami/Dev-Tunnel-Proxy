# DEVPROXY-RC1 trusted-origin Compose gate receipt

Engineer-I execution of `origin/cto/devproxy-rc1-trusted-origin-compose-gate-20261102@bcf5adde0bbdca4821656af5fdbb212e20ae6e50:docs/handoffs/DEVPROXY_RC1_TRUSTED_ORIGIN_COMPOSE_OWNER_GATE.md`.

**NOT_DEPLOYED.** **NO_LIVE_RELOAD.** **NO_COMPOSE_UP.** **NO_PUBLIC_STAGING.** Private rollbacks and disposable staging from PR #27 preserved. Stop for independent CTO committed-diff review.

## Source identity

| Item | Value |
| --- | --- |
| Branch | `cto/devproxy-rc1-trusted-origin-compose-gate-20261102` |
| Pinned CTO tip tested | `bcf5adde0bbdca4821656af5fdbb212e20ae6e50` |
| Parent staging (unchanged) | `f9c3ef359526be15059d7bd412e82247ea482d22` (draft PR #27) |
| Resulting SHA | this commit |
| Draft PR | #28 |
| Node | v22.19.0 |
| Worktree | `/private/tmp/devproxy-compose-gate` |
| Owner checkout | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, untracked `.cursor/` only |

## Defect (parent)

At `f9c3ef…`, API reads `DEVPROXY_TRUSTED_ORIGINS` once, but neither Compose file forwarded it. Empty allowlist → every browser `POST /admin/login` 403. Disposable staging used a separate `api.env`; that is not default Compose deploy parity.

## Changed files (this boundary)

| File | Change |
| --- | --- |
| `docker-compose.yml` | forward `DEVPROXY_TRUSTED_ORIGINS=${DEVPROXY_TRUSTED_ORIGINS:?…}` into `proxy-config-api` |
| `docker-compose.production.yml` | same mandatory forward |
| `tests/security/trusted-origin-compose-gate.test.mjs` | RED/GREEN Compose + API env contract; Engineer aligned assertion with returned `normalizeTrustedOrigins(process.env.DEVPROXY_TRUSTED_ORIGINS \|\| '')` and latin1 read for historical NULs |
| `smart-build.sh` | `test:unit` hook for the suite |
| `docs/handoffs/DEVPROXY_RC1_TRUSTED_ORIGIN_COMPOSE_OWNER_GATE.md` | CTO handoff (pinned) |
| `docs/release/DEVPROXY_RC1_OWNER_GO_NO_GO_V1.md` | release runbook now requires explicit operator origin allowlist before Compose deploy |
| `docs/receipts/DEVPROXY_RC1_TRUSTED_ORIGIN_COMPOSE_GATE_ENGINEER_COMPLETION.md` | this receipt |

No edits to PR #27 branch, `utils/proxyConfigAPI.js`, live owner checkout, or staging containers.

## RED → GREEN

| Tree | Result |
| --- | --- |
| Parent Compose manifests + gate test | **1 pass / 2 fail**, exit 1 (API bootstrap PASS; both Compose files FAIL) |
| Pinned CTO tip + Engineer test align | **3 pass / 0 fail**, exit 0 |
| `./smart-build.sh test:unit` | exit **0** (Trusted-origin Compose forwarding 3/3 included) |

## Compose config render (no up/down; resolved config not printed)

| Command | `DEVPROXY_TRUSTED_ORIGINS` | Exit |
| --- | --- | --- |
| `docker compose -f docker-compose.yml config --quiet` | unset | **1** (`required variable DEVPROXY_TRUSTED_ORIGINS is missing…`) |
| `docker compose -f docker-compose.production.yml config --quiet` | unset | **1** (same) |
| same, both files | process-only sample `http://127.0.0.1:18090,https://example.test` | **0** |

Sample origins are fixtures only. Real owner browser origin and public static domain must be supplied by the operator at an authorized release; never committed.

## Live / staging / backups (read-only)

| Check | Evidence |
| --- | --- |
| Live proxy `:8080` | still `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` |
| Mac bridge | pid `3760` on `127.0.0.1:17888` |
| Disposable staging | `http://127.0.0.1:18090/admin/login` still HTTP 200 (PR #27 stack left running) |
| Private rollbacks | `~/Library/Application Support/Dev Tunnel Proxy/private-rollbacks` still `0700`; no new archives |

Signed-in browser UAT was not re-run; Compose-only source does not change the #27 staging session path.

## Release gates

| Gate | State |
| --- | --- |
| `rollbackArchiveVerified` | PASS (Issue #26 / prior) |
| Compose trusted-origin forward | **PASS** (source + config render) |
| `publicIngressPlanReviewed` | NOT_RUN |
| `ownerStagingUat` | NOT_RUN (route remains #27 loopback login) |
| `ownerExplicitApproval` | NOT_RUN |
| deployment | **NO** |

## Owner UAT route (unchanged from #27)

1. Open only `http://127.0.0.1:18090/admin/login`.
2. Use disposable password from `/private/tmp/devproxy-rc1-staging-run/api.env` (0600); do not paste into GitHub.
3. Confirm signed-in `/status` or `/dashboard/`.
4. Eventual real Compose deploy (separate authority) must set `DEVPROXY_TRUSTED_ORIGINS` to the exact browser origin(s) in use.

## Acceptance status

Source-only / isolated verification complete. Prevents foreseeable default-Compose login lockout. Does **not** grant cutover, merge, live restart, credential, or public-ingress authority.
