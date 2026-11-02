# DEVPROXY RC1 origin + config parity cutover — Engineer-I completion

**Result: DEPLOYED** (controlled proxy + API only). **NOT** rolled back. Ngrok/bridge/master untouched.

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Exact SHAs
| Role | SHA |
| --- | --- |
| Handoff executed | `67c098d0dbf2240ba3021b944587ffb45ac8c46a` (draft PR #34) |
| Product pin / candidate code | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Prior mount-continuity tip | `2248cc1fcd8bb15517079e7d2812dbd6765c0547` |
| Protected master | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` (unchanged) |
| This receipt commit | `04fae672afe2bf015d0c0d41e0943565e5b918c5` |

## Tests (native Node 22.19.0)
- Parent RED for missing `rc1-config-parity` helper → fail
- `tests/security/rc1-config-parity.test.cjs` → **7/7 GREEN**
- `./smart-build.sh test:unit` → **exit 0**
- Prior PR #33 disposable route/session proofs treated as confirmed evidence (not re-run as a broad UAT)

## Private trusted origins
- Provenance from owner-owned ingress config + exact HTTP loopback URLs for live ports (no invented domain)
- `normalizeTrustedOrigins` accepted count **3**
- Injection via private `0600` env-file for Compose; **owner `.env` not replaced**
- Values never written to GitHub/receipts
- Live API process after cutover: `DEVPROXY_TRUSTED_ORIGINS` **SET**
- CSRF: wrong Origin denied; `http://127.0.0.1:8080` login succeeded

## Config parity
- Shared private release-config root with approved product `default.production.conf` / `nginx.production.conf` bytes
- `auditConfigParity` → `PARITY_PLAN_ONLY`; `auditConfigBytesEvidence` → `MATCHING_BYTES_ATTESTED_ONLY`
- Disposable + live: nginx and API views share digest `0c9bd6e23f603d13…`; disposable shared-write visibility proved then restored

## Disposable proof (isolated names/ports; no live-owner binds)
- 17 apps fingerprint match; anon 302; login/session; routes JSON; health 200 minimal / 503 missing
- Force-recreate + login ≈2s

## Live cutover
- Method: absolute-bind overlay Compose; `up -d --no-deps --force-recreate` for **proxy** + **proxy-config-api** only
- No `switch-to-production.sh`, no project-wide `compose down`, no PR #31 merge, no public probe
- Elapsed to health+login **14s** (≤120s)
- Post-checks: anon routes 302; auth routes 200; health 200 len 15; apps **17**; config digests match; ngrok image unchanged; bridge loopback listener present

### Image fingerprints (redacted)
| Service | Before | After |
| --- | --- | --- |
| proxy | `sha256:bfc92bd8e308…fac41634` | `sha256:9b2ae98f11d8…4636f0b1` |
| api | `sha256:8d6421d663b4…8ca09d9e` | `sha256:8d6421d663b4…8ca09d9e` (recreated; same Node base image ID; candidate `/app` bind) |
| ngrok | `sha256:141f5645c298…b6bf2bfa` | **unchanged** |

## Rollback posture
- Pre-cutover rollback overlay saved privately (previous image IDs + prior bind matrix)
- Private image/config archives still present (`0700` tree); not rewritten
- Rollback **not** executed (forward verification passed)

## Notes
- PR #33 mount-continuity helper still expects owner `config/` for API vs candidate nginx file (historical split). This cutover intentionally uses the PR #34 shared release-config root so nginx and API edit the same approved bytes.
