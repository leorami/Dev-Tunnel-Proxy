# DEVPROXY P0 read-only app source remedy — owner-decision package

**Return label:** `RO_REPAIR_READY_FOR_OWNER_DECISION` / `NOT_DEPLOYED`  
**Not:** live recreate · `DEPLOYED_SECURE_RC1` · master merge · second use of GO `6595948888`

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| CTO handoff | `origin/cto/devproxy-p0-readonly-app-mount-remedy-20261103@5bc68dd42cfb64a4863f760b7dfcaecb7ada62d4` / PR #49 |
| Prior integrity receipt | PR #48 `@ddc14a115f2f13457d3dfc7fd7ab158d32449831` |
| Approved product | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Initial restore GO (consumed) | Issue #10 `6595948888` — **does not** authorize this second recreate |
| This receipt tip | commit SHA after push (40-char) |

Companion: `docs/receipts/evidence/DEVPROXY_P0_READONLY_APP_SOURCE_REMEDY_20261103.json`

## STARTED
Verified idle primary path, PR #48 head, Issue #10 restore return, CTO branch tip `5bc68dd…`. No rewrite of approved product, owner checkout, or private archives. No live recreate.

## IMPLEMENTING
### 1) Mac Node22 helper RED → fix → GREEN
CTO helper blob `d60e4002…` failed **8/11** on owner Mac: `os.tmpdir()` under `/var/folders…` hits `/var → /private/var`, so ancestor symlink walks returned `BLOCKED_SYMLINK`.

Scoped fix in `utils/rc1-empty-dotenv-target.cjs`: reject symlink **stage/candidate leaves** and require `dirname(realpath(candidate))===realpath(stage)`; do **not** walk OS ancestor mounts. New blob `aa691b83…`.

| Suite | Result |
| --- | --- |
| `node --test tests/security/rc1-empty-dotenv-target.test.cjs` (Node v22.19.0) | **11/11**, exit **0** |
| `./smart-build.sh test:unit` | exit **0** (helper suite green) |

### 2) Private `0700` stage (non-Git candidate)
- Fresh stage root mode `700`; candidate direct child; **no** `.git`; **no** owner `.env` bytes copied.
- Tree digest parity vs approved product (excluding `.git`/`.env`/node_modules/.artifacts): **true** (`49567030…`, 270 files).
- Helper `apply:false` → `READY_PRIVATE_STAGE_ONLY` (no file).
- Helper `apply:true` → `CREATED_EMPTY_PRIVATE_PLACEHOLDER`; size **0**, mode **0600**, regular file, nlink **1**, not symlink; `productionChangeAuthorized:false`; `secretBytesRead:false`.
- Idempotent re-apply → `ALREADY_EMPTY_PRIVATE_PLACEHOLDER`.

### 3) Compose `config --quiet` + disposable RO proof (torn down)
- Exact existing private overlay: `config --quiet` **ok** (not live `up`).
- Disposable proposed overlay (unique project/ports; origins-only env_file preserved: **3** origins, **no** `ADMIN_PASSWORD`): `config --quiet` **ok**; resolved `/app:ro`, `.env:ro`, apps `:ro`, artifacts RW, `127.0.0.1` 13001/13002.
- Nested mountpoints under RO `/app` also required precreated `.artifacts` **directory** (same EROFS mountpoint class as missing `.env` file).
- Disposable API runtime: `/app` `.RW=false`; write probes `app/env/apps` **EROFS** (`*_write_rc=1`); artifacts write **ok**; shared conf digest prefix `0c9bd6e23f60` match; **17** synth app confs; login+session **ok**; evil Origin **403**; Docker socket **absent**.
- Full compose proxy sidecar exited in disposable isolation (upstream name/certs); separate nginx image digest probe confirmed `default.conf` digest `0c9bd6e23f…`. **API-only** is the proven live correction scope.
- Disposable project fully removed (`no_disp_leftovers`).

### 4) Passive live metadata only (no writes)
| Check | Result |
| --- | --- |
| Proxy/API/ngrok ID prefixes | `1932725ad746` / `51bbafd0cf14` / `178b23cbdb9d` (unchanged) |
| Proxy still approved candidate image | **true** |
| Live `/app` still **RW** (deviation) | **true** |
| Live `/app/.env` RO | **true** |
| 3001/3002 loopback | **true** |
| Apps | **17** |
| Prior `/app` sentinel `.cto_ro_probe` | **absent** (container listing + host product) |
| Live mutation this turn | **false** |
| Ngrok/bridge | unchanged / untouched |

## Owner-gated exact recreate plan (NOT executed)
Requires **one fresh explicit owner GO** (initial GO consumed). Preferred scope: **API-only**; add proxy only if necessary.

1. Private `0700` stage + non-Git candidate from `d89c962…` with digest parity.  
2. `prepareEmptyDotenvTarget({apply:true})` for zero-byte `0600` `.env`; precreate other nested mountpoints (e.g. `.artifacts` dir) as required.  
3. Overlay: `/app:ro` + owner `.env:ro` + origins-only env_file (3, no synthetic password).  
4. Scoped force-recreate `proxy-config-api` (+ proxy iff needed). **Never** `bfc92bd8` fallback.  
5. Verify mount `RW=false` + write EROFS; preserve 17 apps, sessions, credential, ngrok/bridge; fail-closed within proxy+API only.

## RETURNED
**`RO_REPAIR_READY_FOR_OWNER_DECISION` / `NOT_DEPLOYED`.** Stop for CTO review, then owner GO for the smallest proven live correction.

**Specialists:** none.  
**Production mutate this turn:** none.
