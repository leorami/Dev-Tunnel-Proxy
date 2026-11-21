# V175 — fix actual V174 observer return blockers before any deployment

**PREPARED, NOT STARTED.** Contract read-only until source work is explicitly executed by the single primary Cursor Engineer-I. No additional production grant. Owner priority: safe direct CTO viewing of the single canonical Dev Proxy app with real PNGs inline in ChatGPT, no admin password forwarding, while not regressing V172's live security.

## Goal

Convert V174's source-wired but nonfunctional observer into independently reviewed, fail-closed, **source-only** implementation: preserve V172 production auth precedence, internal-only auth subrequest, verified original path and runtime SHA, real observer-safe page data and server-bound consent flow. Do not represent code/tests as an authenticated browser transport.

## Frozen starting truth

- Repo `leorami/Dev-Tunnel-Proxy`; default protected `main` verified; `master` retained.
- Engineer-I V174 genuinely [STARTED #7050299989](https://github.com/leorami/Dev-Tunnel-Proxy/issues/182#issuecomment-7050299989) → [RETURNED #7050469669](https://github.com/leorami/Dev-Tunnel-Proxy/issues/182#issuecomment-7050469669). Not currently active after verified return.
- Candidate actual HEAD: `engineer/devproxy-v174-mandatory-cto-visual-bridge-20261120@edb362d56eee9bb9a12b0945b1f59a258435412e`, PR #183 DRAFT, not deployed, not CTO-accepted.
- CTO independent review on PR #183: review ID `6001046701`, `REVISE_REQUIRED`; do not merge PR #183 before fixing blockers.
- THIS CTO branch: `cto/devproxy-v175-observer-predeploy-red-gates-20261120`, exact remote **full** SHA to be verified at dispatch. Contains RED tests and durable source canon, not a modification to Engineer-I branch.
- The new `docs/architecture/DEVPROXY_V175_OBSERVER_PREDEPLOY_TRUST_GATES.md` is the detailed technical contract.

## Contract gate (do RED first, not test bypasses)

1. Run `node --test tests/security/v175-observer-predeploy-red-gates.test.cjs` from the exact CTO branch; record the expected RED failures and original failing predicates before implementation. Investigate any surprising PASS/FAIL rather than weakening test requirements.
2. P0: In BOTH `config/default.conf` and `config/default.production.conf`, preserve V172's four `location ^~ /status|/reports|/health|/dashboard` prefixes with protected dual auth; Nginx's generic JSON regex must never select an anonymous handler for a nested private JSON under these families. Preserve exact public /health.json and intended public assets.
3. P0: Make the dual visual auth subrequest `internal`, bind the *actual* original HTTP target to the observer decision (no `/status` fallback), and deny wrong/missing/ambiguous path.
4. P1: Require loaded server-attested `sourceSha` identity to match the issuance request; never trust an arbitrary owner-entered source SHA or a guessed environment variable. Fail closed on unknown parity. Account for actual Compose/host launch configuration without injecting secrets.
5. P1: Provide a **real reachable** Nginx route for narrow sanitized observer projections and a real observer-safe page/interaction mode; normal admin-only routes, arbitrary JSON, route install/heal, Notifications Bridge, host worker and protected data must remain denied. Verify important pages, asset manifest, theme/viewport, console errors, one-send UX; no fake mocked page approved.
6. P1: Replace owner-invented CSRF strings and manual SHA entry with trusted server/session binding. Prevent redemption-token display in URLs, screenshots, logs, public PRs and any ChatGPT prompt. A claimed `observerPrincipal` string alone cannot attest a trusted receiver; if no secure out-of-band receiver exists, preserve the blocked transport state.
7. Verify strict read-only (GET/HEAD only for safe projections/pages/assets, deny all writes/API/owner-only GET), grant TTL<=10m/replay/revocation/cross-origin/CSRF/source drift/session-mixing, native Nginx authorization, Docker bind overlay parity, canonical `./smart-build.sh test:unit`, no skipped security case.
8. **No runtime actions:** this is an isolated implementation branch and one reviewable draft PR. Do not edit live nginx, reload, recreate containers, modify tunnel or credentials, start a browser service, merge protected main, or mutate owner's dirty checkout without distinct approval.
9. For real browser transport, determine honestly whether a callable, approved ChatGPT Work/Dev Proxy plugin can deliver **actual PNG bytes** directly into this ChatGPT interaction. If not, stop short of claimed acceptance with `BLOCKED_CTO_BROWSER_TRANSPORT`; do not ask owner to paste secrets or transport screenshots manually.

## Steps / nonoverlap

- One primary Cursor Engineer-I only. No specialist needed for the tightly coupled Nginx/API/observer security boundary.
- First independently reconcile fresh GitHub primary lifecycle and actual parent SHA. If primary is active on a different assignment, **do not interrupt or duplicate** it.
- Preserve existing pristine `main` and current loaded V172 configuration. Start an isolated implementation branch from exact CTO branch tip; red test, smallest green changes, canonical tests, native regression, owner-equivalent UAT if truly accessible; read back pushed full SHA.
- Provide one consolidated STARTED→RETURNED (or STOPPED) linked receipt, final PR, exact commits/tests and skipped count, runtime/source parity and transport truth. Include genuine original PNG evidence via *trusted retrievable pixels* when available; do not claim CTO screenshot inspection from Cursor filenames.
- CTO independently inspects actual diff and accessible pixels before any visible acceptance. Owner final UAT and observer live activation remain separately gated.

## Definition of done

- Four V172 protections intact in production source; auth check internal; unknown original path denied.
- All new RED cases become GREEN **without weakening assertions**, native source-matched Nginx proof, canonical tests GREEN with zero hidden security skips.
- Server-proven grant/CSRF/identity handling and actual sanitized UI read-only route behavior. No admin API access.
- One source-only reviewable return. Trustworthy browser transport is `READY` only when this ChatGPT surface can actually navigate and embed original pixels. Until then `CTO_VISUAL_REVIEW_BLOCKED` and no owner UAT request.

## Next single-main-Agent instruction

Use `Execute origin/<this-cto-branch>@<full-40-character-SHA>:docs/handoffs/DEVPROXY_V175_OBSERVER_PREDEPLOY_REPAIR.md exactly as written.` only after reading authentic lifecycle and verifying immutable remote tip. No separate prompts for specialist agents.
