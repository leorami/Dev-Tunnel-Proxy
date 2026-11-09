# DEVPROXY V125 — fix four verified chat-consistency regressions (ONE primary Cursor Engineer-I)

## Actual source/lifecycle starting point
The one primary Cursor Engineer-I V124 genuinely STARTED PR #79 #6753233320 and RETURNED #6753283448 at **`engineer/devproxy-rc2-controlled-release-20261104@952cc09a3fd994e3697a1263442889a3d9aa3188`**. This is one commit/7 paths after V123; the returned status HTML Git blob matches the original CTO V124 `fa4a84aeecb8fcf14a0162c593cd309ed0995fc5`. Engineer's real Mac native Node22 focused **15/15 PASS**, `./smart-build.sh test:unit` exit 0. **BROWSER_SOURCE_NOT_APPLIED:** owner live status page is older blob `d2fc2af05271073e777b103c7ce4c677b0165d64` per Engineer receipt, so no actual browser/UI verification. Preserve all V124 delivered source and V123 script vendor/DOM trust fixes.

The current correction is justified by **four RED tests against the actual returned V124 HTML**, not a speculative V125 hardening cycle. Owner issue #130 and read-only QA draft PR #132 already document the independently demonstrated failures. Verify PR #79 current primary branch SHA and newest STARTED/RETURNED before beginning; do not supersede another actually active assignment.

## CTO-first implementation already completed in this exact source-only branch
Import **exactly** these FIVE paths, without altering the primary's owner-local dirty files or protected master:
1. `status/status.html`: captures/validates chat epoch during persisted history fetch; prevents old messages arriving after Clear view or a new user interaction; changes status chip to informational rather than falsely claiming a legacy cancel acknowledgement stopped local work; changes global diagnosis guard to a per-route Set, coalescing same-route duplicate clicks but allowing distinct concurrent fixed-host read-only route checks; status remains “Checking” until pending other-route work completes. No new external AI/host commands or healing authority.
2. `tests/security/calliope-async-history-and-cancel-consistency.test.cjs`: four dynamic handler tests, **4/4 genuine RED** against returned V124 blob, **4/4 GREEN** against CTO-corrected HTML in source-exact isolated V8 execution. Prior V124 **15/15** source contracts stay GREEN.
3. `smart-build.sh`: one additional canonical `test:unit` hook for the four tests.
4. `docs/architecture/DEVPROXY_V125_CALLIOPE_ASYNC_CONSISTENCY.md`: source semantics, accepted/unknown boundaries.
5. This handoff file.

**CTO verification evidence:** 4/4 new GREEN; prior 15/15 GREEN; three in-page JavaScript blocks compile with V8; source edits limited to existing UI HTML + additional test hook/additions. This is **NOT** a completed native Mac Node/canonical/browser test or live deployment.

## One main implementation mini-sprint
1. Reread current genuine primary lifecycle, exact 40-character starting SHA and exact CTO branch SHA. Verify imported FIVE paths' Git blobs; do not accidentally cherry-pick the separate PR #132 test lane or duplicate test hooks. Do not merge draft PR #131 or PR #132 as independent product changes.
2. Import from pinned CTO branch to the **one** established primary integration branch. Preserve V124 single-initializer/Ask abort/HEAD-only/safe CSS, V123 vendored JS/escaping, all owner work, route data, disabled Notifications Bridge and RC2 host worker.
3. Run real Mac native focused `node --test tests/security/calliope-async-history-and-cancel-consistency.test.cjs tests/security/calliope-status-chat-singleflight.test.cjs` (**19 tests expected**) and `./smart-build.sh test:unit`. Verify all three embedded status scripts parse; scan diff for any accidental `ai/audit-and-heal`/Docker/host mutation/false cancellation. RED must remain reproducible against V124 parent, and GREEN against integrated source.
4. Exercise source-isolated dynamic/mock cases for: (a) clear before deferred history response, (b) typing/asking before history response, (c) idle status chip no “I've stopped” fabrication, (d) repeated same-route Diagnose coalesces, (e) different-route Diagnose while first pending sends a *distinct* fixed-host `ai/audit` HEAD, and (f) status chip stays Checking while another route is running. Ensure no duplicate *per action*, no stale bubbles after Clear, no history leakage, and no false claims of AI healing.
5. The existing live page is older source per V124 return. **DO NOT** restart/redeploy or run a shadow preview without a separate owner approval. Only run visual 375/768/1024/1440, dark/light, keyboard, Scroll/AutoScan checks against canonical URL **if the corrected source is truly live by an already authorized path**; otherwise retain **BROWSER_SOURCE_NOT_APPLIED** / **REAL_APP_VERIFIED UNKNOWN** and provide a concise decision-ready owner rollout gate with exact source identity. Owner wants usable UI, not endless source-only hardening.
6. One primary consolidated report (PR #79 + issue #130): STARTED→VERIFYING→RETURNED receipts, full Engineer SHA and diff, actual native/canonical test output, integrity of imported CTO blobs, specialist disposition, runtime SHA and visual status, remaining bugs, and unperformed privileged actions. CTO independently reviews returned committed source before owner UAT. **Stop after scope is met**.

## Intelligent parallelism and owner interventions
One primary Cursor Engineer-I retains complete implementation responsibility. A **read-only** UX/accessibility review specialist can help only if it can actually be launched and observed with a verifiable provider run ID, distinct source read-only ownership and no Mac/prod mutations; do **not** force specialists for this 5-path single-HTML patch. If unspawned, report `NOT_SPAWNED`; GitHub issue/PR creation is not launch proof. Owner intervention budget during source work: zero. Coordinate all questions through the primary. Never paste credentials to GitHub or chats.

## Trust/authorization invariant
This handoff authorizes **source, tests and read-only verification only**. NO production/owner-app deploy, protected master merge, Mac Notifications Bridge restoration, token/Messages, Docker/ngrok/proxy/API/worker/HMAC/LaunchAgent changes, auth/credential rotations, cross-project actions, owner-private data changes, or alternate test app. The prior V122 bridge listener containment remains, so bridge-backed outgoing notifications are intentionally unavailable. The public `ai/health` minimal local-documentation mode is **not** autonomous AI or self-healing; HEAD status is not browser diagnosis.

## Acceptance
SOURCE: exactly V125 + V124 safe code, 19 focused PASS, canonical test exit 0.
CHAT: no duplicate/late history or false stop; concurrent distinct routes each checked once, repeated same route coalesced.
TRUST: zero blocked heal/privileged action, literal results distinguish observed/unavailable.
OWNER: one canonical runtime, source identity attested, real browser screenshots or **explicit UNKNOWN** if not deployed; owner authority required for rollout and UAT.
