# DEVPROXY RC2 V96 owner dirty-byte recoverability — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** forged `formalCleanPass:true` · Origin PASS · cutover · insecure rollback

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `875d0555a3abed92518def53606f71ef0722316b` |
| Handoff | `cto/devproxy-rc2-v96-owner-dirty-byte-proof-20261105@0baa3a39ca44ae3a07f3474053250726b14eb68f` |
| Parent v95 | `docs/receipts/DEVPROXY_RC2_V95_LOCAL_CHAT_ENGINEER_COMPLETION.md` |
| CTO draft | PR #96 |
| STARTED comment | `6668216182` |
| Owner checkout HEAD (dirty tree) | `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |

## STARTED
Sole primary RETURNED v95; no peer STARTED. Draft CTO PR #96 evidence only.

## IMPLEMENTING

### 1) CTO import
Six V96 paths: byte-replay module, private CLI, 22 RED-first tests, architecture + handoff.

### 2) Integration vs path-only false recoverable
`tests/security/rc2-dirty-path-only-vs-byte-replay.test.cjs` — old `classifyDirtySourceRecoverability` returns `VERIFIED_RECOVERABLE_DIRTY_SOURCE` on **fake hashes**; new byte verifier **blocks**.

### 3) Audited recoverable-dirty preservation path
`utils/rc2-recoverable-dirty-preservation.cjs` — requires matched byte replay + exhaustive inventory + original tar + secure nonroot restore; keeps `sourceDirty:true` / `formalCleanPass:false` / `releaseAuthorized:false` / `cutoverPermittedByThisModule:false`. RED-first missing-proof denials.

### 4) Private Mac owner dirty proof (redacted)
`docs/receipts/DEVPROXY_RC2_V96_OWNER_DIRTY_BYTE_REPLAY_PROOF.json`:
- CLI exit **0**: `OWNER_DIRTY_BYTE_REPLAY_MATCHED filesVerified=8 archived=6 supplemented=2 sourceDirty=true formalCleanPass=false releaseAuthorized=false`
- Fresh porcelain inventory: **8** dirty entries (7 modified + 1 untracked rule file under `.cursor/`); exhaustive attested for that inventory
- Prior V87 tar attestation reused (no byte drift on archived six)
- **No** paths/hashes/plan contents published
- `secureNonrootCandidateRestoreAttested:false` → full preservation combo code `RECOVERABLE_DIRTY_SECURE_NONROOT_RESTORE_REQUIRED`

### 5) Owner UX preserved
Re-ran V95 signed-in Ask proof exit **0** (local_documentation / observe / heal explain). V94 ticket path untouched. No docker.sock / external AI enabled.

## Tests
| Suite | Result |
| --- | --- |
| CTO byte-replay + CLI | **22/22** |
| Path-only vs byte + preservation | **4/4** |
| Combined focused | **26/26** |
| `./smart-build.sh test:unit` | exit **0** |
| V95 Ask proof (regression) | exit **0** |

## Exact NO-GO
1. **Byte-exact dirty recoverability is POSITIVE** — do not recycle “must be git-clean” as the hard blocker; `sourceDirty:true` remains honest.
2. **Full preservation combo incomplete:** secure nonroot **candidate** restore still unattested (`RECOVERABLE_DIRTY_SECURE_NONROOT_RESTORE_REQUIRED`).
3. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`**.
4. **Owner feature-scope decision still required:** cut over with current Ask + ticketed `/_next/` heal surface while external-model/docker.sock auto-heal stay blocked — **OR** hold RC1 until those paths are separately authorized. This module never self-grants cutover.

## Live BEFORE (unchanged)
proxy `1932725ad746…` / `9b2ae98f…`; API `51bbafd0…` / `8d6421d6…`. Ngrok/bridge/creds/master untouched. Production **NOT_DEPLOYED**.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.** Specialists: none.
