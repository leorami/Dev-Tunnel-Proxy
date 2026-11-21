# V182 — Trusted observation lifetime before Calliope owner activation

**2026-11-21. CTO source-only trust contract. NOT DEPLOYED.**

## Verified starting source and owner priority

- GitHub repository: leorami/Dev-Tunnel-Proxy. Protected default main remains 590bcf2a980b434f533ddacac43a24a777a933e7.
- Genuine V181 primary #204 STARTED #7060361761 then RETURNED/STOPPED #7060564963. Reviewed V181 draft PR #205, exact engineer tip e5a31bd1e5969b020d4bfe0849f24d0fa456b52c. No accepted live release, original authenticated Calliope pixels or owner UAT.
- V181 source genuinely contacts an existing private, pinned Qwen3/Ollama model in a synthetic two-turn scenario. This does NOT prove the owner-authenticated running Dev Proxy uses that code.
- Owner P0 product mission #201: restore personality and honest intelligence first, limited independently verified healing second, incident playbooks third. Do not substitute screenshot infrastructure or a governance project for useful product progress.

## Consequential defect, read from committed V181 code

createCalliopeAskRuntime maintains a raw process-wide observations Map keyed by server-hashed owner session, independently of the brain's 32-session/expiry history. rememberAudit stores a verified HEAD summary with no time or capacity checks. getEvidence will continue citing that route status in a later model turn even if the HEAD is stale; and when a subsequent audit fails validation, rememberAudit leaves the previous result in place. A former HTTP 503 could therefore be represented as a current observation and steer a future repair decision. This is source-level correctness risk, not evidence of exploitation or current data disclosure.

## CTO implemented source contract

- Pure new utils/calliope-trusted-observation-cache.cjs, no HTTP, disk, Docker, credentials, commands, route edits or live state.
- Only trusted hashed 40-hex server-session keys. Normalizes input through existing rc2-calliope-grounded-followup verified-observation helper; never treats model/user text as new evidence.
- Server-owned observation timestamp (ignore provided candidate.at), fixed 5-minute TTL, 32-entry bounded insertion-order eviction, clock-rollback purge, failed/invalid new audit invalidation, explicit logout invalidation.
- GREEN pure unit tests tests/calliope/v182-trusted-observation-cache.test.cjs; intentionally RED runtime integration tests tests/calliope/v182-runtime-evidence-freshness-red.test.cjs on unchanged V181 runtime.
- A small GitHub Actions workflow independently checks the pure GREEN contract and documents expected integration RED; no secrets, live app or owner Mac.

## Trusted evidence semantics

One fixed-host HEAD response proves only a narrow status measured at a specific moment. A failed second HEAD must not silently retain the first result as its current status. Expired status may be discussed as explicitly historical narrative, never passed to the model as current trusted observation. The assistant must distinguish current verified facts, older conversation claims, hypotheses, and proposed new checks. No liveAttested or healingPerformed flag follows from a HEAD result.

Do not persist chat/HEAD evidence to repo, GitHub, logs or browser without separate consent. The existing browser Clear action explicitly says it clears local messages only; any future end-to-end deletion UX is separately owner-reviewed, not silently relabeled in this mini-sprint. Runtime logout already calls invalidate; preserve it.

## Integration and release boundaries

The primary Cursor agent should wire the cache only into utils/calliope-owner-session-runtime.cjs, using one trusted session-derived clock and the existing audit parser. Verify the V182 frozen RED tests go GREEN without weakening prior V181 owner auth, origin, fixed-model, no-tools, no-external-AI, session-isolation, chat one-send, and non-healing requirements. Show source-exact original private UI pixels only via a genuinely authorized private transport; never public GitHub Actions artifacts. If private browser transport is unavailable, label visual acceptance blocked.

No protected main merge, V181 PR #205 merge, runtime rollout, Docker/Nginx/ngrok/worker changes, new model downloads, credentials, production change or owner UAT from this source contract. An isolated source-ready draft PR cannot authorize them. Milestone 2 repairs remain separately scoped and consent-gated.