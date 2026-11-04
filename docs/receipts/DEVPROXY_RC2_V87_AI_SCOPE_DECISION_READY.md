# Consolidated owner scope decision — AI heal under RC2 (v87)

**Status:** DECISION REQUESTED — supersedes generic NO-GO repetition; does **not** invent acceptance.

## Recovered without Docker (secure mode)
| Path | Capability |
| --- | --- |
| `POST ai/audit` | Authenticated HEAD-only to fixed `dev-proxy:80` (not browser audit) |
| `POST apps/scan` | Authenticated local `apps/*.conf` inventory (not container/network scan) |
| `apps/install`, `apps/create-route`, `overrides/promote` | HMAC settlement / production-route-mutation |

## Still blocked (owner-used heal / chat)
`ai/ask`, `ai/audit-and-heal`, `ai/advanced-heal`, `ai/self-check`, container inspect/review/fix, Docker-backed scan.

PR #83 privacy GET notes remain deferred (dashboard compatibility not verified this return).

## Decision options (unchanged; pick one)
1. **Accept degraded scope** for cutover: ship proxy+API hardening with HEAD audit + local inventory only; heal/chat stay operator-runbook outside API.
2. **Defer cutover** until reviewed host-mediated fixed-action heal exists (no API docker.sock).
3. **Reject** — keep live RC1 until heal parity restored.

Source: `utils/rc2-ai-heal-degraded-scope.cjs` → `OWNER_SCOPE_DECISION_REQUIRED`.
