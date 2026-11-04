# Owner scope-change request — AI heal / scan under RC2 secure API

**Status:** DECISION REQUESTED — not a GO, not deployed, not a silent acceptance.

## Context
RC2 settlement-secure mode blocks inline Docker from the API (`refuseInlineDocker` / `UNSAFE_POST`). Owner-used heal journeys (`ai/audit-and-heal`, `ai/advanced-heal`, `ai/self-check`, `apps/scan`, …) therefore return explicit failure rather than false success. `apps/install` and `apps/create-route` remain on the transactional settlement path.

## Decision options (pick one)
1. **Accept degraded scope for this cutover** — ship proxy+API hardening without AI heal/scan; document operator runbooks outside the API.
2. **Defer cutover** until a reviewed host-mediated, non-socket heal path exists (fixed-action host worker only; no docker.sock in API).
3. **Reject** — keep live RC1 until heal parity is restored.

Source inventory: `utils/rc2-ai-heal-degraded-scope.cjs` → `OWNER_SCOPE_DECISION_REQUIRED`.
