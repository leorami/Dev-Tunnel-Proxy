# DEVPROXY RC2 V91 teaching → first safe heal — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** production live heal · AI scope acceptance · Origin PASS · cutover · permanent read-only Calliope

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `55e1ddaed111f327eefe834d34af6c36b2815e8c` |
| Handoff | `cto/devproxy-rc2-v91-calliope-teaching-first-heal-20261105@6e0593acffa240c6cbc67068c2ec5d6cc5ec0d16` |
| Parent v90 | `docs/receipts/DEVPROXY_RC2_V90_GET_PURITY_ENGINEER_COMPLETION.md` |
| CTO draft | PR #90 |
| Protected master | untouched |
| This tip | *(see git tip at RETURNED)* |

## STARTED
Sole primary on PR #79; no peer STARTED. Comment `6665558592`.

## IMPLEMENTING

### 1) CTO import (six paths only)
Teaching contract + redirect-loop proposal + tests + canon/handoff. Focused **15/15** PASS. Canonical unit green after import.

### 2) First safe heal (disposable)
| Item | Result |
| --- | --- |
| Fixture | `utils/calliope-nextjs-redirect-fixture.cjs` known-bad `/lyra/_next/` |
| Status machine | `utils/calliope-first-safe-heal.cjs` — OBSERVED…VERIFIED / FAILED / NOT_AVAILABLE / NEW_ABILITY_REQUESTED |
| Apply | owner-bound exact SHA → TOCTOU → `editApp` + HMAC nonlive settlement |
| Focused tests | **7/7** PASS (`calliope-first-safe-heal.test.cjs`) |
| Lesson | `docs/receipts/DEVPROXY_RC2_V91_FIRST_SAFE_HEAL_LESSON.md` |
| Production API auto-heal endpoint | **not** wired (no free-form model → shell/Docker; no silent privilege) |

### 3) Live BEFORE recheck (unchanged RC1)
| Service | Container ID | Image |
| --- | --- | --- |
| `dev-proxy` | `1932725ad746…` | `sha256:9b2ae98f…` running healthy |
| `dev-proxy-config-api` | `51bbafd0…` | `sha256:8d6421d6…` running (forensic root BEFORE) |

Docker daemon reachable. Ngrok/bridge/creds/master untouched.

## VERIFYING
- Teaching + redirect + first-heal focused suites green
- `./smart-build.sh test:unit` exit 0
- Disposable heal VERIFIED once; production cutover **withheld**

## Exact NO-GO (still)
1. **`AI_HEAL_OWNER_SCOPE_UNDECIDED`** — disposable host-mediated redirect repair proven; owner-used AI heal/chat scope still needs explicit decision (`docs/receipts/DEVPROXY_RC2_V87_AI_SCOPE_DECISION_READY.md`). Options unchanged: accept degraded observation-only cutover, defer until more host-mediated abilities land, or reject.
2. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`**
3. Formal clean-source PASS still **not** claimed (`formalCleanPass:false` / recoverable dirty from v90)

### Cleared / advanced this return
- **`CALLIOPE_PERMANENTLY_READ_ONLY_SILENT`** — rejected: teaching + one bounded VERIFIED disposable heal path exist
- **`FIRST_SAFE_HEAL_UNPROVEN`** — disposable OBSERVED→VERIFIED via `editApp`+HMAC+browser synthetic probe
- CTO proposal purity preserved (`executionAuthorized:false` until owner approval + verify)

## Owner-only scope question (unchanged, decision-ready)
For cutover, pick one from v87: (1) accept degraded AI scope, (2) defer until reviewed host-mediated heal set is owner-accepted, (3) reject / keep live RC1.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.**

Specialists: none. No cutover, no JIT pin, no AFTER Origin attestation claimed.
