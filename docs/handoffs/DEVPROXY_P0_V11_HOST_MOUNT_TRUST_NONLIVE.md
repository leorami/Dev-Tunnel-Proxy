# Dev Proxy P0 — v11 trusted Mac host Docker mount attestation, NONLIVE

## Source and prior return

Repo `leorami/Dev-Tunnel-Proxy`. Execute only at the exact FULL SHA provided in the one-line handoff, and FIRST fresh-check Engineer-I lifecycle and GitHub HEADs. Base is actual returned Engineer-I PR #71 `engineer/devproxy-p0-v10-nonlive-loaded-config-identity-20261103@c20c1eeb1f2c87297a37e04e0eac46777f8a66a5`, accepted only as `NONLIVE_LOADED_CONFIG_IDENTITY_VERIFIED / NOT_DEPLOYED`. Preserve Engineer #71's 292/292 Mac fixture report and all previous accepted v8-v10 work, not repeat them. There must be one primary Engineer; no fake specialists or launches. Protected master stays at `62a4d7babae986ade1feb0fd6dbe7dd32532523a`; original issue #10 production GO `6595948888` is consumed.

## CTO has already written and RED-tested the consequential source

- `utils/rc1-host-mount-locked-docker-driver.cjs`: composes the ALREADY PRESENT `utils/host-execfile-adapter.cjs`; verifies full target ID, full image SHA, running, NON-privileged, ALL exact private host bind mount sources and RO/RW flags before/after fixed nginx test/reload. Strict no new mount and no Docker socket. Bounded no-shell subprocess calls; explicit per-action external authorization callback required. `ownerAuthorizationEstablished:false` is deliberate and cannot be promoted by synthetic tests.
- `tests/security/rc1-host-mount-locked-docker-driver.test.cjs`: contract regression suite, including post-action mount drift, unsafe privilege, missing auth, invalid inputs and bounded cancellation.
- `tests/security/rc1-host-mount-closure-gate.integration.test.cjs`: source-shaped v9/v10 loaded configuration and effective include graph + actual host Docker args through a FAKE execFile callback. No Docker daemon, no owner data or second app.
- `docs/architecture/DEVPROXY_P0_V11_EXACT_MAC_HOST_MOUNT_TRUST.md`: trust limitations and exact conditions.

## One primary Engineer-I assignment, bounded and nonlive

1. Verify return/assignment lifecycle and exact full branch SHA. Read the CTO-authored code and parent v10 nonlive composition. Do NOT recreate CTO code; preserve ongoing work if a new assignment is already active.
2. On owner Mac, run the focused v11 RED-first suites + the existing v10 original integration suites and canonical `./smart-build.sh test:unit`. No live Docker action from those tests: injected fake execFile callbacks are required.
3. In a source-only, test-owned nonlive composition, wrap the v10 `createClosureGatedHostDriver` with the new `createMountLockedHostDockerDriver` (actual fixed adapter but **fake** execFile); test signed v6 spool, v7 fence and v8 route mutation using 17 synthetic routes without starting an alternate app/stack. Preserve `allowConfigEdit:false` and all existing v10 helpers and source.
4. RED-first test denial when an additional image/root filesystem mount appears, a required config bind turns RW, privileged=true or the full container/image pin changes; test cancellation after nginx-test and post-reload inspect drift; tests must not leak any PRIVATE expected mount Source to logs/responses. Re-run known positive path with the only fixed `docker exec <full-id> nginx -t|-s reload` argv under fake process.
5. Optionally perform a **read-only** comparison of the CURRENT Mac `docker inspect` mount metadata to the expected configuration if existing authority permits; DO NOT gather/dump owner route contents or credentials, and do not invoke Docker exec/nginx live. Distinguish actual Mac RO observation from synthetic test evidence. If an owner-only grant or private path is missing, report a bounded blocker rather than creating it.
6. Confirm five Origin runtime fields each; UNKNOWN is not PASS. Any UI touch is outside scope and cannot be owner-accepted without source-exact real screenshot bytes personally inspected by CTO.
7. Return one consolidated GitHub STARTED -> VERIFYING -> RETURNED receipt with full 40SHA, committed source, tests/exit codes and evidence class, actual blocker, and label `NONLIVE_HOST_MOUNT_ATTESTATION_COMPOSED / NOT_DEPLOYED` only if all checks pass. No owner UAT.

## Hard stop

No privileged host worker install, no long-running Mac worker/launchd, no Docker engine socket in containers, no new network listener/tunnel/sidecar, no OWNER .artifacts, `.env`, sessions or private route read, no production API wiring/reload, nginx live test or deploy, no protected merge, no PR #71 work duplicate, no consumed GO reuse. Retain v10 known incomplete image `mime.types`/modules and v7/v8 cross-process content lease issues as explicit NON-GO release boundaries. A correct test result is not a production permission.
