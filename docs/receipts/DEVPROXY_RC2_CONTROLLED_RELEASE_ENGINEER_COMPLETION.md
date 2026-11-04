# DEVPROXY RC2 controlled production release — **NO-GO**

**Return label:** `NO-GO_READ_ONLY_PREFLIGHT_BLOCKED` / `NOT_DEPLOYED`  
**Not:** production recreate · proxy/API mutation · ngrok/bridge change · credential rotation · protected master merge · insecure image rollback

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Primary Engineer-I baseline (preserved) | `engineer/devproxy-p0-v13-durable-final-record-nonlive-20261104@8859fca6af37f4b4796ff556e09d616975af5b8b` (PR #76) |
| CTO RC2 contract | `cto/devproxy-p0-rc2-authorized-candidate-20261104@ba36740c5be2430c0ffa40884087ff54cd52fd10` / `docs/handoffs/DEVPROXY_RC2_AUTHORIZED_CONTROLLED_RELEASE.md` |
| v13 settlement blob (unchanged) | `453c821489e188c9a4d9b601b8b606cfeb7e0e6b` |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| Fresh owner production approval | 2026-11-04 project chat (RC2; not reuse of RC1 GO) |
| This receipt branch | `engineer/devproxy-rc2-controlled-release-20261104` (see tip SHA after push) |

## STARTED
Rechecked GitHub lifecycle: master `62a4d7b…`; PR #76 RETURNED at exact pin; PR #77 draft CTO tip; no other executing engineer release. Preserved PR #76 smoke test + completion receipt. Imported additive CTO RC2 preflight/tests/docs only (settlement not overwritten).

## IMPLEMENTING (source only; no live mutation)
### Additive import from CTO tip
- `utils/rc2-readonly-production-preflight.cjs`
- `tests/security/rc2-readonly-production-preflight.test.cjs`
- `tests/security/rc1-v13-durable-final-receipt.test.cjs`
- `tests/helpers/rc1-v13-kill-before-reply.cjs`
- `docs/architecture/DEVPROXY_P0_V13_DURABLE_FINAL_RECEIPT_RECOVERY.md`
- `docs/handoffs/DEVPROXY_RC2_AUTHORIZED_CONTROLLED_RELEASE.md`

### API↔host integration (real protocol; not fake Docker adapter)
- `utils/rc2-cross-process-settlement.cjs` — host waits for **API-authored** ACK; forbids in-process forged ACK
- `utils/rc2-mac-host-worker.cjs` — explicit Mac host worker entry (private pin file; fixed nginx-test/reload only)
- `utils/proxyConfigAPI.js` — prefers `DEVPROXY_ACTIVATION_SPOOL_DIR` + secret file → cross-process settlement activation; `allowConfigEdit:false`
- `utils/calliopeHealing.js` — `BLOCKED_INLINE_DOCKER` when spool activation env is set
- `tests/security/rc2-cross-process-settlement.test.cjs` — 4/4 PASS

**Not claimed:** live host-worker install, private pin provisioning, disposable or production cutover, Origin-five PASS, or runtime trust from fixtures.

## VERIFYING
### Tests
| Suite | Result |
| --- | --- |
| `rc2-cross-process-settlement.test.cjs` | **4/4** PASS |
| `rc2-readonly-production-preflight.test.cjs` | **13/13** PASS |
| `rc1-v13-durable-final-receipt.test.cjs` + smoke | **18/18** PASS |
| PR #76 v13 settlement blob | unchanged `453c821…` |

### Live read-only Mac preflight (existing containers; no mutation)
Pinned desired-secure API mount matrix ( `/app:ro` + nested RW route data ) against live IDs:

| Field | Live evidence |
| --- | --- |
| Proxy ID | `1932725ad746d70490ba62ace980a70c872a9b5ac6bfad76b5d5be955fa0bd28` |
| API ID | `51bbafd0cf14190d22cc29e994ad063ba09e16105ea818de2db5bf91318303e7` |
| Ngrok ID (untouched) | `178b23cbdb9d8aaf447d4f9bb8613393e32054733ed0ecb63d075bafe20d17f9` |
| Proxy image | `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1` |
| Preflight code | **`READ_ONLY_PREFLIGHT_BLOCKED`** |
| Blockers | **`API_MOUNTS_MISMATCH`**, **`API_ROOT_USER`**, **`PROXY_PORTS_NOT_LOOPBACK`** |
| productionChangeAuthorized | **false** |
| Origin five | all **UNKNOWN** ≠ PASS |

### Preserved secure state (passive)
| Check | Result |
| --- | --- |
| Active owner app confs | **17** |
| `/health.json` | **200** `{"status":"ok"}` |
| Session file mode | **0600** |
| Docker socket in proxy/API | **absent** |
| Privileged | **false** |
| API `/app` write | **succeeds** (deviation: must be RO) |
| API `apps` / `sites-enabled` | **EROFS** (blocks route-data writes needed for management) |
| Host worker / private spool | **not installed** |
| Effective nginx `mime.types` + brotli modules | present in image; **not bind-attested** in candidate closure |

## Exact NO-GO blocker
**Primary:** RC2 read-only preflight returned `READ_ONLY_PREFLIGHT_BLOCKED` with `API_MOUNTS_MISMATCH` + `API_ROOT_USER` + `PROXY_PORTS_NOT_LOOPBACK` on the live proxy/API. Contract requires STOP before production mutation when any safety gate is false.

**Contributing (would still block GO even after remount):** no installed Mac host worker / private spool+lease+secret pins; incomplete nginx loaded-file provenance (mime.types/modules); Origin five UNKNOWN; residual Calliope direct `docker exec` call sites outside `regenerateNginxBundle` unless `DEVPROXY_ACTIVATION_SPOOL_DIR` is set in the live API process.

## Deployed image/container identities
**Unchanged** — no controlled release executed. Live IDs above remain the current production identity.

## RETURNED
**`NO-GO_READ_ONLY_PREFLIGHT_BLOCKED` / `NOT_DEPLOYED`.** Source candidate adds real cross-process settlement wiring on top of preserved PR #76; production was not changed.

**Specialists:** none. **Production mutate:** none. **Ngrok/bridge/credentials/master:** untouched.
