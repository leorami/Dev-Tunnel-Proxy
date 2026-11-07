# DEVPROXY RC2 V119 — offline worker release-closure provenance — **RETURNED**

**Return label:** `WORKER_RELEASE_CLOSURE_SOURCE_READY`  
**Owner action gate this sprint:** `NONE` (source / tests / private disposable candidate only)  
**Future owner gate prepared (NOT executed):** narrowly scoped durable **worker product-source** cutover using the pinned 12-module closure  
**Live worker stop/sync · LaunchAgent · Docker/ngrok/HMAC/proxy mutation · master merge · reused V115 recovery:** **NOT AUTHORIZED / NOT EXECUTED**  
**Specialists:** `NOT_SPAWNED`  
**Tracking:** [#121](https://github.com/leorami/Dev-Tunnel-Proxy/issues/121) remains OPEN until authorized cutover; [#116](https://github.com/leorami/Dev-Tunnel-Proxy/issues/116); [#109](https://github.com/leorami/Dev-Tunnel-Proxy/issues/109)

## Lifecycle
`STARTED` (#6713087188) → `VERIFYING` → `RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Handoff | `cto/devproxy-rc2-v119-worker-release-closure-20261107@09fe7f78b95f8ba5c280356536c4e2255b0c0804` |
| Parent V118 RETURNED | `20427efaf372d19f341d39c84e21139e9413a907` (#6699650892) |
| Reviewed closure commit | `20427efaf372d19f341d39c84e21139e9413a907` |
| Changed-path count | **7** (4 imports + unit hook + 2 receipts) |

## Source delta (actual)
1. `utils/rc2-worker-release-closure.cjs`
2. `tests/security/rc2-worker-release-closure.test.cjs`
3. `docs/architecture/DEVPROXY_RC2_V119_WORKER_RELEASE_CLOSURE.md`
4. `docs/handoffs/DEVPROXY_RC2_V119_WORKER_RELEASE_CLOSURE_OFFLINE.md`
5. `smart-build.sh` (narrow unit hook only)
6. `docs/receipts/DEVPROXY_RC2_V119_ENGINEER_COMPLETION.md`
7. `docs/receipts/DEVPROXY_RC2_V119_RUNTIME.json`

No V118 evidence overwrite. Governance PR #123 untouched. Live durable product untouched.

## Native verification
| Gate | Result |
| --- | --- |
| Node | **v22.19.0** |
| Focused `rc2-worker-release-closure` | **10/10 PASS** |
| `node --check utils/rc2-worker-release-closure.cjs` | **OK** |
| `./smart-build.sh test:unit` | **exit 0** (new hook executed) |

## Independent 12-file `require()` closure (V118 tip bytes)
Entrypoint `scripts/rc2-supervised-mac-host-worker.cjs` resolves to exactly **12** local modules; **0** missing/extra vs pin; **0** dynamic `require`/`import()`; all non-local imports are `node:` built-ins; each pinned Git blob matches the Engineer tree byte-for-byte.

| Path | Git blob |
| --- | --- |
| `scripts/rc2-supervised-mac-host-worker.cjs` | `fefb1f52830cfb52f6836bb8d4875dfbc87e2193` |
| `utils/rc2-private-host-worker-pin.cjs` | `7638d841ca773e639ef19105cf112621f477dfa3` |
| `utils/rc2-exclusive-host-worker-service.cjs` | `0970e79c87f3aae267abcfcaf3a71371cff9a10c` |
| `utils/rc2-pending-host-worker.cjs` | `6a084d5f697e999219de5bd078032cbe8fde1536` |
| `utils/rc2-mac-host-worker.cjs` | `b2d51f9fd76e0df9d0ca9a7cc96188e94cedae9f` |
| `utils/rc2-cross-process-settlement.cjs` | `280132577d9ac28e7abb269c5279dc3d3c005bd7` |
| `utils/rc1-host-mount-locked-docker-driver.cjs` | `81f355438fd83702d75cc22e7dc864e72af183bd` |
| `utils/rc1-route-candidate-manifest.cjs` | `ee8318c2f86a3db5158916c29b9317f88c196e1a` |
| `utils/rc1-content-bound-activation-request.cjs` | `d032a3ca9f8590321ef15ef992b0374b2c9c04fe` |
| `utils/rc1-activation-spool.cjs` | `c8b52ac9bda93cbef5fa2fb667e13d48f876be17` |
| `utils/rc1-two-phase-host-settlement.cjs` | `453c821489e188c9a4d9b601b8b606cfeb7e0e6b` |
| `utils/host-execfile-adapter.cjs` | `6ac7f96934fd0cc89c3bc03eaf424b741cc609a4` |

## Offline disposable candidate (test-owned; cleaned)
Byte-exact copy of the twelve modules only; **no** pin/HMAC/route/env/app/private artifacts; outside live durable stage; **no** second worker/Docker/app runtime.

| Scenario | Code |
| --- | --- |
| Positive | `REVIEWED_WORKER_CLOSURE_MATCH_SOURCE_ONLY` |
| One mutated dependency | `REVIEWED_WORKER_CLOSURE_MISMATCH` |
| Symlink / hardlink | `WORKER_CLOSURE_UNSAFE` |
| Nonsticky writable ancestor | `WORKER_CLOSURE_UNSAFE` |
| Test-only manifest | `TEST_ONLY_WORKER_CLOSURE_MATCH` (not approval) |
| Wrong reviewed commit | `WORKER_CLOSURE_UNVERIFIED` |

Every outcome keeps `runningProcessAttested:false` and `productionChangeAuthorized:false`. A MATCH is **disk candidate only**, not the running Mac process.

## Fresh read-only Mac reobserve (distinct from historical V118 receipt text)
| Item | Result |
| --- | --- |
| `--serve` | **1**; cwd == approvedRoot |
| Pin / lock | **0o600** / **0o600** |
| Spool tickets | **0** |
| Proxy / API / ngrok | unchanged `3506d7fe0b81` / `c2e669397470` / `178b23cbdb9d` |
| `/health.json` | **200** `ok` |
| Durable pending vs reviewed V114 blob | still **`MISMATCH`** (marker absent) |
| LaunchAgents | **0** |

## Future owner gate (decision-ready; NOT executed)
Authorize **one** narrowly scoped durable worker **product-source cutover** that installs the versioned **12-module** reviewed closure from commit `20427efaf372d19f341d39c84e21139e9413a907`, with clean single-process stop, fail-closed lock/replay quarantine, private rollback, HMAC epoch/pin continuity, signed `CONFIG_SET_DIGEST_MISMATCH` nonfatal proof on the new process, and optional separately scoped LaunchAgent only after external reviewed digests. **Excluded:** reused V115 recovery; Docker/ngrok/proxy recreate; master merge; owner-app heal; `KeepAlive:true`; auto lock-clear.

## Origin-five
| Field | Result |
| --- | --- |
| `singleRuntime` | **PASS** |
| `noShadowApps` | **PASS** |
| `ownerWorkPreserved` | **PASS** |
| `sourceCurrent` | **PASS** |
| `realAppVerified` | **PARTIAL** |

## RETURNED
Source-readiness complete. Live worker and production IDs preserved. Offline MATCH ≠ running-process trust. One coherent future owner cutover decision is ready; no serial hardening invented. Owner UAT remains independent.
