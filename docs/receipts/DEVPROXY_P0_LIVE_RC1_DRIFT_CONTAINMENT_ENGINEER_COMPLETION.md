# DEVPROXY P0 live RC1 drift containment — Engineer completion

**Labels:** `P0_SOURCE_PREPARED` / `P0_RUNTIME_UNCHANGED` / `P0_RELEASE_NOT_AUTHORIZED`

## Pins
| Item | Ref |
| --- | --- |
| Handoff | `origin/cto/devproxy-p0-live-drift-containment-20261102@50c6f0f14c5e39f61e0a7d57cfa48e181b8abfae:docs/handoffs/DEVPROXY_P0_LIVE_RC1_DRIFT_CONTAINMENT.md` |
| CTO tip (base) | `50c6f0f14c5e39f61e0a7d57cfa48e181b8abfae` |
| Accepted product | `d89c962fb31a962a518f331bae458e63708e7e86` |
| Engineer tip | `engineer/devproxy-p0-live-drift-containment-20261102` (draft PR #39 head) |

## What shipped (source only)
1. Kept CTO pure policy `utils/rc1-release-drift-policy.cjs` + RED/GREEN fixture tests.
2. Added read-only attestor `utils/rc1-release-drift-attest.cjs` and CLI `scripts/rc1-drift-premutation-guard.cjs`.
3. Wired **pre-mutation** `rc1_premutation_guard` at the start of `cmd_up`, `cmd_restart`, `cmd_apply` (before ensure_network / bundle regen / compose stop|up).
4. Appended policy + guard tests to `./smart-build.sh test:unit` (existing hooks preserved).
5. `PLAN_ONLY` recovery plan: `docs/receipts/DEVPROXY_P0_LIVE_RC1_DRIFT_CONTAINMENT_PLAN_ONLY.md` (not READY).

## Tests
- Historical RED: first test commit without module → fail.
- Node 22 focused: policy 7/7 + guard fixtures PASS.
- Canonical `./smart-build.sh test:unit` PASS (exit 0).
- Live dry-check: `./smart-build.sh restart` from engineer tree exits **2** with `P0_DRIFT_BLOCKED` **before** compose stop; live container IDs unchanged.

## Redacted live exposure (unchanged by this work)
Matches Issue #10 R0: owner/master bind, proxy image ≠ RC1 cutover, anonymous full health/routes, API 3001/3002 all-interfaces, docker.sock RW.

## Recommended operator recovery action (separately authorized later)
Do **not** run ordinary `up/restart/apply` or `switch-to-production.sh`. After CTO review of this source, owner-authorize a **new** RC1 private-overlay cutover reusing Issue #19 mount/config/origin patterns (see PLAN_ONLY doc), with disposable rehearsal first.

## Bypass honesty
Direct `docker compose` and host-level restarts **bypass** this guard. Documented in guard stderr; LaunchAgents not modified.

## Specialists
Optional read-only Compose/startup specialist may be recorded on the Issue receipt if launched.
