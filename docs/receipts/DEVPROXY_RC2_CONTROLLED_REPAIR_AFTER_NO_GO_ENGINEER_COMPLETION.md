# DEVPROXY RC2 controlled repair after NO-GO — **NO-GO**

**Return label:** `NO-GO_REPAIR_CANDIDATE_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** live proxy/API recreate · ngrok/bridge change · credential rotation · protected master merge · insecure rollback

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Parent Engineer return | PR #79 @ `7e1329cc6d0456758bb54dda7c2404cbfa50ee98` (preserved) |
| CTO lockdown source (integrated, not recreated) | `cto/devproxy-rc2-legacy-docker-lockdown-20261104@dbd2fb62b2b66a05c04211d7bfab4a3f5afb30df` |
| Handoff | `docs/handoffs/DEVPROXY_RC2_CONTROLLED_REPAIR_AFTER_NO_GO.md` |
| Engineer-I PR #76 | preserved `8859fca6af37f4b4796ff556e09d616975af5b8b` |
| v13 settlement blob | unchanged `453c821489e188c9a4d9b601b8b606cfeb7e0e6b` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This tip | see commit SHA after push |

## STARTED
Rechecked lifecycle: master `62a4d7b…`; PR #79 active RC2 assignment; PR #80 CTO lockdown draft at `dbd2fb6…`. Fast-forwarded assignment onto CTO tip (additive). Did **not** re-score live BEFORE containers with an AFTER-state preflight pin as the sole stop condition.

## IMPLEMENTING
### CTO source integrated (exact)
- `utils/rc2-inline-docker-policy.cjs` — eliminates env opt-out when spool/production/deny
- `utils/rc2-management-safety-policy.cjs` — post-auth legacy mutation gate
- `tests/security/rc2-management-safety-policy.test.cjs` (52)
- Wired `calliopeHealing.js` + `proxyConfigAPI.js`
- Architecture + handoff docs

### Functional-gap repair (transactional restore)
- Confirmed `apps/install` / `apps/create-route` already call `production-route-mutation` + activation.
- Removed those paths from `UNSAFE_POST`; retained block on `apps/scan` and unsettled `/ai/*` heal/docker routes.
- Tests updated: transactional install/create-route **retained**; AI/scan still **denied**.

### BEFORE inventory (live RC1 — unrepaired; not an AFTER pin)
| Item | Observed |
| --- | --- |
| Proxy ID | `1932725ad746d70490ba62ace980a70c872a9b5ac6bfad76b5d5be955fa0bd28` |
| API ID | `51bbafd0cf14190d22cc29e994ad063ba09e16105ea818de2db5bf91318303e7` |
| Ngrok ID | `178b23cbdb9d8aaf447d4f9bb8613393e32054733ed0ecb63d075bafe20d17f9` |
| Proxy image | `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1` |
| API user | **root** |
| API `/app` | **RW** |
| API apps/sites/overrides | apps+sites **RO** in inspect; overrides **missing** |
| Proxy host ports | `0.0.0.0:8080` / `0.0.0.0:443` (ngrok uses `dev-proxy:80` on network) |
| docker.sock | **absent** |
| Routes / session / health | **17** / **0600** / **200** |
| Spool / host worker live | **absent** |

Repair work items (not “preflight already failed forever”): remount `/app:ro` + four RW data binds; non-root API UID; loopback proxy publish; install host worker + spool; attest mime/brotli/includes; Origin five.

### Private AFTER candidate (dry-run only; paths not committed)
- Private stage under `/private/tmp/devproxy-rc2-repair-candidate-20261104` (secrets local-only).
- `docker compose … config --quiet` → **OK**
- Disposable alpine nested-mount probe uid `504:20`: `/app` EROFS; apps/overrides/sites/artifacts writable; `.env` readable; no docker.sock.
- Read-only recovery plan file written privately (image/IDs/route count only).
- **Not** applied to live Docker.

## VERIFYING
| Suite | Result |
| --- | --- |
| `rc2-management-safety-policy.test.cjs` | **52/52** |
| Focused rc2 suites (policy+preflight+settlement) | **73/73** |
| `./smart-build.sh test:unit` | **exit 0** |

## Exact NO-GO (failed/UNKNOWN gates before live mutation)
1. **`HOST_WORKER_NOT_INSTALLED`** — no reviewed Mac host worker pin/ACL/activation proof on the owner Mac.
2. **`SPOOL_NOT_LIVE_MOUNTED`** — activation spool/secret not provisioned into running API.
3. **`ORIGIN_FIVE_UNKNOWN`** — all five Origin runtime fields remain UNKNOWN ≠ PASS.
4. **`NGINX_MODULE_MIME_PROVENANCE_INCOMPLETE`** — mime.types / Brotli modules / full include closure not independently bind-attested for the candidate.
5. **`AI_HEAL_SCOPE_DEGRADED`** — unsettled `/ai/*` docker/heal endpoints intentionally `503 LEGACY_UNSETTLED_MANAGEMENT_BLOCKED` until transactional rewrites exist (documented limitation, not feature parity PASS).

Because these gates are not independently GREEN, the fresh owner GO was **not** exercised. Live IDs unchanged.

## RETURNED
**`NO-GO_REPAIR_CANDIDATE_GATES_INCOMPLETE` / `NOT_DEPLOYED`.**

**Specialists:** none. **Production mutate:** none. **Ngrok/bridge/credentials/master:** untouched.
