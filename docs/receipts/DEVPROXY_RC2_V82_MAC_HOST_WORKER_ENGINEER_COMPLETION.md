# DEVPROXY RC2 V82 Mac host worker + nginx provenance — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** live proxy/API cutover · ngrok/bridge change · credential rotation · protected master merge · insecure rollback

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Parent Engineer return | PR #79 @ `7ca399a782488d0c2a25274df4aaf7759d24db74` |
| CTO V82 source (merged, not rewritten) | `cto/devproxy-rc2-v82-host-worker-operational-20261104@cc882ef7928e481a07fc1e52537b6d3ef2496a98` |
| Handoff | `docs/handoffs/DEVPROXY_RC2_V82_MAC_HOST_WORKER_AND_IMAGE_PROVENANCE.md` |
| PR #76 / v13 settlement | preserved |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This tip | *(filled at commit)* |

## STARTED
Fresh lifecycle: master `62a4d7b…`; sole active primary PR #79 at `7ca399a…` (`NO-GO` receipt `6639554257`). CTO PR #81 tip `cc882ef…` imported by merge onto assignment. Live secure RC1 IDs unchanged throughout. No other engineer launched.

## IMPLEMENTING
### CTO modules reused (not reimplemented)
- `utils/rc2-private-host-worker-pin.cjs`
- `utils/rc2-pending-host-worker.cjs`
- `utils/rc2-exclusive-host-worker-service.cjs`
- `scripts/rc2-supervised-mac-host-worker.cjs`
- `utils/rc2-nginx-image-provenance.cjs`
- Five v82 test suites (canonical local green)

### Engineer Mac corrective code (this tip)
Docker Desktop virtiofs required three additive hardening fixes for real host↔container settlement:
1. `utils/rc1-activation-spool.cjs` + `utils/rc2-cross-process-settlement.cjs` — bind inode/mtime/size; ignore ctime-only metadata bumps; keep polling prepared on transient `UNSAFE_SPOOL_MESSAGE`.
2. `utils/rc2-mac-host-worker.cjs` — `ackTimeoutMs:20000` inside API deadline.
3. **Operational mount rule (evidence):** spool bind-mount *root* appears as uid `0` inside the API container → `privateDir` rejects immediately. Spool must be a **subdirectory created by container UID 504:20** on a parent stage mount (not the mount root itself).

### Owner-private disposable stage (paths redacted)
- Pin/secret **0600**; spool/lease **0700**; API user **504:20**; **no docker.sock**
- Disposable proxy `d61c844b801d…` image `sha256:9b2ae98f…` (same digest family as live)
- Supervised host `--serve` + in-container activation over shared HMAC spool

### Disposable two-process settlement (REAL, not fixture)
| Step | Result |
| --- | --- |
| Request → prepare → API ACK → final | **`RELOAD_AND_VERIFICATION_REPORTED`** |
| Spool counts | requests=1 prepared=1 acks=1 responses=1 |
| Host serve | `HOST_WORKER_STOPPED_CLEANLY` count=1 |
| productionChangeAuthorized / liveAttested | **false / false** |
| Live proxy ID after proof | still `1932725ad746…` health **200** |

Manual disposable quarantine clear after first ACK-timeout (uid-0 prepared dir) documented under private stage pins; not auto-cleared by product code.

### nginx provenance (disposable)
`NGINX_PROVENANCE_EVIDENCE_ONLY` — dump SHA matched pin; 4 config files + 3 image file digests (mime + brotli modules). `originFiveVerified:false`.

## VERIFYING
| Suite | Result |
| --- | --- |
| v82 focused (pin/pending/exclusive/supervised/settlement/provenance) | **80/80** PASS |
| Prior v81/unit suites on tip | retained green from parent return |

### Live BEFORE (preserved — no cutover)
| Item | Value |
| --- | --- |
| Proxy | `1932725ad746d70490ba62ace980a70c872a9b5ac6bfad76b5d5be955fa0bd28` / `sha256:9b2ae98f…` |
| API | `51bbafd0cf14190d22cc29e994ad063ba09e16105ea818de2db5bf91318303e7` user **root** |
| Session | `.artifacts/admin-session.json` mode **0600** |
| Health | **200** |
| Ngrok / bridge | untouched |

### Origin five (runtime)
All fields remain **UNKNOWN / not verified** (`originFiveVerified:false` on provenance inspect). UNKNOWN ≠ PASS.

## Exact NO-GO (pre-cutover)
1. **`LIVE_HOST_WORKER_NOT_INSTALLED`** — disposable supervised `--serve` + fixed-action settlement proved; no reviewed live install against production container IDs/pins.
2. **`ORIGIN_FIVE_UNKNOWN`** — five Origin runtime fields not PASS.
3. **`AI_HEAL_SCOPE_DEGRADED`** — legacy AI/heal parity still not verified PASS on live management surface.
4. **`LIVE_AFTER_PREFLIGHT_NOT_RUN`** — production API still root / pre-RC2 mounts; AFTER paired spool+secret preflight cannot PASS without the withheld cutover.
5. **`COMPOSE_SPOOL_MOUNT_UID_RULE`** — production candidate must mount a parent and let API UID create the spool subdirectory (corrective for Docker Desktop uid-0 mount roots).

Owner GO for cutover was **not** exercised. Disposables torn down. No production mutation. Never rolled back to a less secure image.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.**

**Specialists:** none. **Ngrok/bridge/credentials/master:** untouched.
