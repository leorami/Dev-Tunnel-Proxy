# DEVPROXY-RC1 security staging receipt

Engineer-I execution of the CTO-first RC1 security-staging handoff at [Issue #9 comment 6570504322](https://github.com/leorami/Dev-Tunnel-Proxy/issues/9#issuecomment-6570504322).

**NOT_DEPLOYED.** **NO_LIVE_RELOAD.** **NO_PUBLIC_STAGING.** **NO_MAC_BRIDGE_CHANGE.** Private owner backups preserved. Stop for independent CTO review and owner UAT.

## Source identity

| Item | Value |
| --- | --- |
| Branch | `cto/devproxy-rc1-security-staging-20261102` |
| Exact start SHA | `62b1846e65a76b8972c1cefa3331feb2530326e7` (`cto/devproxy-rc1-private-config-snapshot-20261101`) |
| Resulting SHA | this commit (see `git rev-parse HEAD` on the branch) |
| Coordination | Issue #9 |
| Node | v22.19.0 (`nvm` first on PATH) |
| Owner checkout | `master@62a4d7babae986ade1feb0fd6dbe7dd32532523a`, untracked `.cursor/` only |
| Worktree | `/private/tmp/devproxy-staging` (does not write into the live owner checkout) |

## Primary activity check

Before start: Issue #26 RETURNED at `62b1846…`. No other primary Engineer-I STARTED on the next Issue #9 boundary. This engineer posted STARTED (`6570554642`) then IMPLEMENTING / VERIFYING. Draft PR #25 and prior drafts left unmerged.

## Bounded source corrections

1. **Trusted-origin CSRF** (`utils/admin-session-security.cjs`, wired in `utils/proxyConfigAPI.js`):
   - Replaced host-based `adminRequestOriginAllowed(host, origin)` with exact allowlist from `DEVPROXY_TRUSTED_ORIGINS`.
   - Cookie mutations require a trusted `Origin` (scheme+host+port exact).
   - Missing Origin denied for cookie auth; bearer may omit Origin as a distinct non-browser boundary.
   - GET/HEAD/OPTIONS may omit Origin so nginx `auth_request` still works.
   - `normalizeTrustedOrigins` accepts an already-normalized `Set` (staging found re-normalizing a `Set` emptied the allowlist and 403’d every login).
2. **Parent-symlink mtime restore** (`utils/restore-manifest-mtimes.cjs`):
   - Walk path segments with `lstat`; reject symlink parents; do not follow a parent symlink out of the extract root when applying mtimes.
3. **Tests + hook**: `tests/security/trusted-origin-csrf.test.mjs`; Origin assertions updated in `admin-session-foundation.test.mjs`; parent-symlink case in `restore-route-precedence.test.mjs`; `smart-build.sh test:unit` hook for the new suite.

## RED → GREEN

| Case | RED against `62b1846` / old helper | GREEN after correction |
| --- | --- | --- |
| Portless Host + Origin on another port | accepted (hostname-only) | denied unless exact trusted origin |
| HTTPS Host + `http://` Origin | accepted (no scheme check) | denied |
| Cookie mutation missing Origin | accepted | denied |
| Parent dir `apps` → outside extract | external mtime changed | `UNSAFE_RESTORE_NODE`; outside unchanged |
| Trusted list already a `Set` | N/A (staging defect) | login 200 with `DEVPROXY_TRUSTED_ORIGINS` |

## Native tests

| Gate | Result |
| --- | --- |
| Focused: admin-session + trusted-origin + restore-route-precedence | 17 pass / 0 fail, exit 0 |
| `./smart-build.sh test:unit` | exit 0 (includes Trusted-origin CSRF 4/4, Admin session 9/9, Route precedence mtime 4/4) |
| `test:all` | **BLOCKED** (would hit live `:3001`) |

## Disposable staging (loopback only)

| Item | Value |
| --- | --- |
| Nginx | `rc1staging-nginx` → `127.0.0.1:18090` (`rc1staging-proxy:latest`) |
| API | `rc1staging-api` → `127.0.0.1:18091` (`node:18-alpine`, source copy under `/private/tmp/devproxy-rc1-staging-run/api-src`) |
| Trust env | `DEVPROXY_TRUSTED_ORIGINS=http://127.0.0.1:18090` in `api.env` mode `0600` (password not published) |
| Network | private docker network; **not** published beyond loopback bind |

### API / nginx matrix (password not recorded)

| Check | Result |
| --- | --- |
| `POST /admin/login` + trusted Origin | 200, `admin_session` 64-hex, HttpOnly, SameSite=Strict |
| Login missing Origin / evil Origin | 403 |
| Signed-in `GET /devproxy/api/ai/chat-history` | 200 `application/json` |
| Signed-in + evil Origin (via nginx) | 403 |
| Cookie mutate missing Origin (`/settings/auto-scan`) | 403 `Origin denied` |
| Bearer mutate without Origin (direct API) | 200 (distinct boundary) |
| Anon direct API chat-history | 401 JSON |
| Anon via nginx protected routes | redirected to login HTML (auth_request → `@login_redirect`) |

### Headless signed-in browser

Chromium headless shell against `http://127.0.0.1:18090`:

- Login UI → authenticated (`/admin/check` `{authenticated:true}`) → `/status` then `/dashboard/`
- Chat-history from page origin: 200 JSON `ok:true`
- No resource hits to `:17888` or `:8080`
- Screenshots: `docs/receipts/staging-browser/01-login.png`, `02-after-login.png`, `03-dashboard-signed-in.png`

### Private fingerprints (staging)

| Path | Status | sha256 |
| --- | --- | --- |
| `/devproxy/api/ai/health` | 200 | `c725e516c339641f26c0368f9dcb1738f042e7f4ddbb8be68d67fe5f8a52de1a` |
| `/admin/login` | 200 | `b78fe69043f6923bbba3471a35798679479499879436fdc7fbe11846fd7321b0` |

## Live system (unchanged)

| Listener | Evidence |
| --- | --- |
| Proxy `:8080` | still `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634` (`dev-tunnel-proxy-proxy`) |
| Mac bridge | `node` pid `3760` on `127.0.0.1:17888` |
| Private rollbacks | `~/Library/Application Support/Dev Tunnel Proxy/private-rollbacks` still `0700`; image/config archives and `OPERATOR_RECOVERY_REPORT.private.json` not recreated |

## Release gate states

| Gate | State |
| --- | --- |
| `rollbackArchiveVerified` | **PASS** (cite Issue #26 RETURNED / CTO acceptance at `62b1846…`; archives preserved) |
| `publicIngressPlanReviewed` | **NOT_RUN** |
| `ownerStagingUat` | **NOT_RUN** |
| `ownerExplicitApproval` | **NOT_RUN** |
| deployment | **NO** |

## Remaining blockers

- Owner browser UAT on the disposable loopback staging URL (below).
- Public ingress plan review and production nginx image proof.
- Explicit owner GO before any live reload, credential rotation, protected merge, or deploy.
- Staging is disposable and loopback-bound; it is **not** production cutover evidence.

## Owner UAT instructions (private, loopback)

1. Open **only** `http://127.0.0.1:18090/admin/login` on the owner Mac (staging nginx). Do not use the public tunnel or `:8080`.
2. Password is the disposable fixture in `/private/tmp/devproxy-rc1-staging-run/api.env` (`ADMIN_PASSWORD=…`, mode `0600`). Do not paste it into GitHub, chat, or screenshots.
3. After login, confirm redirect into the admin UI (`/status` or `/dashboard/`), then open Dashboard and confirm authenticated navigation.
4. Optional: DevTools → Network: protected `/devproxy/api/*` calls succeed with the session cookie; a forged cross-site Origin is not expected from a real browser.
5. Do **not** restart live compose, touch the Mac LaunchAgent/bridge, merge protected branches, or expose `18090` publicly.
6. Record GO / NO-GO for `ownerStagingUat` and `ownerExplicitApproval` separately after CTO review of this committed diff.

## Specialist disposition

No separate specialist owned a parallel primary. Work stayed in one Engineer-I worktree; disposable Chromium was used only for signed-in proof.
