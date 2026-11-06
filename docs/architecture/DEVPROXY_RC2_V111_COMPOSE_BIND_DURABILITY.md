# RC2 V111 — production Compose must reject ephemeral host bind sources

## Owner-action and primary state
**OWNER ACTION GATE: NONE — all existing scoped recovery/HMAC/HTTPS grants are already recorded.** Sole primary Engineer-I V110 is actively STARTED/IMPLEMENTING the approved NEW HMAC epoch and durable Dev Proxy recovery (PR #79 #6674333983 / #6674374075). This CTO change was developed on its own branch from the last genuinely RETURNED primary V108 SHA `de001e1d4f665f1bdc41241db826cb5010c55a54`. No Mac Docker, worker, ngrok, HMAC, live config or protected master changes occurred. **Do not import this PR during active V110 or turn it into another release gate.**

## Independently verified gap
V108 added a pure source-only `assessLiveDurableMountPaths()` helper that rejects temporary host mount sources; however `utils/rc2-production-compose-candidate.cjs`, which actually assembles the production Docker Compose bind-mount entries, still accepted all syntactically valid absolute paths, including `/private/tmp`, `/tmp`, `/var/folders` and their prefixed equivalents. With no integration, the earlier durable helper could pass in a separate report while a production candidate still reintroduced a temporary nginx overlay/secret/spool bind. This is a real code path and recurrence risk after the owner-confirmed reboot; **not proof V110 used such a path**.

## CTO RED-first patch
1. Added four adversarial tests to `tests/security/rc2-production-compose-candidate.test.cjs`: reject each of 14 paths under all eight ephemeral host-root families; reject casefolded temporary paths for case-insensitive Mac volumes; preserve allowed similarly-named non-temporary directories; preserve the API container's **internal** `tmpfs('/tmp')`, which is not a host bind.
2. Before changing the source, ran full test file through a local isolated JS/V8 harness with a POSIX path-normalization substitute. **21/23 passed, 2/23 RED** for previously accepted temporary host bind sources (the other two new tests passed).
3. Patched `utils/rc2-production-compose-candidate.cjs` *at the actual production candidate generation boundary*. Every host path now must pass a segment-boundary-aware ephemeral-root rejection, including casefolded `/private/tmp`, `/tmp`, `/var/tmp`, `/private/var/tmp`, `/var/folders`, `/private/var/folders`, `/dev/shm` and `/run/user`. No change to Docker service count, image digests, API UID, ports, networks, restart policies, secret or source mounts beyond path validation. Existing valid `/private/devproxy/...` fixture remains supported.
4. After patch, reran the same isolated harness: **23/23 GREEN**, including all existing 19 tests plus four new tests. **NOT native Node22, `./smart-build.sh test:unit`, Compose config, Docker Desktop or owner Mac.** The next normal engineering integration boundary must run the native focused file and canonical build before adopting it.

## Explicit boundaries and coordination
- This patch is not part of V110 live recovery, does not authorize any production action, and must not slow down restoring the owner-approved existing services.
- When V110 returns, independently review its actual returned source and runtime receipts first. If the new durable stage is genuinely proven and production recovered, integrate V111 as a follow-up source validation improvement, not as an emergency second recreate.
- The owner-reported app-upstream startup failure remains P2 issue #109, explicitly deferred. The laptop restart and disappearing temporary bind sources are separate observations.
- If a required private path is still transient, the guard must fail closed; do not rename it to evade validation or fabricate user permissions.
