# Origin / Dev Proxy — Owner Action Gate in every consequential report

**Status:** Proposed Dev Proxy reporting rule in an isolated CTO branch. Not merged into Origin project-template or applied to unrelated repositories. This is a reporting contract, **not** owner authorization or an instruction to launch an agent.

## Mandatory first section of every CTO or sole-primary implementation status/RETURNED report

**OWNER ACTION GATE: `NONE` | `APPROVAL REQUIRED` | `AUTHENTICATION REQUIRED` | `BOTH` | `PENDING EXECUTION` | `BLOCKED`.**

Always include it—even when `NONE`. Immediately after it, state:
1. **Owner intervention now:** one consolidated, exact decision or trusted-interface authentication step. Separate authorization (permission to mutate) from authentication (proving identity). Never solicit secrets/MFA/passwords via chat, GitHub, prompts or logs.
2. **Recommendation and consequences:** choose the least disruptive adequate option; state the change, affected live systems, effects, rollback, and explicit operations **excluded**. Describe the impact of delaying/denying approval.
3. **Evidence and reference:** exact repository/branch/40-character SHA and issue/PR receipt demonstrating why the decision is consequential; never infer permission from a ticket, GitHub approval or completed tests.
4. **Independent work still advancing:** latest genuine sole-primary STARTED/RETURNED state, what engineering can continue **without** owner action, and the work actually blocked. Never say the entire project is waiting when independent work continues.
5. **Decision ledger:** `PENDING`, `GRANTED` with an exact owner statement/reference and scope, `DENIED` or `CLOSED`, with no inferred expansions. If a decision is granted, do not request it again unless the desired scope changes.

**Timing:** Raise a genuine owner-only decision in the **first** status report after the underlying evidence establishes it. Do not bury it below technical progress, optional hardening, or a future handoff. "Default owner-interruption budget: zero" means **zero unnecessary interruptions**, not suppression of essential consequential authorizations. Continue independent, nonmutating work while the decision is pending.

## Current Dev Proxy gate — requires explicit answer

`APPROVAL REQUIRED / PENDING` — Decision recorded at [PR #79 comment #6672337789](https://github.com/leorami/Dev-Tunnel-Proxy/pull/79#issuecomment-6672337789), based on Engineer-I V103 genuine RETURNED `engineer/devproxy-rc2-controlled-release-20261104@962bbd73bb3416155d3964ded64194d584d109a8` (RETURNED #6670773774). V105 has genuinely STARTED at #6672290541 and must not be interrupted.

**Recommendation: APPROVE a single, bounded API-only live correction**, following existing private backup, staging, rollback and session/HMAC continuity gates: append ONLY the already approved exact static HTTPS browser Origin to the live owner-private trusted-origins set, retaining both loopback entries; recreate ONLY `proxy-config-api` once to load V103's privacy-safe public health and login allowlist. Validate private HTTPS negative login expected 401 rather than 403, foreign Origin remains 403, minimal no-store anonymous health, session/local Ask/HMAC/17 routes, nonroot/RO and original proxy+worker identities. No proxy recreate/restart-policy change in this grant, no ngrok, bridge, credentials, master, dirty file modification, external AI or real owner heal.

**Impact:** possible short API interruption / session continuity risk (mitigate with rollback); without permission, the *measured* HTTPS login 403 and *measured* public health metadata leak remain. This branch does not apply it or authorize it.

## Escalation invariant

If the system can continue staging/testing but cannot perform a consequential live action without owner permission, label it `SOURCE_PREPARED / APPROVAL REQUIRED`, with the exact owner question **at the top**. Never report only `GREEN`, `NO-GO` or "awaiting approval" without the decision, recommendation, impact and reference. Once the owner decides, primary Engineer-I brokers the narrowly scoped permission to its work and returns one consolidated receipt; the CTO independently reviews before owner UAT.
