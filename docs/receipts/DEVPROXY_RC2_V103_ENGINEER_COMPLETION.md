# DEVPROXY RC2 V103 — postcutover browser / privacy / cold-start — **SOURCE_PREPARED**

**Return label:** `SOURCE_PREPARED_V103_BROWSER_PRIVACY_COLDSTART`  
**Live apply:** **not** performed (no silent `.env` write, no API/proxy recreate)  
**Not:** second cutover · ngrok/bridge/credential/master mutation · stop host worker · live app heal

## Lifecycle
`STARTED` (#6670675494) → `IMPLEMENTING` (#6670757550) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v103-owner-browser-and-resilience-20261105@4c17a50dbf39e534e0be3b88b80f9dadc88b0e24` |
| Parent V101 RETURNED | `3fed6edfce0230e99bb164fdec3eec644346330c` (#6669927460) |
| Import | **only** 15 V103 paths from CTO tip (not #98/#101 histories, not V104) |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |

## BEFORE (preserved)
Live proxy `d5b71dc13699…` healthy; API `b93e19d7ea9d…` `504:20` RO; host worker PID **96350** + singleton; HMAC secret/spool OK; ngrok `178b23cb…` running; **17** apps; health 200; RestartPolicy=**no**; trusted origins = only two loopback HTTP entries.

## Evidence
### 1) Owner HTTPS browser origin (measured)
- Private parity helper → **`OWNER_HTTPS_BROWSER_ORIGIN_MISSING`**
- HTTPS `POST /admin/login` (negative password, matching Origin) → **403** (no Set-Cookie)
- Loopback matching Origin → **401** `Invalid password` (auth path OK)
- Loopback + remote HTTPS Origin → **403** `Origin denied`
- Disposable exact allowlist staged privately; **live `.env` not written**

### 2) Public health privacy (source)
- Wired minimal five-field + `no-store` in both `ai/health` branches
- Native assessor: source envelope **MINIMIZED**; **live** anonymous body still **LEAKAGE** (process not restarted) → `LIVE_APPLIED=false`

### 3) Cold-start (disposable Docker only)
- Corrected `proxy.depends_on=['proxy-config-api']`, `restart:unless-stopped`, acyclic
- Disposable up: **API Started before proxy**; nginx `-t` OK; upstream DNS + HTTP to API; uid `504:20`; **17** apps; restart recovery OK; live health 200 throughout; disposable torn down

### 4) Tests
- Native seven focused files: **93/93**
- `./smart-build.sh test:unit`: **exit 0**

### 5) realAppVerified advance (honest)
Bounded browser: loopback admin login UI; `/encast/` real app.  
HTTP classify 17: OK=6, AUTH=1, PATH_MISS=5, UPSTREAM_UNAVAIL=5.  
503s (wizardmaker/iwish/lyra/wayfind/trajectory) diagnosed as **missing/mismatched upstream containers**, not proxy crash (e.g. wizardmaker nginx → `wizardmaker-web:5173` while live container is `wizardmaker-ai-owner-web`).

## Origin-five AFTER
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** (dirty tree preserved; no git clean) |
| `sourceCurrent` | **PASS** (reviewed tip + dirty recoverable provenance; not formal clean) |
| `realAppVerified` | **PARTIAL** (bounded browser + classified 17; not full UAT / not all upstreams up) |

## ONE owner-only decision (live apply)
To make HTTPS browser login and privacy/`unless-stopped` **live**:
1. Append the exact private static HTTPS origin to `DEVPROXY_TRUSTED_ORIGINS` (keep both loopbacks; no wildcards), and  
2. Recreate **only** `proxy-config-api` (and optionally proxy) from the prepared Compose candidate so privacy source + restart policy load.

Not covered by prior Owner-A two-service cutover text alone → **deferred**; cite this exception. No password/ngrok/bridge/master change requested.

## Live after V103 work
Same container IDs; worker still serving; host worker/HMAC untouched; no live env mutation.
