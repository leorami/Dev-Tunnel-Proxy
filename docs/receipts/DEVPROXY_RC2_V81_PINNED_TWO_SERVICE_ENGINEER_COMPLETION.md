# DEVPROXY RC2 V81 pinned two-service candidate — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** live proxy/API cutover · ngrok/bridge change · credential rotation · protected master merge · insecure rollback

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Parent Engineer return | PR #79 @ `660fab4366f7b4c8f8a3c523187202347c1f41dd` |
| CTO V81 source (merged, not rewritten) | `cto/devproxy-rc2-legacy-docker-lockdown-20261104@03c78109f1645fafcb30b72277ef06170f3dec0c` |
| Handoff | `docs/handoffs/DEVPROXY_RC2_V81_PINNED_TWO_SERVICE_RELEASE_CANDIDATE.md` |
| PR #76 / v13 settlement | preserved `8859fca…` / blob `453c821…` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This tip | see commit SHA after push |

## STARTED
Fresh lifecycle check: master `62a4d7b…`; PR #79 RETURNED NO-GO at `660fab4…` continued as sole primary. Merged CTO `03c7810…` into assignment (ort merge). Live secure RC1 IDs unchanged throughout.

## IMPLEMENTING
### CTO modules reused
- `utils/rc2-production-compose-candidate.cjs`
- `scripts/rc2-render-private-compose-candidate.cjs`
- Extended `utils/rc2-readonly-production-preflight.cjs` (paired spool RW + secret RO)
- Tests: compose candidate, renderer, compose-preflight; docs/handoff

### Owner-private stage (contents not published)
- Stage dir mode **0700**; pins + secret **0600**; spool tree provisioned
- Render: `RC2_PRIVATE_CANDIDATE_RENDERED / NOT_DEPLOYED`
- `docker compose -f <PRIVATE>/rc2-compose-candidate.json config --quiet` → **OK**
- Candidate summary (no private paths): two services only; proxy `rc1cutoverdisp-proxy@sha256:9b2ae98f…`; API `node@sha256:8d6421d6…`; API user `504:20`; `read_only:true`; loopback ports; **no docker.sock**

### Disposable verification (torn down; not live cutover)
| Check | Result |
| --- | --- |
| API uid 504 nested mounts | `/app` EROFS; apps/overrides/sites/artifacts writable; secret+spool OK; no sock |
| Session bytes readable under nested `.artifacts` | **yes** (`wc` 2416); `test -r` flaky under virtiofs ownership display |
| nginx `-T` on pinned image + candidate mounts | **syntax ok / test successful**; mime.types + brotli load present; 4 config sections |
| Cross-process settlement on stage spool | SUCCESS with **fixture** host callbacks only |
| Mac host worker on disposable proxy | `attest:true`, `nginx-test:0`; probe container **removed**; live proxy untouched |
| Persistent host worker installed for live | **no** |

## VERIFYING
| Suite | Result |
| --- | --- |
| V81 + management focused | **107/107** PASS |
| `./smart-build.sh test:unit` | **exit 0** |

### Live BEFORE (preserved)
| Item | Value |
| --- | --- |
| Proxy | `1932725ad746d70490ba62ace980a70c872a9b5ac6bfad76b5d5be955fa0bd28` |
| API | `51bbafd0cf14190d22cc29e994ad063ba09e16105ea818de2db5bf91318303e7` |
| Ngrok | `178b23cbdb9d…` |
| Routes / session / health | **17** / **0600** / **200** |

## Exact NO-GO (pre-cutover)
1. **`LIVE_HOST_WORKER_NOT_INSTALLED`** — disposable attest/nginx-test proved the adapter; no reviewed, least-privilege **live** worker install/activation against production IDs.
2. **`ORIGIN_FIVE_UNKNOWN`** — all five Origin runtime fields remain UNKNOWN ≠ PASS.
3. **`AI_HEAL_SCOPE_DEGRADED`** — unsettled `/ai/*` + `apps/scan` remain intentional 503; not feature-parity PASS.
4. **`LIVE_AFTER_PREFLIGHT_NOT_RUN`** — AFTER-state paired spool/secret preflight cannot PASS before a live two-service replace; cutover withheld.

Owner GO was **not** exercised. No production mutation.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.**

**Specialists:** none. **Ngrok/bridge/credentials/master:** untouched.
