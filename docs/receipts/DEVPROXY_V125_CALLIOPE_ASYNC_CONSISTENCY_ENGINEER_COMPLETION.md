# DEVPROXY V125 — Engineer completion (async history/cancel consistency, source-only)

## Outcome
**SOURCE_READY_OWNER_ROLLOUT_GATE** / **BROWSER_SOURCE_NOT_APPLIED** / **REAL_APP_VERIFIED UNKNOWN**

## Lifecycle
- STARTED: PR #79 comment #6753521540
- Parent tip: `engineer/devproxy-rc2-controlled-release-20261104@952cc09a3fd994e3697a1263442889a3d9aa3188` (V124)
- Handoff: `cto/devproxy-v125-calliope-returned-ux-consistency-20261109@35f0e1ca87e7f6e11ad33dbfbf7610afeafe3c6a`
- Owner gate: **NONE** for source/tests/read-only; deploy/UAT still require separate owner decision
- Specialists: **NOT_SPAWNED**

## Source integrated (exact CTO blobs)
| Path | Git blob SHA1 |
|------|----------------|
| `status/status.html` | `a9e1a54a0ca1587704ae7b9e283c83a7052fa153` |
| `tests/security/calliope-async-history-and-cancel-consistency.test.cjs` | `013556c210d207b30bd355da6822115ffdfdc82b` |
| `docs/architecture/DEVPROXY_V125_CALLIOPE_ASYNC_CONSISTENCY.md` | (CTO import) |
| `docs/handoffs/DEVPROXY_V125_CALLIOPE_ASYNC_CONSISTENCY_RETURNED_V124.md` | (CTO import) |
| `smart-build.sh` | CTO hook for async-history tests (V123/V124 hooks preserved) |

## Four regressions fixed (RED vs V124 → GREEN vs V125)
Against returned V124 HTML blob `fa4a84aeecb8fcf14a0162c593cd309ed0995fc5`: **4/4 RED**.
Against integrated V125 HTML: **4/4 GREEN**.

1. History response after Clear must not resurrect old bubbles (`historyEpoch` / `chatEngaged` gates)
2. Idle status chip must not claim it stopped work on cancel HTTP 200
3. Distinct routes not dropped while another route is observed (`diagnosisInFlight` Set; status stays Checking)
4. Initial history fetch cannot append after new user interaction

## Native tests (Mac Node 22.19.0)
- focused `calliope-async-history-and-cancel-consistency` + `calliope-status-chat-singleflight` → **19/19 PASS**
- `./smart-build.sh test:unit` → **exit 0** (async-history hook green)
- Safety scan: no `audit-and-heal`; no “I've stopped” fabrication; `ai/audit` HEAD-only comment retained
- V123 vendors preserved (`/status/vendor/{lucide,marked,purify}.min.js`)

## Runtime / visual
- Worktree: `a9e1a54a0ca1587704ae7b9e283c83a7052fa153`
- Live status page still: `d2fc2af05271073e777b103c7ce4c677b0165d64`
- **BROWSER_SOURCE_NOT_APPLIED** — no redeploy, no shadow preview, no 375/768/1024/1440 screenshots

## Unauthorized actions NOT PERFORMED
Deploy · protected master merge · bridge restore · Messages/tokens · Docker/ngrok/proxy/API/worker/HMAC/LaunchAgent · alternate test app · merge of draft PR #131/#132 as product · specialist simulation

## Owner rollout gate
Deploy integrated `status/status.html` only with separate owner approval, then UAT: Clear-before-history, type-before-history, idle cancel chip honesty, same-route coalesce, distinct-route concurrent HEAD, Checking while other route pending.
