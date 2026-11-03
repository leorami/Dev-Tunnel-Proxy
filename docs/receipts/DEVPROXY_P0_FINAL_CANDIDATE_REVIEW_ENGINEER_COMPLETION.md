# DEVPROXY P0 final candidate review — disposable RO `.env` / session / origin attestation

**Return label:** `P0_FINAL_CANDIDATE_REVIEW_PASS` / `OWNER_DECISION_REQUIRED` / `PLAN_ONLY` / `NOT_DEPLOYED` / `RUNTIME_STILL_DRIFTED`  
**Not:** LIVE GO / DEPLOYED / productionChangeAuthorized

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Start tip | `engineer/devproxy-p0-private-origin-provenance-20261102@f7ddc7cf5f3180e84a51a9065b07a533f028b9b9` |
| CTO review | PR #44 comment `6595769978` |
| This receipt tip | draft PR #44 head after push (full 40-SHA) |
| Product under test | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |

Origins-only staging correction was **not** repeated; prior PLAN_ONLY package retained.

## 1) Disposable RO `/app/.env` vs product password init (synthetic only)
Isolated Compose project `p0finalcand` (torn down). Synthetic credential only; owner `.env` never mounted/read.

| Case | Observation (codes/booleans only) |
| --- | --- |
| RO mount + valid synthetic `ADMIN_PASSWORD` in `.env` | Startup logs `Failed to ensure admin password: EROFS … chmod '/app/.env'`; API still listens |
| Wrong password login | **401** |
| Correct synthetic password + trusted Origin | **200** `"ok":true` |
| Evil Origin | **403** |
| `/admin/check` with session cookie | **200** |
| Process does **not** select a generated credential when key present | login proves same synthetic password works; no `Generated new ADMIN_PASSWORD` in RO-valid logs |
| RW mount control | clean `Loaded ADMIN_PASSWORD from .env file`; login **200** |
| RO mount **missing** `ADMIN_PASSWORD` key | EROFS on write attempt; `Generated` **false**; dotenv unchanged; API still listens with ephemeral in-memory fallback — **not** the planned live mapping (live plan requires owner `.env` **with** key) |

**Honest EROFS note:** chmod (and missing-key persist) fail on RO; when the key exists, assignment to `process.env` occurs before chmod, so catch still returns the owner/synthetic password. Login continuity holds for the planned origins-only + owner `.env:ro` mapping.

## 2) Session recovery
| Check | Result |
| --- | --- |
| Session file written under disposable `.artifacts` | present; mode `0600`; not symlink |
| After `--force-recreate` of RO API | startup `Loaded 1 active sessions`; session file survived |
| Cookie `/admin/check` using persisted session id | **200** (`rehydrate_ok=true`) |
| Password change ≠ automatic session wipe | consistent with CTO nuance; sessions validate independently |

## 3) Third Origin attestation (redacted)
| Check | Result |
| --- | --- |
| Origins-only staging count | **3** |
| Classes | `https://static-host`, `http://127.0.0.1:8080`, `http://localhost:8080` |
| Public PR #35 literal `localhost:8080` published | **false** |
| Private provenance class | prior RC1 cutover construction exact loopback pair for live port **8080** |
| Invented / wildcard / Host-header | **false** |
| Attestation | `PRIVATELY_CORROBORATED_AS_PRIOR_CUTOVER_LOOPBACK_CLASS_NOT_INVENTED` |

Private HTTPS hostname values never printed.

## 4) Secure rollback preserved
`assessSecureRollback(bfc92bd8…)` → `LEGACY_AVAILABILITY_FALLBACK_INSECURE` (`securitySafe:false`).  
Pre-RC1 image remains **insecure availability-only**, not confidentiality-safe recovery.

## Tests
| Suite | Result |
| --- | --- |
| Focused (secure-rollback + p0 evidence + CSRF + admin-session-foundation) | **34/34** |
| `./smart-build.sh test:unit` | **exit 0** |

## Live runtime
IDs **unchanged**: proxy `4fe666ca8b69…`, api `12c4aeac7e02…`, ngrok `178b23cbdb9d…`.  
Disposable `p0finalcand` removed (0 leftovers). No production restart/deploy; no owner `.env`/session mutation; no ngrok/bridge/merge; no secret disclosure.

## Remaining before live restoration
1. **Separate explicit owner GO** for scoped proxy+API recreate  
2. **CTO independent review** of this disposable verification receipt  
3. Operator must use **origins-only** staging + owner `.env:ro` (never synthetic-password staging)  
4. If live restore fails confidentiality gates: **fail closed** — do not treat `bfc92bd8…` as secure rollback  

**Specialists:** none.
