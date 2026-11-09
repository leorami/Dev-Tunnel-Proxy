# DEVPROXY V124 — Engineer completion (Calliope single-flight chat, source-only)

## Outcome
**SOURCE_READY_OWNER_ROLLOUT_GATE** / **BROWSER_SOURCE_NOT_APPLIED**

## Lifecycle
- STARTED: PR #79 comment #6753233320
- Parent tip: `engineer/devproxy-rc2-controlled-release-20261104@ed0f578ea78bc934165ae7fe1d1177252b9857e5` (V123)
- Handoff: `cto/devproxy-v124-calliope-chat-observation-ux-20261109@c8649d0c5c05a6a8fb8a476040afcd4dc46d9ad4`
- Owner gate: **NONE** for source work; **NOT authorized:** deploy/merge · bridge operations · Messages/tokens · Docker/ngrok/proxy/API/worker/HMAC/LaunchAgent · protected master
- Specialist status: **NOT_SPAWNED**

## Source integrated (exact CTO blobs)
| Path | Git blob SHA1 |
|------|----------------|
| `status/status.html` | `fa4a84aeecb8fcf14a0162c593cd309ed0995fc5` |
| `tests/security/calliope-status-chat-singleflight.test.cjs` | `edba20f19307e875c21611f02cc7f3ab1f0e75b3` |
| `docs/architecture/DEVPROXY_V124_CALLIOPE_SINGLEFLIGHT_LOCAL_OBSERVATION.md` | (CTO import) |
| `docs/handoffs/DEVPROXY_V124_CALLIOPE_REAL_CHAT_AND_READONLY_DIAGNOSIS.md` | (CTO import) |
| `smart-build.sh` | ONE narrow unit hook for calliope single-flight test |

## V124 single-flight mechanisms integrated
1. **Ask with AbortController** (`activeAskAbort`): one in-flight Ask at a time; rapid Enter/second click coalesced; abort on Clear
2. **Self-Check single-flight** (`window.__pendingSelfCheck`): repeated Self-Check button clicks coalesce; no duplicate terminal replies
3. **Per-route Diagnose single-flight** (`window.__pendingDiagnoseRoute`): per-route gating; no duplicate diagnosis requests for same route
4. **Stale reply suppression**: Clear during pending Ask aborts controller; stale responses after Clear suppressed
5. **Protected observation**: `ai/audit` HEAD-only for diagnosis (no heal/write operations)

## V123 preserved
- Vendored Lucide/Marked/DOMPurify in `/status/vendor/` (no remote CDN execution)
- Route/config `escapeHtml()` in notification modals
- Chat markdown `DOMPurify.sanitize(marked.parse(...))`

## Native tests (Mac Node 22.19.0)
- focused `calliope-status-chat-singleflight.test.cjs` → **15/15 PASS** (CTO RED-first source contracts)
  - ✓ Single bootstrap and event set
  - ✓ One delegated Calliope toggle
  - ✓ Ask with AbortController and sequence
  - ✓ Stale reply suppression after Clear
  - ✓ Single-flight Self-Check
  - ✓ Single-flight per-route Diagnose
  - ✓ Protected ai/audit HEAD only
  - ✓ Honest local-only states
  - ✓ Auto-Scan toggle
  - ✓ No bridge/token handling
- `./smart-build.sh test:unit` → **exit 0** (calliope single-flight hook green)
- Inline JS blocks: 3 blocks parsed and compiled successfully

## Browser behavioral audit status
**BROWSER_SOURCE_NOT_APPLIED**

Working tree SHA: `fa4a84aeecb8fcf14a0162c593cd309ed0995fc5`  
Live runtime SHA: `d2fc2af05271073e777b103c7ce4c677b0165d64`

The integrated V124 source is in the working tree but **not deployed** to the live status page. The handoff requires:
> "If the corrected source is not live, report **BROWSER_SOURCE_NOT_APPLIED**, capture only read-only current-live baseline, and leave UAT gated; do not spin up another web app to simulate success."

Therefore:
- No actual click/async behavior testing performed
- No rapid Enter/Clear/Self-Check/Diagnose interaction verification
- No spinner/bubble/stale-reply observation on real UI
- No responsive 375/768/1024/1440 screenshots
- No theme/focus/scroll/overflow checks

## Deployment gate
The V124 source is **ready** with passing tests and verified mechanisms. A separate owner decision is required to:
1. Deploy the integrated `status/status.html` to the live status page
2. Perform browser behavioral UAT (Ask/Enter/Clear/Self-Check/Diagnose interactions)
3. Verify responsive behavior at multiple widths
4. Confirm no duplicate requests/terminal replies in practice

## Residual considerations
All 15 CTO source contracts pass. The integrated HTML preserves V123 vendor paths and escaping while adding V124 single-flight mechanisms. No visual/behavioral defects can be assessed without live deployment.

## Unauthorized actions NOT PERFORMED
- Production deployment / protected merge
- Bridge redeploy / re-enable / LaunchAgent operations
- Messages send / pairing token handling
- Docker / ngrok / proxy / API / worker / HMAC changes
- Local owner data / credential mutation
- Second test web app / simulated specialist runs
- Master merge / PR #127 incorporation

## Private artifacts (local only)
- `/private/tmp/v124-logs/` — test outputs + source status
