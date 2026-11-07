# DEVPROXY RC2 V87 restored owner bytes + AI parity — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** forced `sourceDirty:false` · AI heal acceptance · Origin PASS · cutover · insecure rollback

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `1b8947ea83a5de44ab9370a4ec48bf1842715677` |
| Handoff | `cto/devproxy-rc2-v87-restored-owner-bytes-20261104@0acc6a0f11b677bc2279a3a235a868be9c6d6a4d` |
| Parent v86 | `docs/receipts/DEVPROXY_RC2_V86_LOCAL_AUDIT_ENGINEER_COMPLETION.md` |
| CTO draft | PR #86 (source only) |
| Protected master | untouched `62a4d7babae986ade1feb0fd6dbe7dd32532523a` |
| This tip | `1becaee921a5af1343add00d20c950bd1a809989`* |

## STARTED
Rechecked sole primary at v86 tip; no newer STARTED primary. Preserved v85 image/dind and v86 HEAD audit. **No** image re-export. Live RC1 IDs unchanged.

## IMPLEMENTING

### 1) Import + tests
Six CTO v87 paths imported. Mac fix: secret-env 0600 check excludes public `.env.example` (0644) so real archives are not false-invalidated. Focused restore/CLI/env-example/apps-inventory/AI-scope/audit-contract: **28/28**. `./smart-build.sh test:unit` exit **0**.

### 2) Real private archive attestation (disposable extract only)
| Step | Result |
| --- | --- |
| Stage | refreshed `config-jkvBD2` after notifications-artifact drift vs `config-UxlyFD` (paths redacted) |
| Original tar SHA / 0600 stage files | **verified** |
| Extract + audited mode/mtime restore | 76 files; strip only *unlisted* AppleDouble |
| CLI offline | `RESTORED_FILES_VERIFIED_DIRTY_SOURCE_UNACCOUNTED` **files=76 routes=17** exit **3** |
| CLI + live root | same code exit **3** (live included match; dirty still unaccounted) |
| `sourceCurrent` / `ownerWorkPreserved` | **UNKNOWN** (not forced) |

### 3) Eight dirty paths (categories)
| Coverage | Paths |
| --- | --- |
| In allowlisted archive + byte/mode match live | compose×2, scripts×3, `status/status.html` |
| Private **supplement** (0700/0600, not uploaded) | `smart-build.sh`, `.cursor/rules/engineer-status-first.mdc` |
| `apps` / `.artifacts` / `.env` dirty | **0** |

Did **not** `git clean` or erase dirty work. Formal clean-source PASS remains impossible without owner tree hygiene; recoverability of dirty+owner bytes is evidenced via archive+supplement.

### 4) AI / scan functionality (partial, not heal parity)
| Path | Status |
| --- | --- |
| `POST ai/audit` | preserved v86 HEAD-only |
| `POST apps/scan` | **new** secure local `apps/*.conf` inventory (`utils/rc2-secure-apps-inventory.cjs`); no spawn/Docker |
| `ai/ask`, heal/advanced-heal/self-check, container ops | still degraded |
| Decision ask | consolidated `docs/receipts/DEVPROXY_RC2_V87_AI_SCOPE_DECISION_READY.md` (no invented acceptance) |
| PR #83 | reviewed deferred; not cherry-picked |

### 5) Cutover
**Withheld.** Pre-gates incomplete (dirty formal PASS, AI heal undecided, Origin five UNKNOWN, live host worker not staged).

## Exact NO-GO
1. **`CONFIG_SOURCE_DIRTY_FORMAL_BLOCK`** — bytes restored+live-matched with exit 3 dirty-unaccounted; not a release GO.
2. **`AI_HEAL_OWNER_SCOPE_UNDECIDED`** — partial audit/inventory ≠ heal; decision-ready ask consolidated.
3. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`**.

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.**

Live AFTER unchanged: proxy `1932725ad746…` / `9b2ae98f…`; API `51bbafd0…` / `8d6421d6…`. Ngrok/bridge/creds/master untouched. Specialists: none.
