# DEVPROXY RC2 V105 — supervisor-only worker + private release preflight — **RETURNED**

**Return label:** `SUPERVISOR_ONLY_WORKER_CLOSED_SOURCE_PREPARED`  
**Live apply:** **not** performed  
**Not:** cutover · worker restart/rekey · ngrok/bridge/master/credential change · live `.env` write · false UAT/Origin PASS

## Lifecycle
`STARTED` (#6672290541) → `IMPLEMENTING` → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v105-host-worker-entrypoint-closure-20261105@04709d1fa1d1d139ff9d0c916079bfade772d08a` |
| Parent V103 RETURNED | `962bbd73bb3416155d3964ded64194d584d109a8` (#6670773774) |
| Import | **only** 5 V105 paths (not V104 history wholesale) |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |

## Source change
`utils/rc2-mac-host-worker.cjs`: direct CLI/`main()` fails closed `HOST_WORKER_SUPERVISOR_REQUIRED` before pin/spool; weak `loadPrivatePin` removed; `createMacHostSettlementWorkerFromPin` retained for `scripts/rc2-supervised-mac-host-worker.cjs`.  
Tests: `rc2-supervisor-only-direct-cli-guard.test.cjs` + smart-build hook for four supervisor suites.  
Canon: `docs/architecture/DEVPROXY_RC2_V105_SUPERVISED_ONLY_WORKER_CANON.md`.

## Native verification
| Gate | Result |
| --- | --- |
| Direct CLI + fake pin | exit **2**, stderr `HOST_WORKER_SUPERVISOR_REQUIRED`, **no path/secret echo**, live spool file count unchanged |
| Four focused suites | **53/53** |
| `./smart-build.sh test:unit` | **exit 0** |
| Supervised constructor + pin load | still works; `loadPrivatePin` **not** exported |

## Live read-only (unchanged)
| Item | Evidence |
| --- | --- |
| Proxy | `d5b71dc13699…` / `sha256:9b2ae98f…` healthy; RestartPolicy=**no** |
| API | `b93e19d7ea9d…` `504:20` RO; RestartPolicy=**no** |
| Worker | supervised `--serve` PID **96350**; singleton lock present; **no** direct CLI process |
| Pin↔live | container ID + image match |
| Routes | **17** apps; health **200** |
| Actions | **no** restart, rekey, lease clear, scan, or forged ACK |

## Private release preflight (V103 residual — singular owner decision)
| Residual | Private evidence | Live mutation |
| --- | --- | --- |
| HTTPS origin missing | parity `OWNER_HTTPS_BROWSER_ORIGIN_MISSING`; disposable allowlist staged | **not written** |
| Anon health leak | live `PUBLIC_CALLIOPE_HEALTH_LEAKAGE`; source `MINIMIZED` | API not restarted |
| RestartPolicy=no | source `unless-stopped` + API-before-proxy | containers not recreated |

**Impact recommendation (decision-ready, not executed):**  
1. **Primary (API-only):** append exact private HTTPS origin to `DEVPROXY_TRUSTED_ORIGINS` (keep both loopbacks) + recreate/restart **API only** → fixes HTTPS login + loads privacy source; worker pin remains valid.  
2. **Optional second:** recreate **proxy** (and API if needed) to apply `unless-stopped` / compose depends_on — only if owner wants cold-start policy now; would require pin identity check if proxy ID changes.

No duplicate Owner-A prompt. No new mandatory sprint before that live decision.

## Origin-five (honest)
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** (as measured at V103; dirty recoverable tip) |
| `realAppVerified` | **PARTIAL** (unchanged unresolved upstreams/auth) |

## RETURNED
**`SUPERVISOR_ONLY_WORKER_CLOSED_SOURCE_PREPARED`.** Legacy unsupervised Mac-worker CLI closed in source; live supervised worker undisturbed. Singular outstanding owner-only live decision remains the V103 HTTPS+API privacy apply (optional proxy recreate for restart policy).
