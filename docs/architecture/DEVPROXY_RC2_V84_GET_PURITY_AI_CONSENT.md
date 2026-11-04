# RC2 v84 — audited GET purity and external-AI consent boundary (independent CTO lane)

**Source-only; never deployed. Not an Engineer-I assignment, not a new release gate for the current v83 run.** Isolated from the active v83 Mac spool/worker task. The branch base is actual returned Engineer-I `33b03657274a8c25c18a9d4eb57a1083880c73e4`, NOT the unaccepted v83 branch. Do not cherry-pick or dispatch this until the primary completes v83 and CTO reviews the actual returned diff.

## High-consequence defects verified by source review

1. The secure-mode management guard in `utils/rc2-management-safety-policy.cjs` did not deny `POST /ai/reindex`. `utils/proxyConfigAPI.js` collects and chunks local documents, sends embeddings through `embedChunks` to externally configured OpenAI, and writes the resulting index. Administrative authentication does **not** establish owner approval for external AI data transfer. The previous security test mistakenly asserted this operation was allowed during production/spool mode.
2. Secure mode did not deny a debug-only `POST /ai/thoughts/inject` route that can synthesize assistant thoughts and distort the operational status display. This is not required by production management.
3. `GET /apps/diagnostics` and `GET /apps/active` ran `generateAppsBundle.js` when no diagnostic artifact existed. A supposedly observational GET could mutate the generated nginx routing bundle without the v13/RC2 signed settlement and verified reload boundary.

## CTO code, not merely requirements

- Harden the existing authenticated management guard to refuse `ai/reindex` and `ai/thoughts/inject` in spool/production security mode, including when legacy allow flags try to override it. Preserve health, route inventory, transactional install/create-route/regenerate and the development-only nonsecure behavior.
- Implement `utils/rc2-readonly-bundle-diagnostics.cjs`: only preexisting bounded JSON from a non-symlink, single-link, stable regular inode; read through `O_NOFOLLOW`; verify file identity before/after. No hidden write, spawn, Docker command, network or automatic regeneration.
- Replace the two GET handlers in the actual `utils/proxyConfigAPI.js`: success reads the existing artifact, missing/unsafe data returns explicit 503 instead of pretending routes were regenerated. Users can request an explicit, authenticated transactional `POST /apps/regenerate` where it is already supported.
- Correct the inherited security expectation for reindex; add RED-first focused tests for the new denylist and read-only artifact, including GET source integration checks.

## Acceptance and compatibility caveats

- The two diagnostic GETs **change behavior when an artifact is missing**: previously they implicitly generated; now they return 503. This is intentional security containment, but must be checked against the dashboard and any owner workflows before inclusion in a release.
- External AI indexing stays available only outside protected production/spool mode, subject to separately required user consent and governance; this branch does not authorize an external model or restore AI-healing parity.
- No host credentials, Docker socket, HMAC spool, launchd agent, ngrok, worker, protected master or running owner state is read or changed by publication. No feature-parity GO or owner UAT from source fixtures.
- Before later integration, inspect the accepted actual v83 Engineer return and reconcile any touched API/test/policy files, run the canonical `./smart-build.sh test:unit` on the Mac and validate the owner dashboard with missing and present artifacts. This isolated CTO work must not displace the current release objective.

## Evidence

- Source check used actual returned Engineer-I GitHub state, not an old master snapshot.
- RED-first local Node22 tests reproduced unintended allowance of reindex/debug injection and missing read-only reader; after correction, 13 focused behavior tests passed (full API source-contract test awaits checkout). The modified 135,780-character API was independently V8-parsed and all committed changed-file bytes read back through GitHub.
- No full checked-out repository, Mac native suite, browser runtime, owner UAT, or deployment is claimed.
