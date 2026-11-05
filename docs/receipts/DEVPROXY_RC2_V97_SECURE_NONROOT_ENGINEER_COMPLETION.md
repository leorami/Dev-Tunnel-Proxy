# DEVPROXY RC2 V97 secure nonroot recovery — **NO-GO** (cutover withheld)

**Return label:** `NO-GO_OWNER_FEATURE_SCOPE_UNDECIDED` / `NOT_DEPLOYED`  
**Technical recovery:** disposable isolated nonroot restore **PROVED**  
**Not:** production cutover · Origin PASS · forged clean Git · external-AI authorization

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `1094495badbbd8efe66d9d3ada15f785b0fd665d` |
| Handoff | `cto/devproxy-rc2-v97-isolated-nonroot-recovery-20261105@f0bedfc71f03a71b31a12ee2eee74ef59614df38` |
| Parent v96 | `docs/receipts/DEVPROXY_RC2_V96_OWNER_DIRTY_BYTE_ENGINEER_COMPLETION.md` |
| CTO draft | PR #97 |
| Implementation tip | `87f6ab8b8c853f0ee4572c8060ca8d1eeebd8ad7` |
| Branch HEAD | `87f6ab8b8c853f0ee4572c8060ca8d1eeebd8ad7` |
| STARTED comment | `6668932493` |

## STARTED
Sole primary RETURNED v96; no peer STARTED. Draft CTO PR #97 evidence only.

## IMPLEMENTING

### 1) CTO import
`utils/rc2-isolated-nonroot-restore-candidate.cjs` + 18 RED/GREEN tests + architecture/handoff.

### 2) Stale focused tests reconciled (RED captured first)
`rc2-production-compose-candidate` / `rc2-production-compose-preflight` updated from obsolete `/app/.artifacts/rc2-spool` to real `/app/.artifacts/rc2-ipc` parent + `/app/.artifacts/rc2-ipc/spool` env. Captured RED before fix; now GREEN.

### 3) Disposable isolated Mac runtime proof
`docs/receipts/DEVPROXY_RC2_V97_ISOLATED_NONROOT_RESTORE_PROOF.json`:
- Private stage copies only; no live checkout/route mounts
- Source candidate → isolated transform (empty ports, internal network, unique names, digest-pinned images)
- RED rejects: live owner path, root UID, docker.sock
- Runtime: API `504:20`, `readOnlyRootfs`, privileged false, published ports `{}`, HMAC spool leaves ready, `nginx -t` successful, 17 staged app confs
- Live RC1 IDs unchanged before/after; stack destroyed after proof

### 4) V96 preservation combination
With `secureNonrootCandidateRestoreAttested:true` + prior V96 byte replay / exhaustive inventory / tar attestation → `VERIFIED_RECOVERABLE_DIRTY_PRESERVATION` while `sourceDirty:true`, `formalCleanPass:false`, `releaseAuthorized:false`, `cutoverPermittedByThisModule:false`.

## Tests
| Suite | Result |
| --- | --- |
| Isolated nonroot + compose candidate + preflight | **46/46** |
| `./smart-build.sh test:unit` | exit **0** |
| Disposable restore runtime | proved then destroyed |

## Exact NO-GO (owner scope)
Technical nonroot recovery blocker from V96 is **closed**. Cutover still withheld:

1. **Owner feature-scope undecided** — recommend **(A)** cut over with current local-docs Ask + V94 ticketed `/_next/` heal while external-model chat and legacy docker.sock auto-heal stay disabled, **or (B)** hold RC1 until those AI paths are separately authorized. Evidence supports recommending A; **A is not claimed already authorized**.
2. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`** (postcutover-only).
3. No master/ngrok/bridge/credential mutation performed.

## Live BEFORE/AFTER (unchanged)
proxy `1932725ad746…` / `9b2ae98f…`; API `51bbafd0…` / `8d6421d6…`. Production **NOT_DEPLOYED**.

## RETURNED
**`NO-GO_OWNER_FEATURE_SCOPE_UNDECIDED` / `NOT_DEPLOYED`.** Specialists: none.
