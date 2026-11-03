# DEVPROXY P0 all nested mount targets (Mac) — owner GO packet

**Return label:** `RO_ALL_MOUNTS_READY_OWNER_GO` / `NOT_DEPLOYED`  
**Not:** live recreate · second use of GO `6595948888` · master merge

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| CTO handoff | `origin/cto/devproxy-p0-nested-mount-targets-mac-20261103@b32004b50afab87f4c5d4734f0009361bc2bcbe8` / PR #52 |
| Prior Engineer return | PR #50 `@05659c927d19b9499469c44aabea97531cf4124a` |
| Approved product | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Consumed GO | Issue #10 `6595948888` — **new GO required** for second recreate |
| Blobs verified | nested helper `3315cb9f…`, nested test `377ac758…`, Mac dotenv helper `aa691b83…` |
| This receipt tip | commit SHA after push |

Companion: `docs/receipts/evidence/DEVPROXY_P0_ALL_NESTED_MOUNT_TARGETS_MAC_20261103.json`

## STARTED
Rechecked primary status, PR #50 full SHA, handoff SHA `b32004b…`. No second primary. No live recreate / owner file probes / ngrok / bridge / master mutations.

## IMPLEMENTING
### Tests (owner Mac Node v22.19.0)
| Suite | Result |
| --- | --- |
| `node --test` empty-dotenv + nested-mount targets | **21/21**, exit **0** |
| `./smart-build.sh test:unit` | exit **0** |

No Mac failures; no helper code change this turn.

### Private `0700` NON-Git candidate
- Product-file digest **before** placeholders: parity **true** (`49567030…`, 270 files).
- `apply:false` → `MISSING_PRIVATE_MOUNT_TARGETS` missing fixed classes `ENV_FILE`, `ARTIFACTS_DIR`, `SITES_DIR`.
- `apply:true` → `STAGED_PRIVATE_MOUNT_TARGETS_ONLY`: `.env` size **0** mode **0600**; `.artifacts` + `build/sites-enabled` dirs mode **0700**; no symlinks; `productionChangeAuthorized:false`; `secretBytesRead:false`.
- Idempotent → `ALREADY_STAGED_PRIVATE_MOUNT_TARGETS`.
- Product-file digest **after** (placeholders excluded): parity **true** (approved files untouched).

### Compose + disposable synthetic stack (torn down)
- Exact private overlay: `config --quiet` **ok** (not live `up`).
- Unique disposable API stack: `/app:ro` + nested `.env:ro`, apps/sites `:ro`, `.artifacts` RW, origins-only (**3**, no `ADMIN_PASSWORD`), loopback `127.0.0.1:13011/13012`.
- Runtime: all nested mounts attached; source/env/apps/sites writes **EROFS**; artifacts RW; digest prefix `0c9bd6e23f60` match; **17** synth apps; login+session ok; evil Origin **403**; Docker socket absent; leftovers **0**.

### Passive live metadata only
| Check | Result |
| --- | --- |
| IDs (proxy/api/ngrok) | `1932725ad746` / `51bbafd0cf14` / `178b23cbdb9d` |
| Proxy candidate image | **true** |
| Live `/app` still **RW** | **true** (deviation unchanged) |
| `/app/.env` RO | **true** |
| 3001/3002 loopback | **true** |
| Apps | **17** |
| Ngrok unchanged | **true** |
| Live mutation this turn | **false** |

## Owner-gated second correction (NOT executed)
Requires **fresh explicit owner GO**. Preferred: **API-only** `/app:ro` with staged nested mountpoints + owner `.env:ro` + origins-only; proxy only if necessary. Preserve credential, sessions, 17 apps, ngrok/bridge, shared nginx/API config. Fail closed — never `bfc92bd8`.

## RETURNED
**`RO_ALL_MOUNTS_READY_OWNER_GO` / `NOT_DEPLOYED`.** Stop for CTO review, then owner GO.

**Specialists:** none. **Production mutate this turn:** none.
