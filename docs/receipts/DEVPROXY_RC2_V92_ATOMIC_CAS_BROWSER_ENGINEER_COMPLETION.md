# DEVPROXY RC2 V92 atomic CAS + browser reality — **NO-GO**

**Return label:** `NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`  
**Not:** production live heal · Origin PASS · cutover · synthetic-as-VERIFIED · false liveAttested

## Lifecycle
`STARTED → IMPLEMENTING → VERIFYING → RETURNED`

## Pins
| Role | Value |
| --- | --- |
| Engineer start | PR #79 @ `8d9abc22d5fe446f2713f1b16cc30f5955a801a4` |
| Handoff | `cto/devproxy-rc2-v92-browser-trust-and-atomic-preimage-20261105@05d7b7b077531fd5d504de84da843edd8941227f` |
| Parent v91 | `docs/receipts/DEVPROXY_RC2_V91_TEACHING_FIRST_SAFE_HEAL_ENGINEER_COMPLETION.md` |
| CTO draft | PR #92 |
| Implementation tip | `97d2253d9d52cd880a5d42e27084cfac2a8f2c55` |

## STARTED
Sole primary RETURNED v91; no peer STARTED. Comment `6665886742`.

## IMPLEMENTING

### 1) CTO import (7 paths)
Locked owner-preimage CAS in `production-route-mutation.editApp`, pure preimage comparator, recorded-browser reducer + docs. Focused **24/24** PASS.

### 2) Atomic CAS wiring + race
- `calliope-first-safe-heal.applyApprovedRepair` passes `{expectedBeforeSha256}` as third `editApp` arg
- Race test: approved read succeeds → intervening writer before lock → **409** `BLOCKED_STALE_APPROVED_PREIMAGE` / `CAS_STALE_APPROVED_PREIMAGE`; owner bytes not overwritten by candidate; bundle unchanged; no false VERIFIED
- Legacy `editApp(name,content)` unchanged

### 3) Real proof vs synthetic
- Synthetic fixture retained unit-only → `UNIT_SYNTHETIC_ONLY`, `healingPerformed:false`
- Client boolean `verify` callback → `EVIDENCE_REQUIRED`, cannot heal
- Disposable `nginx -t` via docker (`utils/calliope-disposable-nginx-syntax.cjs`) — real exit 0
- Disposable Chromium (system Chrome + playwright-core) before loop / after 200 JS MIME — `docs/receipts/DEVPROXY_RC2_V92_DISPOSABLE_BROWSER_PROOF.json`
- Assessor: `RECORDED_REPAIR_NEEDS_LIVE_ATTESTATION`; `liveAttested:false`

### 4) Smallest owner-used skill
- `utils/calliope-owner-nextjs-heal-skill.cjs`
- API: `POST apps/propose-nextjs-redirect-heal`, `POST apps/apply-reviewed-nextjs-redirect` (session-auth, CAS editApp + HMAC)
- UI: Calliope drawer **Fix /_next/ loop** (propose → confirm hashes → apply)
- Apply sets `healingPerformed:false` until separate disposable browser+nginx verify; never OpenAI/docker.sock

### 5) Live BEFORE
Unchanged RC1: `dev-proxy` `1932725ad746…` / `9b2ae98f…`; API `51bbafd0…` / `8d6421d6…`. No image re-export. Ngrok/bridge/creds/master untouched.

## Exact NO-GO
1. **`AI_HEAL_OWNER_SCOPE_UNDECIDED`** — one host-mediated reviewed redirect skill exists; broader AI chat/heal/docker paths still need owner choice (recommend **option 2**: defer full AI parity cutover acceptance, or **option 1** accept degraded scope now that a reviewed redirect skill is present — owner picks).
2. **`ORIGIN_FIVE_UNKNOWN`** / **`LIVE_AFTER_NOT_RUN`**
3. Formal clean-source PASS still not claimed

## Cleared / advanced
- V91 lock-gap: approved before SHA now enforced **inside** mutation lock
- Synthetic cannot claim owner-facing VERIFIED heal
- Real disposable nginx -t + Chromium evidence recorded
- Durable lesson skill source-pinned; production live still unverified

## RETURNED
**`NO-GO_PRE_CUTOVER_GATES_INCOMPLETE` / `NOT_DEPLOYED`.** Specialists: none.
