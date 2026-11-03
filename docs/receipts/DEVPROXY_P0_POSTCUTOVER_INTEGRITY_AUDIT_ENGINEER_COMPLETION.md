# DEVPROXY P0 post-cutover security-integrity audit (read-only)

**Return label:** `DEPLOYED_WITH_SOURCE_MOUNT_DEVIATION`  
**Not:** `DEPLOYED_SECURE_RC1` fully signed off · NOT a second production recreate · NOT master merge

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| CTO instruction | PR #44 comment `6597244028` |
| Owner GO (prior restore only) | Issue #10 comment `6595948888` |
| Engineer deploy receipt (not re-run) | Issue #10 comment `6597177845` |
| Pinned Engineer-I tip | `engineer/devproxy-p0-private-origin-provenance-20261102@4fe5f78fd4a527e4ca71e42d7f311338b982367a` |
| Product under live bind | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Approved candidate proxy image | `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This receipt branch tip | see commit SHA after push (40-char) |

Companion redacted machine evidence: `docs/receipts/evidence/DEVPROXY_P0_POSTCUTOVER_INTEGRITY_AUDIT_20261103.json`

## STARTED
Read-only post-cutover integrity audit only. Production restoration **not** repeated. No global compose down, no ngrok/bridge change, no owner `.env` overwrite, no protected merge.

## IMPLEMENTING (read-only live + disposable only)
### Live container audit (booleans / codes)
| Check | Result |
| --- | --- |
| Live proxy image == approved candidate | **true** |
| Live proxy image == legacy `bfc92bd8…` | **false** |
| API `/app` mount `.RW` | **true** (`Mode=rw`) — **approved continuity expects RO** |
| API `/app/.env` mount `.RW` | **false** (`Mode=ro`) |
| API `/app/apps` mount `.RW` | **false** |
| API `/app/.artifacts` mount `.RW` | **true** (expected for sessions) |
| Actual write to `/app` (then removed) | **succeeds** (source tree mutable) |
| Actual write to `/app/.env` | **EROFS** |
| Actual write to `/app/apps` | **EROFS** |
| `/var/run/docker.sock` on API | **absent** |
| `/var/run/docker.sock` on proxy | **absent** |
| API `Privileged` | **false** |
| API process UID | **0** (`user=root`) |
| 3001/3002 HostIp | **127.0.0.1** only |
| `nginx -t` | **ok / successful** |
| Shared `default.conf` digest prefix | `0c9bd6e23f60…` |
| `/health.json` | **200** body `{"status":"ok"}` (15B) |
| Anon `/admin/check` | **401** |
| `/.artifacts/` | **404** |
| `/admin/show-password` | **404** |
| Evil Origin login | **403** |
| Login + cookie `/admin/check` | **200** `authenticated:true` |
| Session file mode | **0600** |
| Active owner app confs | **17** |
| Ngrok container ID | **unchanged** (`178b23cbdb9d…`) |
| Mac bridge | **untouched** |
| `ADMIN_PASSWORD` in API process env | **absent** |
| Trusted origins count | **3** (values not published) |

**Verdict on “fully secure”:** **false.** Confidentiality HTTP/management perimeter currently holds, but live `/app:rw` + root API is a **material source-integrity deviation** from approved `/app:ro` mount continuity (and conflicts with draft PR #46 `MOUNT_CONTINUITY_MISMATCH` intent). Docker socket RW risk: **not present**.

### Disposable nested-mount matrix (synthetic only; torn down)
Isolated `alpine` bind tests (no owner secrets; no live project):

| Case | Started | Note |
| --- | --- | --- |
| A: `/app:ro` + nested `.env:ro`, product **missing** `.env` file | **false** | `EROFS` creating mountpoint — matches cutover failure |
| B: `/app:ro` + nested `.env:ro`, product **precreated** `.env` file | **true** | both mounts `rw=false`; writes fail (`app_write_rc=1`,`env_write_rc=1`) |
| C: `/app` RW + nested `.env:ro` (live-style control) | **true** | `/app` writable; `.env` EROFS |
| D: `/app:ro` + env at `/run/secrets/dotenv:ro` (non-nested) | **true** | `/app` immutable; requires code/path change (broader than mount-only) |
| E: `.env` is a directory under product | **false** | type mismatch |
| F: baked `.env` inside product, `/app:ro`, no nested mount | **true** | immutable, but bakes credential into product tree (rejected for owner mapping) |

**Remedy booleans:** `precreate_dotenv_enables_app_ro_nested=true`; `missing_dotenv_file_fails_ro_parent=true`.

## VERIFYING
- Live IDs unchanged during this audit (no recreate): proxy `1932725ad746…`, api `51bbafd0cf14…`, ngrok `178b23cbdb9d…`.
- Fail-closed containment **not** applied: confidentiality listeners already deny anon/artifact/show-password; stopping proxy/API would drop availability without restoring `/app:ro`; owner GO does not authorize a second recreate here.
- **No production recreate** performed in this task.

### Tests / exit evidence
| Suite | Result |
| --- | --- |
| `node --test tests/security/*.mjs` @ `4fe5f78…` | **106/106 pass**, exit **0** |
| Disposable nested-mount matrix (6 cases) | see table above; case **B** proves RO remedy |

## Proposed scoped correction (CTO decision; **do not execute without new owner GO**)
1. Ensure product tree has a **regular-file** placeholder at `.env` before up (empty/non-secret). Disposable case **B** proves nested owner `.env:ro` then works under `/app:ro`.
2. Restore API bind to **`/app:ro`** with nested owner `.env:ro`; keep apps/sites RO; artifacts RW; loopback 3001/3002.
3. Scoped `proxy-config-api` then `proxy` force-recreate only; re-attest `/app` `.RW=false` and write EROFS; never roll back to `bfc92bd8…`.

Root API UID remains a residual hardening item even after RO remount.

## RETURNED
**`DEPLOYED_WITH_SOURCE_MOUNT_DEVIATION`** — evidence-backed; not a full secure sign-off. Stop for CTO review.

**Specialists:** none.  
**Production mutate this turn:** none.
