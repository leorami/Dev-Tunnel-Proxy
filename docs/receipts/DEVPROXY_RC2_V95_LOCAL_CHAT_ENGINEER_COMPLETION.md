# DEVPROXY RC2 V95 local Calliope Ask + release closure — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** external LLM parity · docker.sock heal · Origin PASS · cutover

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `b22fbc6f1494a7b07e930804405708eafe1095bb` |
| Handoff | `cto/devproxy-rc2-v95-local-chat-integrated-20261105@3521c969c3900a34982dffdddca462edb46a3109` |
| Parent v94 | `docs/receipts/DEVPROXY_RC2_V94_BOUND_REVIEW_HEAL_ENGINEER_COMPLETION.md` |
| CTO draft | PR #95 |
| Implementation tip | `97528b20658474a2e9d34c58f8a606c83cdea089` |
| Branch HEAD | `9a1c424cbd8d8fd90b847c164b6c25ac1564b07d` |
| STARTED comment | `6667849205` |

## STARTED
Sole primary RETURNED v94; no peer STARTED. Draft CTO PR #95 evidence only.

## IMPLEMENTING

### 1) CTO import (reviewed)
- `utils/rc2-local-calliope-evidence.cjs` + 14 RED-first tests
- Wire authenticated/trusted-Origin `POST ai/ask` **after** `requireAuth`, **before** secure deny + legacy Docker ask
- Arch + handoff docs

### 2) Beyond docs (mission §3)
- `utils/rc2-local-calliope-observe-explain.cjs` — fixed-host observation proof limits + reviewed heal explain (no auto-exec)
- Secure `GET ai/health` early path with `mode:'local_documentation'` (not OpenAI-key-only)

### 3) Signed-in Ask proof
`docs/receipts/DEVPROXY_RC2_V95_SIGNED_IN_LOCAL_ASK_PROOF.json` via `scripts/rc2-v95-signed-in-local-ask-proof.cjs`:
401 unauth · login 200 · cross-Origin 403 · oversized 400 · heal explain 200 · observe explain 200 · nonmatch docs gap · docs grounding · health `local_documentation`. Live containers untouched.

## Tests
| Suite | Result |
| --- | --- |
| Evidence + contract + observe-explain | **21/21** PASS |
| Signed-in Ask proof | exit **0** |
| `./smart-build.sh test:unit` | exit **0** |

## Exact NO-GO
1. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`** (postcutover-only; not demanded pre-cutover)
2. Formal clean-source PASS still not claimed (`VERIFIED_RECOVERABLE_DIRTY_SOURCE` evidence from V87 remains; eight dirty paths not fabricated clean)
3. **New owner-only decision:**  
   **Authorize two-service (proxy+API) cutover with the current owner-used surface** = local-docs Ask + observe/heal explain + V94 session ticket + reviewed Next.js `/_next/` skill + observation self-check — while external-model chat, embeddings/reindex, and docker.sock/inline Docker auto-heal stay blocked — **OR** hold live RC1 until you separately authorize restoring those blocked AI paths.  
   V95 restores usable signed-in Ask without pretending LLM/heal parity.

## Live BEFORE (unchanged)
proxy `1932725ad746…` / `9b2ae98f…`; API `51bbafd0…` / `8d6421d6…`. Ngrok/bridge/creds/master untouched. Production **NOT_DEPLOYED**.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.** Specialists: none.