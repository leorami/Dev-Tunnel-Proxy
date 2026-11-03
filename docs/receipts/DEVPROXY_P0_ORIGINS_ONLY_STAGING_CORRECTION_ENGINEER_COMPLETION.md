# DEVPROXY P0 origins-only staging correction — Engineer-I completion

**Return label:** `OWNER_DECISION_REQUIRED` / `PLAN_ONLY` / `NOT_DEPLOYED` / `RUNTIME_STILL_DRIFTED`  
**Cleared prior live-precheck gates:** synthetic admin injection; unresolved third Origin  
**Not:** LIVE GO / DEPLOYED / productionChangeAuthorized

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins / authority
- Continued from `engineer/devproxy-p0-private-origin-provenance-20261102@d9c8a3d8f6e7befc4c0f2feb2454839e3d32d296`
- CTO review PR #44 comment `6595578514`
- Owner staging authorization Issue #10 `6595352764` (still staging-only; **not** live restoration GO)
- Tip after this receipt: draft PR #44 head (full 40-SHA below / after push)

## 1) Origins-only private staging
| Check | Result |
| --- | --- |
| New private file created | **YES** (`trusted-origins.origins-only.env`) |
| Parent / file modes | `0700` / `0600` |
| Keys | **only** `DEVPROXY_TRUSTED_ORIGINS` |
| Synthetic `ADMIN_PASSWORD` present | **false** |
| Owner `.env` modified | **no** |
| Mounted into live containers | **false** |

## 2) Exact Compose dry-run (resolved)
| Check | Result |
| --- | --- |
| `docker compose … config --quiet` | exit **0** |
| Resolved API env contains `ADMIN_PASSWORD` | **false** |
| Resolved API `DEVPROXY_TRUSTED_ORIGINS` | **present**, count **3** |
| Candidate `/app` | **RO** |
| Owner `.env` → `/app/.env` | **RO bind** (password source mapping) |
| Owner `.artifacts` on proxy + API | present; API RW (session file path) |
| Session file `.artifacts/admin-session.json` | exists; mode `0600`; not symlink |
| Shared nginx↔API default.conf | same source; digest `0c9bd6e23f603d13…` |
| API 3001/3002 | **loopback** |
| Product `ensureAdminPassword` if RO chmod throws | already set `process.env` from owner `.env` before chmod; catch returns that value (not a new random) — credential continuity preserved |

CTO session nuance acknowledged: bearer sessions validate independently of `ADMIN_PASSWORD`; this correction still preserves both owner password source **and** session-file mounts.

## 3) Origins 3 vs 2 — third recovered, not invented
Prior successful RC1 cutover provenance constructed exactly:
1. `https://` + owner `NGROK_STATIC_DOMAIN` (live ngrok env matches)
2. `http://127.0.0.1:8080`
3. `http://localhost:8080` — **exact loopback pair for live port 8080** from the prior approved cutover provenance script (not Host-header inference; not guessed domain)

`normalizeTrustedOrigins` accepted count **3**; CSRF evil denied; https + both loopbacks allowed.  
**Removal of #3 cannot be justified** against the last successful cutover allowlist; it is restored in the origins-only staging file.

## 4) Secure rollback contract preserved
- `assessSecureRollback(bfc92bd8…)` → `LEGACY_AVAILABILITY_FALLBACK_INSECURE`
- Still **not** a confidentiality-safe fallback
- Native secure-rollback suite remains in `test:unit`

## Tests
| Suite | Result |
| --- | --- |
| Focused (secure-rollback + p0 evidence + trusted-origin CSRF/compose-gate + security-release-integration) | **33/33** |
| `./smart-build.sh test:unit` | **exit 0** |

## Evidence
```
evaluateP0RestorationEvidence → OWNER_DECISION_REQUIRED
  blockers=[]
  productionChangeAuthorized=false deployed=false performedActions=false
```

## Live IDs unchanged
proxy `4fe666ca8b69…`, api `12c4aeac7e02…`, ngrok `178b23cbdb9d…`  
Live API trusted origins / admin env still **UNSET** (no injection).

## Remaining before live restoration
1. **Separate explicit owner GO** for scoped proxy+API recreate (staging auth ≠ restoration GO)
2. **CTO independent source/diff review** of this correction package
3. Operator must use **origins-only** staging file + owner `.env` RO bind (never the prior synthetic-password staging file)

**Forbidden actions not done:** production deploy/restart, credential rotation, session invalidation, ngrok/bridge changes, protected merge, secret disclosure.

**Specialists:** none.
