# DEVPROXY V125 — terminal Calliope consistency after V124 source return

## Starting truth and why this is not optional hardening
Sole primary V124 genuinely STARTED (#6753233320) and RETURNED (#6753283448) on PR #79 at `engineer/devproxy-rc2-controlled-release-20261104@952cc09a3fd994e3697a1263442889a3d9aa3188`. The return's source contains exact CTO V124 HTML blob `fa4a84aeecb8fcf14a0162c593cd309ed0995fc5`, test blob `edba20f19307e875c21611f02cc7f3ab1f0e75b3`, and one canonical test hook. Engineer-reported native focused tests: 15/15 PASS and `./smart-build.sh test:unit` exit 0. Runtime source still differs: live HTML blob reported `d2fc2af05271073e777b103c7ce4c677b0165d64`. **No real browser/owner UAT or deploy occurred.** V124 source checkpoint is preserved, NOT declared final user-visible success.

Independent CTO code-read and dynamic execution of *actual returned handler bodies* proved four **RED** user-facing errors (issue #130; isolated read-only QA draft PR #132):
1. Persisted `loadChatHistory()` fetch resolves after **Clear view** and resurrects old bubbles despite `chatEpoch`.
2. The initial history fetch resolves after a new user interaction and appends old bubbles in the wrong conversation.
3. With no action running, clicking the Calliope status chip invokes legacy `ai/cancel`; backend returns `{ok:true,message:'Cancellation requested'}`, but UI falsely claims “I've stopped”. Secure `ai/ask` local docs and `ai/audit` fixed-host HEAD are not canceled by that legacy flag. HTTP 200 is not proof an operation stopped.
4. While `/oauth` diagnosis is pending, clicking `/tigerslam` is silently discarded due global boolean `diagnosisInFlight`, contradicting V124's own owner-browser checklist (“different route Diagnose → new request”).

## Smallest safe CTO implementation
- History: capture the chat epoch before the async history request, verify after response *and* after JSON parsing, and never append if the view was cleared or a new user interaction engaged the chat. Preserve opt-in existing `calliopePersistChat` and max-100 history contract.
- Cancel: remove the deceptive status-chip click handler entirely. The chip is informational; do not silently map `ai/cancel` to local operation cancellation or invent a privilege. Existing Clear view aborts an in-flight Ask. No backend/API modifications.
- Diagnose: replace the **global** in-flight boolean with a per-route Set; repeated clicks on the **same** route coalesce, different routes each get one fixed-host read-only HEAD observation. Do not open arbitrary URLs or restore `audit-and-heal`. If another route remains pending, chip still says “Checking” rather than premature finished. Clear still suppresses late bubbles.
- Tests: additive `tests/security/calliope-async-history-and-cancel-consistency.test.cjs` with four focused behavioral tests dynamically executing source-extracted handlers, one canonical unit test hook, unchanged V124 source contracts.
- Preserve all V123 vendored script security and V124 duplicate event-handler/Ask/safe diagnosis repairs.

## Verified CTO evidence / limits
- The four new tests were **4/4 RED** against exact returned V124 HTML blob `fa4a84aeecb8fcf14a0162c593cd309ed0995fc5`; on the isolated CTO-fixed HTML they were **4/4 GREEN** in a source-exact V8 harness. Existing V124 **15/15** source contracts remain GREEN. All 3 embedded JavaScript blocks compile. No Mac-native checked-in Node/canonical tests or canonical browser interactions performed by CTO here.
- Distinguish `LOCAL_HTTP_OK` (HEAD 2xx) from full application/browser health, `LOCAL_HTTP_NOT_GREEN` (HTTP non-2xx) and `LOCAL_HTTP_PROBE_UNAVAILABLE` (unverified). No repair can be implied; no external LLM is enabled by V125.
- The running owner application remains on older source according to V124 Engineer receipt. **Owner deployment, protected merge, service/bridge restart, HMAC/worker/Docker/ngrok/API changes and notifications restoration are NOT authorized by this source-only patch.** The bridge remains disabled; outgoing Mac notifications via it unavailable. Never start a second app to obtain browser screenshots.
- A primary Cursor Engineer-I should run real Node22 focused+canonical suite and verify SHA/blob integrity; if no authorized source deployment is possible, return `SOURCE_READY_OWNER_ROLLOUT_GATE` and `BROWSER_SOURCE_NOT_APPLIED`, not invented visual PASS. Single consolidated return then independent CTO committed-diff review before owner UAT.

## Stop boundary
This is one narrow owner-visible correctness regression that V124 did not catch; not a general new security sprint or authority expansion. No changes outside the five source/test/canon/handoff/hook paths. No new work after exact GREEN and truthful rollout gate; user-visible work is only accepted on verified canonical owner runtime with real screenshots and outcomes.
