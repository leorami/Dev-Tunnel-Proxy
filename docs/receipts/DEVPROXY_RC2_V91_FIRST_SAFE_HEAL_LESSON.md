# RC2 V91 lesson — Next.js `/_next/` redirect-loop (disposable, reviewed)

**Status:** disposable fixture VERIFIED via owner-approved exact-diff + `editApp` + nonlive HMAC settlement. **Not** a production live heal, **not** learningProven, **not** cutover authorization.

## Provenance
| Field | Value |
| --- | --- |
| Issue | `nextjs_redirect_loop` on route `lyra` |
| Historical Cursor claim | `test/CALLIOPE_TRAINING_COMPLETE.md` / `test/CALLIOPE_UI_FIX.md` |
| CTO proposal | `utils/calliope-redirect-loop-proposal.cjs` |
| Apply path | `utils/calliope-first-safe-heal.cjs` → `production-route-mutation.editApp` |
| Settlement | existing signed HMAC / v12 nonlive activation seam |
| Focused proof | `tests/security/calliope-first-safe-heal.test.cjs` |

## Exact hashes (disposable known-bad fixture)
| Phase | SHA-256 |
| --- | --- |
| before (broken `proxy_pass …/lyra/_next/;`) | `fcd658234ff412271504edcd3bac48fa6a8008810b8d8af513a0f222a6de0555` |
| after (bare `proxy_pass http://lyra-dev:4000;`) | `8d49e5ca3188c90f22ce6c4e38dd6a09d36cb0fb2651b39989f4bee7691d3f4b` |

## Status machine exercised
`OBSERVED → PROPOSED → OWNER_APPROVED → APPLIED → VERIFIED`  
Only `VERIFIED` sets `healingPerformed:true`. TOCTOU stale-before rejection and verification failure keep `healingPerformed:false`. Healthy/unmatched/unsafe targets return `NOT_AVAILABLE` / `FAILED`, never a false heal.

## Browser / asset evidence (synthetic disposable probe)
- Broken: `/lyra/_next/static/…` redirect-loop (`redirectLoop:true`, asset ≠ 200); `/other/` intact
- After apply: asset **200**, `redirectLoop:false`, unrelated `/other/` still **200**
- 16 synthetic sibling routes unchanged under transactional edit

## Teaching candidate (contract only)
- `proposalId`: `be806e0f1a6a9109ff1c1cd2663082f727837c00f76dba2e043ba72fb4dead14` (source.commit pinned to CTO handoff `6e0593ac…`)
- `status`: `REPLAY_REPORTED_PENDING_REVIEW`
- `nginx.nextjs_redirect.propose`: CONTRACT_ONLY_NOT_INSTALLED
- `nginx.route.transactional_patch`: NEW_ABILITY_REQUEST_NOT_IMPLEMENTED
- `learningProven:false`, `ownerApprovalGranted:false`, `executionAuthorized:false`

Reuse requires independent owner review; do not treat this receipt as an installed autonomous privilege.
