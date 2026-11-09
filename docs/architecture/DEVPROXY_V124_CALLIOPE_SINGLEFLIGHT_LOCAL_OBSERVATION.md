# DEVPROXY V124 — owner-visible Calliope recovery contract (P1 issue #130)

## Provenance and noninterference
This source-only CTO correction starts from the **genuine V123 primary RETURNED** on PR #79 comment #6752011595 at `engineer/devproxy-rc2-controlled-release-20261104@ed0f578ea78bc934165ae7fe1d1177252b9857e5`. V123 vendored Lucide/Marked/DOMPurify and fixed paired-page DOM sinks but did **not** pass browser QA and did **not** deploy. The one-time V122 Notifications Bridge containment remains active; outgoing notifications depending on that bridge remain offline. No bridge restoration, HMAC/worker/Docker/ngrok/route changes, protected-master merge or live deployment are authorized by V124.

Owner-visible failure: one interaction produced multiple Calliope messages, self-checks left spinners, route-specific "diagnose" invoked unavailable secure-mode healing, and small status cards/Auto-Scan controls clipped.

## Verified source causes
- Boot called `initAiAssistant()` twice, once unawaited and once awaited; each initializer independently registered events and timers.
- Ask, Enter, Clear, Copy handlers were registered twice *per instance*; `onCopy` was separately declared twice.
- The tab had competing document-capture and direct bubble toggles.
- Route diagnosis invoked legacy `ai/audit-and-heal` and a second unrelated `ai/self-check`; RC2 secure management intentionally blocks audit-and-heal. An HTTP error could still result in "Happy".
- Self-check deliberately retained its thinking bubble on completion. Periodic public `ai/health` reports `mode:'local_documentation'`, not an external assistant.
- Narrow route cards lacked a min-width/wrap contract around titles and four action buttons; Auto-Scan inline `flex-wrap:nowrap` clipped controls, and 33vh mobile drawer rules cramped the chat.

## CTO implementation (isolated, not deployed)
Direct `status/status.html` fixes:
1. Bootstrap once before grid rebuilding, guard reinitialization, remove redundant action listeners, duplicate Copy definition, and direct tab handler. Retain one delegated fallback toggle.
2. Ask is single-flight with an AbortController, monotonically advancing request identity, and chat epoch; Clear invalidates and aborts stale Ask, and stale self-check/diagnose completion is ignored. The button says **Clear view**, because it does not delete server-persisted history.
3. Self-check uses only session-gated `POST ai/self-check?http=1` with `heal:false` and reads `READONLY_HTTP_SCAN_EVIDENCE_ONLY` when actually returned. One terminal message and guaranteed spinner cleanup. If bundle diagnostics are missing, report unavailable; do not falsely call an inventory healthy.
4. Per-route Diagnose uses only session-gated `POST ai/audit` with a constrained route **path**, never arbitrary outbound origin or the blocked `audit-and-heal`. This backend makes fixed-host `dev-proxy:80` HEAD requests, does not follow redirects, and never mutates routes. Only `LOCAL_HTTP_OK` with 2xx is "reachable", non-2xx `LOCAL_HTTP_NOT_GREEN` is "not green"; unreachable or malformed results are **unverified**, not green. Successful HEAD is **not** browser/user-experience health and is not self-healing.
5. Public `local_documentation` capability and chip wording reflect local-only/unavailable instead of claiming external AI/actual healing.
6. Responsive CSS wraps long route labels/actions, wraps Auto-Scan without clipping, gives mobile Calliope ~88dvh, and preserves a scrollable chat/composer. The Auto-Scan On/Off text now tracks its checkbox (persistence and actual scheduler behavior are separate).
7. Canonical `./smart-build.sh test:unit` includes one new 15-case P1 source contract test.

## Trust and acceptance
- **REQUIRED initial RED evidence**: against genuine V123 status source, 15/15 source contract cases were failing; against current isolated CTO HTML all **15/15 passed**, executed in a V8 in-process test harness against the exact GitHub blob. Three inline JavaScript blocks compiled in V8. This is **not** a claim of Node-native or full canonical suite on owner Mac.
- Independent isolated mocked event/request scenarios were exercised against extracted real function bodies: duplicate Diagnose and Self-Check attempts coalesced; HTTP 200/404/503 correctly classified; pending outcomes after Clear not appended; invalid/foreign route refused; Ask Enter storm sent one request and aborted/stale response was not appended. This is **not** evidence of actual DOM browser layout or a live route.
- No source acceptance becomes owner-visible success until **one canonical owner application** runs the accepted source, authenticated Ask/Self-Check/Diagnose work on that URL, and real browser visual QA at **375/768/1024/1440** in light/dark proves controls and scroll. Do not spin up a second server/app to pass UAT. Preserve all owner data/dirty work and bridge containment. Browser screenshots must be genuinely captured and included inline in the consolidated primary return, not invented or merely linked.
- The primary Cursor Engineer-I must validate, fix consequential test failures, retain single ownership, and return one full SHA/source/test/visual receipt. Specialists only if independently useful, actually launched, and safely isolated; provider run ID required to claim STARTED.
- No deployment, protected master merge, credential action, bridge reactivation, Messages send, HMAC/key rotation, LaunchAgent, Docker/ngrok/proxy/API or owner app mutation is authorized here. Full self-healing capability is **not restored** by this read-only V124; it needs an independently reviewed consent/authority boundary.
