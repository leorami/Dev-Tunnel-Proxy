# DEVPROXY RC2 V93 verified teaching admission — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** legacy KB→executable install · autonomous heal · Origin PASS · cutover · raw nginx in receipts

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `93962a98a5213b1ff4f4749928673839f0383e32` |
| Handoff | `cto/devproxy-rc2-v93-verified-teaching-admission-20261105@98366d08d0d9485b53e8a30275672501023ecd94` |
| Parent v92 | `docs/receipts/DEVPROXY_RC2_V92_ATOMIC_CAS_BROWSER_ENGINEER_COMPLETION.md` |
| CTO draft | PR #93 (handoff-only; CTO compiler sources were **not** published — implemented in-repo) |
| Implementation tip | *(filled at commit)* |

## STARTED
Sole primary RETURNED v92; no peer STARTED. Comment `6666353945`.

## IMPLEMENTING

### 1) Lesson evidence compiler
`utils/calliope-lesson-evidence-compiler.cjs` — exact before/after vs V91 proposal; `REVIEW_REQUIRED`; no raw config; SHA-shaped commit alone = `COMMIT_SHAPE_ONLY_UNVERIFIED`; GitHub attestation required for `provenanceVerified`.

### 2) Legacy KB quarantine
`utils/calliope-legacy-kb-quarantine.cjs` — read-only inventory/fingerprint (key-order independent); classify Next.js/mixed-content; unknown fn/signals → non-executable review requests; **no** `new RegExp`, **no** function invoke, **no** KB mutation.

### 3) Learn→reuse cycle
`utils/calliope-lesson-reuse.cjs` — admit V92 disposable lesson (GitHub-attested commit `93962a98…`); second disposable `aurora` failure → `EQUIVALENT_FAILURE_OFFERS_REVIEWED_PROPOSE` (`nginx.nextjs_redirect.propose`, still needs owner review + V92 CAS + browser verify); duplicate/conflict preserve original; missing ability non-executable.

### 4) Historic source verification
Independent `gh api` commit read: `93962a98a5213b1ff4f4749928673839f0383e32` exists on `leorami/Dev-Tunnel-Proxy`.

### 5) Tests
| Suite | Result |
| --- | --- |
| New V93 focused (compiler+quarantine+reuse) | **21/21** |
| + inherited V91 teaching/redirect | **36/36** |
| `./smart-build.sh test:unit` | *(see VERIFYING)* |

V92 CAS/browser paths untouched in behavior. Live owner files / RC1 unchanged.

## Exact NO-GO
1. **`AI_HEAL_OWNER_SCOPE_UNDECIDED`** — teaching admission + one reviewed redirect skill exist; broader AI chat/heal still needs owner choice (1 accept degraded / 2 defer / 3 reject).
2. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`**
3. Formal clean-source PASS still not claimed

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.** Specialists: none.
