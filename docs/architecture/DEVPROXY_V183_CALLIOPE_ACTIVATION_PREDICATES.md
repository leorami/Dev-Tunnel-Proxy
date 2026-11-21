# Dev Proxy V183 — Calliope activation predicates and source-vs-loaded identity

**2026-11-21. Source-only evidence contract. NO MERGE, NO DEPLOY, NO CREDENTIAL TRANSFER.**

## Verified GitHub source
- Protected default `main@590bcf2a980b434f533ddacac43a24a777a933e7` includes completed V180 browser fidelity but not new Calliope local-model integration.
- Source candidate `cto/devproxy-v183-reviewed-calliope-source-candidate-20261121@95017398f6d1d64f4fc43b89e264641604e08fba` (draft PR #209) is an exact no-byte-change branch of returned V182. Git compare main..candidate: 14 commits, zero behind, 20 changed files. It includes V181 model/persona and V182 bounded trusted observations.
- V181 #204 STARTED #7060361761 → RETURNED/STOPPED #7060564963; V182 #207 STARTED #7061266010 → RETURNED/STOPPED #7061298085; CTO independently reviewed the exact V182 diff and actual unskipped GitHub CI jobs; no production rollout or owner UAT yet.
- Genuine local Ollama Qwen3 4B synthetic 503 two-turn exercise was recorded in V181. This proves model capability in that fixture, **not** owner-browser usage or production model wiring.

## Concrete security trap in historical Compose
The repository's `docker-compose.production.yml` still configures `proxy-config-api` with `user: root`, a Docker socket mount and inline Docker CLI. Never merge that historical Compose onto the hardened RC2 candidate or infer that the owner's actual running Mac uses the unsafe layout. **This is a source hazard, not an observed live exposure.** The reviewed `utils/rc2-production-compose-candidate.cjs` generates a separate two-service hardened manifest: nonroot user, read-only code, `cap_drop: ALL`, no Docker socket, narrow writable owner data, loopback published ports, immutable image SHA and `DEVPROXY_DENY_INLINE_DOCKER:'1'`. The effective owner-host installed manifest must be inspected by the authorized Mac-based primary before proposing activation, with secrets/host paths withheld from public evidence.

## Activation trust matrix: all distinct
1. **Source-reviewed**: exact GitHub blob/commit, complete diff, unskipped tests and owner approval for protected merge.
2. **Installed source**: actual Mac source checkout and Docker-mounted file hashes read back after a permitted source-stage operation; GitHub SHA is not evidence of installation.
3. **Loaded process**: live PID, startup timestamp, container ID/image and independent runtime behavior bound to the intended source. Disk hashes alone **cannot** prove Node loaded new code.
4. **Runtime policy**: signed-in owner session, trusted-Origin protection, `inlineHostDockerUnavailable()` active, no remote model/network transfer, no tool/worker/shell mutation, no Docker socket, no public AI port, separate HMAC owner-control perimeter.
5. **Real owner experience**: actual signed-in Calliope 503→followup conversation with original private desktop/mobile pixels, screenshot provenance and one-send-one-reply; may be reviewed only through an approved PRIVATE transport, not public Actions.
6. **Privileged action**: distinct owner GO for merge and for release, with rollback and actual route/browser parity; source status and tests do not grant either permission.

## Source-only preflight disposition
Perform an owner-host **READ-ONLY** check of existing runtime metadata and approved routes before a consequential release request. Classify `SOURCE_STACK_READY_FOR_OWNER_DECISION` only if all *pre-release* predicates are evidenced, or `RELEASE_PREFLIGHT_BLOCKED` with one concrete first-cause if not. Do not mark owner UAT green before release. If container's code is still old, call it `SOURCE_NOT_INSTALLED`, not a proxy outage. Do not remediate production in a read-only preflight. No source files, credentials, secret values, private paths, screenshots or host hashes should be published to a public repo if they create owner privacy or security exposure.
