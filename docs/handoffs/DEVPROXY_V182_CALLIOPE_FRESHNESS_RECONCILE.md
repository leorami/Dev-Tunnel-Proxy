# V182 — finish Calliope M1 source trust before real owner activation

**PREPARED / NOT STARTED. ONE PRIMARY Cursor Engineer-I.** This is the narrow next integration of the actually RETURNED V181 work, not a re-run of V181. No Cursor session is launched by GitHub artifacts.

## Goal and immutable base

Complete one safety-critical source defect in the real Calliope local-model conversation: do not use old, invalid, cross-session or unlimited cached HTTP HEAD observations as current evidence. Preserve the restored personality and model conversation. No UI redesign, new auth boundary, self-heal or generic hardening.

Repo: leorami/Dev-Tunnel-Proxy. Actual V181 engineer source: engineer/devproxy-v181-calliope-grounded-local-brain-20261121@e5a31bd1e5969b020d4bfe0849f24d0fa456b52c (draft PR #205). V181 #204 genuine STARTED #7060361761 -> RETURNED/STOPPED #7060564963. Protected default main@590bcf2a980b434f533ddacac43a24a777a933e7 remains untouched. CTO contract branch cto/devproxy-v182-calliope-evidence-freshness-contract-20261121. The issue will supply its exact final 40-character SHA; check remote branch tip before executing. Read docs/architecture/DEVPROXY_V182_CALLIOPE_EVIDENCE_FRESHNESS.md and root AGENTS.md. Check fresh GitHub receipts for a newer active primary; if one is active, STOP before starting this assignment.

## Frozen CTO code and tests

- utils/calliope-trusted-observation-cache.cjs — already implemented PURE cache. Do not loosen key validation, TTL, size, input normalization, invalidation, time ownership or non-mutation rules.
- tests/calliope/v182-trusted-observation-cache.test.cjs — pure helper GREEN gate: expiry/clock regression, malformed observation clear, 32 session cap, explicit invalidate.
- tests/calliope/v182-runtime-evidence-freshness-red.test.cjs — frozen full runtime RED gate on V181: after five minutes past HEAD, a new Ask sees no current obs; a subsequent failed HEAD clears previous 503; oldest of >32 session observations evicted; logout clears both evidence and history.
- .github/workflows/calliope-v182-observation-lifecycle-contract.yml — proof of pure GREEN and expected original RED on CTO branch; Engineer should make integration test GREEN and update CI assertion to normal GREEN at its own branch once fixed.

## Required steps (RED first)

1. Recheck genuine latest primary STARTED/RETURNED/STOPPED, main and PR #205 remote HEAD (full SHA); do not supersede an active primary. Work in one isolated new Engineer branch from this exact CTO tip, not in V181 Engineer's branch. Keep one consolidated GitHub-linked lifecycle.
2. Run node --test tests/calliope/v182-trusted-observation-cache.test.cjs and record GREEN. Run node --test tests/calliope/v182-runtime-evidence-freshness-red.test.cjs before integration; demonstrate the actual stale-503 / failed-audit / capacity assertion failures. Syntax/import failures are NOT acceptable RED proof.
3. Modify ONLY utils/calliope-owner-session-runtime.cjs as necessary to adopt createTrustedObservationCache({now}) in place of the separate unbounded observations Map. Extend createCalliopeAskRuntime options with an injectable trusted now for deterministic tests. getEvidence reads only current records; rememberAudit always updates/clears even after failed parse; invalidate drops both model history and evidence. No browser-provided session IDs, dates, URL, tools or model endpoints.
4. Preserve provenance in observationEvidence: report that HEAD was measured at a server timestamp, and that it is read-only and not a live GET/browser confirmation. Never claim a stale HEAD proves the route is currently broken or healed. If the HEAD is unavailable, say so and offer one new safe check.
5. Run V182 frozen integration tests GREEN without altering assertions, plus original V181 focused 8+4+2, auth tests and ./smart-build.sh test:unit. Make the V182 CI integration step require GREEN on the engineer PR; the CTO branch original expected-RED check must not be misrepresented as the finished requirement.
6. Inspect the real signed-in Status/Calliope interface when a legitimately authenticated owner test channel is available and verify one-send/one-response, 503 -> follow-up, same-session context, no cross-session leakage, model failure fallback and no false healing. Original private screenshots and exact source-matched snippets MUST be shown inline to CTO/owner via a truly authorized private channel; never publish them to a public GitHub artifact. If private browser transport is not possible in this assignment, return BLOCKED_VISIBLE_PIXEL_TRANSPORT and do not claim UI acceptance.
7. Return one integrated draft PR, full HEAD SHA, actual unit/integration/browser/CI receipts with skips, exact remaining risks, host model/runtime status, reviewer-readable diff, and one STOPPED or RETURNED receipt. Optional specialist: read-only inspection of private image transport only if a genuine provider can be launched, with separate identity and no shared-source writes. If no useful specialist, report NOT_SPAWNED_NOT_BENEFICIAL.

## Explicit stop and owner authority

Source-only. No protected main merge, PR #205 merge, production activation/restart, nginx/Compose/ngrok/worker changes, model install/download, credentials, remote AI, broad healing, new public port, live security action, other project repo writes, private pixels on public GitHub, owner checkout reset or owner UAT claim. This source task does not grant live release authority. On completion, CTO must inspect actual returned diff and tests; only then decide the separate owner activation/UAT boundary.

## Completion criteria

Frozen V182 runtime assertions GREEN; no unsupported current-observation claim after five minutes, invalid second probe, eviction or logout. V181 source behavior remains GREEN. Return one consolidated exact-SHA evidence report. If browser access is blocked, source can be accepted separately from UI. DO NOT manufacture a new iteration after these tests pass.

## Exact single-primary handoff

Execute origin/cto/devproxy-v182-calliope-evidence-freshness-contract-20261121@<VERIFY_FINAL_REMOTE_FULL_40_SHA>:docs/handoffs/DEVPROXY_V182_CALLIOPE_FRESHNESS_RECONCILE.md exactly as written.