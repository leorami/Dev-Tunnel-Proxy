# DEVPROXY RC2 V101 — live fixed-action host worker **COMPLETED**

**Return label:** `DEPLOYED_WITH_HOST_WORKER_COMPLETED`  
**Not:** second proxy/API cutover · ngrok/bridge/credential change · master merge · live app heal without per-edit owner review · external AI / docker.sock

## Lifecycle
`STARTED` (#6669722539) → `IMPLEMENTING` (#6669845035) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v101-live-heal-closure-20261105@cb0f708777d1701653e432a5f36055a3180da9e4` |
| Deployed base (unchanged containers) | `engineer/devproxy-rc2-controlled-release-20261104@4e4a0a267964192e89adbb06f6287293840019ea` |
| Owner A | already settled (#6669428522 / #6669437050); not re-asked |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| V100 reviewer source | **not imported** |

## BEFORE (read-only)
| Item | Evidence |
| --- | --- |
| Proxy | `d5b71dc13699…` / `sha256:9b2ae98f…` healthy; RestartPolicy=no |
| API | `b93e19d7ea9d…` user `504:20` read-only rootfs |
| Spool/secret | existing cutover stage mounted; API-owned spool `0700`; secret readable |
| Host worker | **no process**; lease empty |
| Routes | **17** `apps/*.conf`; `apps.generated.conf` sha `d1e36aaf…`; `nginx -t` ok |
| Ngrok | `178b23cb…` running (post–Owner-A restart; not changed by V101) |
| Trusted origins | exactly `http://127.0.0.1:8080`, `http://localhost:8080` (unique) |
| Dirty owner tree | still dirty (7 modified + `.cursor/` + `private-rollbacks/`); not cleaned |

## Binding fix (not a redeploy)
Cutover `worker.pin.json` already pinned the **correct** live proxy ID/image/mounts and shared HMAC secret/spool.  
`approvedRoot` incorrectly equaled the private stage (overlaps spool/secret → `HOST_PIN_UNSAFE`).

- Corrected `approvedRoot` to the engineer tip worktree (API `/app` source root).
- Seeded host-visible `build/sites-enabled/apps.generated.conf` so host candidate digest matches API `/app` (`abcb9184…`).
- **No** activation secret re-key, **no** API/proxy recreate, **no** ngrok/bridge/credential/master mutation.

## IMPLEMENTING
1. Exclusive supervised `scripts/rc2-supervised-mac-host-worker.cjs --serve` under Mac owner UID; singleton lock present; second invocation → `HOST_WORKER_ALREADY_ACTIVE`.
2. Live API → private spool → Mac worker → HMAC ACK: **`RELOAD_AND_VERIFICATION_REPORTED`** (~1165 ms); `productionChangeAuthorized:false`; `liveAttested:false`; nginx `-T` digest unchanged; conf bytes unchanged.
3. RED: wrong bundle → `CONFIG_SET_DIGEST_MISMATCH`; wrong proxy id driver.attest → `false`.
4. Focused security tests **71/71**; `./smart-build.sh test:unit` **exit 0**.
5. Disposable taught-lesson reuse heal: admit → apply → nginx -t true; replay denied (`healApplyRuntimeProved:true`).
6. Live nonmutating smoke: login 200; Ask `local_reviewed_heal_explain` 200; propose `NOT_AVAILABLE` / `healingPerformed:false`; bad ticket apply **403**; `liveAppHealApplied:false`.

## Origin-five AFTER (honest)
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PARTIAL** (engineer tip mounted; dirty recoverability preserved; not formal clean Git) |
| `realAppVerified` | **PARTIAL** (bounded real HTTP: calliope 401, encast 200, tigerslam 307; not full browser UAT) |

## Residuals (honest)
1. Host candidate seed for `apps.generated.conf` must stay byte-aligned with live `/app` after any future route edit before another settlement — not a silent claim that hybrid mount trees are one path.
2. Proxy `RestartPolicy=no`; cold start still wants API-before-proxy.
3. Owner UAT / per-edit live heal review still required for `liveAppHealApplied`.
4. Prior Owner-A ngrok restart + trusted-origins append remain documented; V101 did not undo or repeat them.

## RETURNED
**`DEPLOYED_WITH_HOST_WORKER_COMPLETED`.** Live supervised host worker installed and HMAC settlement proved. No second cutover. Specialists: none.
