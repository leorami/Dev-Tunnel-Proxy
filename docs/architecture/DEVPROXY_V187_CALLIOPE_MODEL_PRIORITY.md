# V187 — Calliope is conversational first, deterministic explanations second

**2026-11-21 | source-only CTO correctness boundary | no host action or release approval**

## Verified state
V186 single primary issue #218 genuinely STARTED #7070801448 and RETURNED/STOPPED #7070843324. Its owner-Mac report says the accepted V185 generated API blob f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528 is installed and loaded after one controlled Config API-only restart; owner-authenticated Health/Reports API Ask returned usedAI:true/mode:local_model_readonly for two turns and a fresh session. These are primary-reported host observations; CTO has not independently obtained an authenticated private browser session, original UI pixels or process-level evidence. No live repair, protected main merge or owner visual UAT has been accepted.

## Distinct user-facing correctness defect
The V186 deployed source has a deterministic explanation gate BEFORE the local conversational model in its secure authenticated Ask handler:
- explainLocalCalliopeCapability(query) → if explained.ok, return immediately with usedAI:false.
- only after that does it try calliopeAskRuntime().ask(...).
The unchanged helper utils/rc2-local-calliope-observe-explain.cjs recognizes normal questions like "How can you fix a Next.js redirect loop?" and "What does a fixed-host HTTP HEAD observation prove?" and responds with a legacy static template. The real model is therefore never reached for precisely the repair/diagnostic questions that matter to the owner. This is independently demonstrated at exact source, not a claim of a captured live UI failure.

## Frozen behavioral contract
For an authenticated, bounded, Origin-allowed Ask in secure mode:
1. Attempt the private, pinned local model with server-created session identity and trustworthy bounded evidence. Never let user text create operations, URLs, sources, permissions or new model providers.
2. Only if the model is unavailable, invalid or fails its grounded reply gate, offer the existing deterministic capability explanation where applicable. Keep the existing documentation fallback otherwise.
3. The model success response alone gets usedAI:true/mode:local_model_readonly. Templates/docs must continue to have usedAI:false, and **all** code paths must have healingPerformed:false, productionChangeAuthorized:false, liveAttested:false and no shell/Docker/route action.
4. Existing owner session logout invalidation, observation TTL/eviction, trusted-Origin/auth priority and Health/Reports shared Ask remain unchanged.
5. Minimal exact-byte change: take the V186 installed API Git blob f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528 and **move exactly two preexisting explanation short-circuit lines** to after the successful local-model return and before existing doc fallback. No other application source change. Previous V186 seven-file owner GO cannot authorize a new install.

## CTO RED→GREEN contract
- Isolated CTO source-only branch from exact V186 handoff SHA 5ae606a7d57bb88eaade7646e955253821c04da3.
- Test tests/release/v187-conversation-first.test.cjs reads actual historical installed source Git blob, reconstructs immutable V185 output and verifies that two important normal prompts match the legacy deterministic template before model use.
- RED against inert compiler stub: [CI #44961786715](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/44961786715): one baseline PASS, three implementation assertions FAIL, zero skips (true source contract failures).
- Pure compiler utils/rc2-v187-calliope-model-first.cjs accepts ONLY the exact V186 loaded-API blob, fails closed on any drift/extra fields, produces candidate bytes in memory, moves only two specified lines, and exports **NO host/restart/merge/heal authority**.
- GREEN: [CI #44961829508](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/44961829508): 4/4 PASS, 0 fail, 0 skipped. CTO independently read the original GitHub job output.

## Distinct approvals and UAT
This is not a deployment. A source-only Cursor engineer should verify the compiler against all relevant existing M1 model/auth/session tests, add any truly missing narrow fake-model success/unavailable tests, return one draft PR and exact SHA. CTO must code-review its diff. Only after source acceptance is a **new** owner GO appropriate for a byte-pinned API-only update to the independently verified existing durable Config API mount with private backup, API-only recycle, and rollback. No Status/nginx/worker/tunnel/Compose/owner checkout changes. Original authenticated Health/Reports desktop/mobile pixels must be supplied over a real private channel before asserting owner UI UAT. Do not fabricate screenshots or use public Actions for owner-private images.

Do not broaden this into an autonomous healing project; M2 reviewed tickets and owner permission remain separate.
