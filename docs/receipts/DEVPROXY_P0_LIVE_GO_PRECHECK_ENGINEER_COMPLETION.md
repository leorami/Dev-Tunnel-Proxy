# DEVPROXY P0 live-GO precheck — credential / origin / rollback continuity

**Return label:** `LIVE_GO_PRECHECK_BLOCKED` / `RUNTIME_STILL_DRIFTED` / `NOT_DEPLOYED`  
**Not:** LIVE_GO_PRECHECK_PASS / READY / GO / DEPLOYED / productionChangeAuthorized

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Authority / pins
- Executed CTO remaining-only review in PR #44 comment `6595519875`
- Pinned source tip at start: `engineer/devproxy-p0-private-origin-provenance-20261102@61708591b8a190587a990f607bfac4f505e306eb`
- Imported (additive) CTO secure-rollback contract from PR #45 `@27438fbe674d2a7780812c41455b0a75cb255081` for native verification only
- Prior staging RETURNED `6595453717` remains accepted as PLAN_ONLY staging — **not** a live restoration GO
- Tip-pin typo `...306eb` in `6595454609` ignored per CTO; authoritative SHA is `...e306eb` / this branch HEAD after push

## 1) Synthetic staging `ADMIN_PASSWORD` vs owner production credential
| Check (redacted / source-precedence) | Result |
| --- | --- |
| Product `ensureAdminPassword` reads `process.env.ADMIN_PASSWORD` **before** owner `.env` | **true** (product `d89c962` + tip) |
| Staging file contains synthetic `ADMIN_PASSWORD` (prefix-shaped; value unprinted) | **true** |
| Exact RC1 Compose dry-run resolves `ADMIN_PASSWORD` equal to staging synthetic | **true** |
| Owner `.env` has `ADMIN_PASSWORD` key (len ≥16 bucket) | **true** |
| Live API process currently has `ADMIN_PASSWORD` env | **UNSET** (unchanged) |
| **If overlay applied as-is to live API** | **would silently replace owner admin credential** |

**Gate:** `BLOCK_LIVE_INJECTION_OF_STAGING_ADMIN_PASSWORD`  
Staging remains valid for dry-run/CSRF origin proofs only. A future live candidate env must **omit** `ADMIN_PASSWORD` (origins-only) so the API loads the owner credential from existing private store / `.env` precedence — not implemented as a live change this sprint.

## 2) Session continuity
| Check | Result |
| --- | --- |
| Owner `admin-session.json` under `.artifacts` | present; mode `0600`; size attested (bytes not read) |
| Overlay mounts owner `.artifacts` on proxy + API | yes; **RW** |
| Session path preserved if artifacts bind kept | **yes** |
| Continuity if synthetic admin password injected | **broken** (sessions bound to prior password) |

Session file path continuity is structurally OK; credential replacement would still invalidate login continuity.

## 3) Trusted Origins: prior 3 vs staged 2
| Check | Result |
| --- | --- |
| Prior successful cutover receipt reported `normalizeTrustedOrigins` count | **3** |
| Publicly documented exact Origin | `http://127.0.0.1:8080` only |
| Public exact HTTPS Origin string | **not documented** (values never published) |
| Cutover text: “exact HTTP loopback URLs for live ports” (plural) | noted; third exact string **not** recoverable from public receipts without guessing |
| Staged candidate count | **2** = HTTPS(static domain) + `http://127.0.0.1:8080` |
| Third Origin identified by owner-controlled provenance this sprint | **false** |
| Invented / wildcard / Host-header origins added | **false** |

**Gate:** `UNRESOLVED_THIRD_ORIGIN` — count mismatch alone ≠ breach; missing attestation/waiver of the third exact Origin blocks live GO precheck.

## 4) Security-safe rollback vs legacy availability
| Check | Result |
| --- | --- |
| `assessSecureRollback` with proposed fallback `sha256:bfc92bd8…` (pre-RC1) | `LEGACY_AVAILABILITY_FALLBACK_INSECURE` (`securitySafe:false`) |
| Same contract with fallback = attested candidate `sha256:9b2ae98f11d8…` metadata match | `RC1_SECURITY_MATCH_PLAN_ONLY` (still `securitySafe:false`, `productionChangeAuthorized:false`) |
| Operator policy | **Fail closed:** do not auto-rollback to `bfc92bd8…` as confidentiality recovery; availability-only fallback must be explicitly labeled insecure if ever used |

Native: `rc1-secure-rollback-contract.test.cjs` **13/13**; wired into `./smart-build.sh test:unit`.

## Tests
| Suite | Result |
| --- | --- |
| Secure-rollback focused | 13/13 |
| Focused precheck bundle (p0 evidence + secure-rollback + CSRF) | 25/25 |
| `./smart-build.sh test:unit` | **exit 0** (includes secure-rollback) |

## Live runtime
IDs **unchanged**: proxy `4fe666ca8b69…`, api `12c4aeac7e02…`, ngrok `178b23cbdb9d…`.  
No compose up/down/restart; no owner `.env` edit; no secret disclosure; no ngrok/bridge/master merge.

## Remaining blockers (genuine)
1. **Staging `ADMIN_PASSWORD` must not be injected** into any live API recreate (origins-only env for live).
2. **Third trusted Origin** from prior count=3 must be owner-attested or explicitly waived before live GO.
3. **Separate explicit owner GO** for scoped proxy+API restoration (staging auth ≠ restoration GO).
4. **CTO `exactSourceDiffReviewed`** still open for the live package after credential/origin fixes.
5. Secure recovery path is **fail-closed / RC1 candidate re-restore**, not legacy `bfc92bd8…`.

## Verdict
`LIVE_GO_PRECHECK_BLOCKED` — do not authorize production restore on current staging env+overlay as-is.

**Specialists:** none.
