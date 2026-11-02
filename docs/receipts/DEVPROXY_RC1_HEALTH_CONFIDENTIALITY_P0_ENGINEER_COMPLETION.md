# DEVPROXY-RC1 P0 health confidentiality — Engineer verification receipt

Engineer-I execution of `origin/cto/devproxy-rc1-health-confidentiality-20261102@e1ecd655c0e6c69e507b75a9571f4210514ec825:docs/handoffs/DEVPROXY_RC1_HEALTH_CONFIDENTIALITY_P0.md`.

**Source acceptance for this P0 only. Production recommendation remains NO_GO.** **NOT_DEPLOYED.** Staging `:18090` and private backups preserved. Stop for independent CTO committed-diff review and owner UAT.

## Source identity

| Item | Value |
| --- | --- |
| Pinned CTO tip tested | `e1ecd655c0e6c69e507b75a9571f4210514ec825` |
| Parent RED baseline | `85a20e3b3e221601f8f1a2ef6a4df4dcf8e97207` (draft PR #29) |
| Branch | `cto/devproxy-rc1-health-confidentiality-20261102` (draft PR #30) |
| Resulting SHA | this commit (receipt + evidence only) |
| Node | v22.19.0 |
| Worktree | `/private/tmp/devproxy-health-cto-p0` |
| Owner checkout | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, untracked `.cursor/` only |

No further product nginx edits were required: CTO commits already implement existence-guarded minimal `/health.json` in both modes.

## RED → GREEN (committed contract)

| Tree | Suite | Result |
| --- | --- | --- |
| Parent `85a20e3…` + `tests/security/public-health-privacy.test.mjs` | 3 tests | **1 pass / 2 fail**, exit 1 (Compose healthcheck path OK; both nginx configs fail) |
| Pinned `e1ecd65…` | same | **3 pass / 0 fail**, exit 0 |
| `./smart-build.sh test:unit` | canonical | exit **0** (includes Public health report confidentiality 3/3) |
| `test:all` | — | **BLOCKED** (live `:3001`) |

## Disposable HTTP proofs

Synthetic fixture marker `SYNTHETIC_PRIVATE_MARKER_do_not_leak` (and `private.example` / `generatedAt`) **never** appeared in `/health.json` bodies.

| Image | absent `/health.json` | present `/health.json` | anon `/status.json` | auth `/status.json` | delete → `/health.json` |
| --- | --- | --- | --- | --- | --- |
| `nginx:1.26.3-alpine` (reference) | 503 `{"status":"unavailable"}` | 200 `{"status":"ok"}` | 401 | 200 detailed (marker present) | 503 unavailable |
| `devproxy-rc1-nginx:disposable` (production Brotli image; modules `ngx_http_brotli_filter_module.so`, `ngx_http_brotli_static_module.so`) | same | same | 401 | 200 detailed | 503 |

Compose still healthchecks `wget … http://127.0.0.1/health.json` in both `docker-compose.yml` and `docker-compose.production.yml`.

Nginx `if (!-f …) { return … }` only uses `return` (no private body). No unconditional 200. `/status.json` remains `auth_request` + alias to the detailed report.

## Staging / backups (read-only)

| Check | Evidence |
| --- | --- |
| Staging login | `http://127.0.0.1:18090/admin/login` HTTP 200; stack **not** restarted or replaced |
| Signed-in `/status` UI | authenticated; Status Overview visible; screenshot `docs/receipts/health-confidentiality-browser/signed-in-status.png` |
| Live proxy `:8080` | still `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` |
| Bridge | `127.0.0.1:17888` LISTEN |
| Private rollbacks | `0700` tree preserved (Issues #19/#26); not re-exported |

## Changed files this return

- `docs/receipts/DEVPROXY_RC1_HEALTH_CONFIDENTIALITY_P0_ENGINEER_COMPLETION.md`
- `docs/receipts/health-confidentiality-browser/signed-in-status.png`

Product/source P0 remains the CTO commits already on this branch.

## Authority

No protected merge, live reload/restart, public tunnel probe, Mac bridge change, credential operation, or deployment. Owner UAT/GO and release authority remain separate. **NO_GO** for production cutover.
