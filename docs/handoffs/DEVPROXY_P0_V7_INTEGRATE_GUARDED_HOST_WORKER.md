# Dev Proxy P0 - v7 crash-safe fixed host worker integration (nonlive)

## Source, evidence and authority

Repo: `leorami/Dev-Tunnel-Proxy`. Execute only at the verified full SHA in the
one-line dispatch. Base is latest primary Engineer-I **RETURNED**, PR #63
`engineer/devproxy-p0-v6-bind-ipc-nonlive-20261103@012aac8b17ca057f6abbcb2c1d4a28b878000ae8`.
Its accepted label is `SOURCE_CONTENT_BINDING_VERIFIED / NOT_DEPLOYED`, with
`MAC_SHARED_BIND_PENDING` for production transport. Preserve PR #61's host
Unix-socket blocker, PR #59's disposable route activation proof and PR #63's
nonlive composition: do not repeat or discard them.

CTO already delivered: `utils/rc1-host-operation-quarantine.cjs` +
`tests/security/rc1-host-operation-quarantine.test.cjs` (17 passing Node 22.16
regressions, 1 RED missing-module receipt) plus design canon. Source is on
this isolated CTO branch; do NOT recreate it in Cursor.

## One primary Engineer-I: remaining work

**Goal:** Source-integrate the CTO crash fence with the existing v6 authenticated
file spool and fixed host worker **in nonlive/test-owned mode**, keeping
per-request HMAC/replay and preserving future production trust boundaries.
One primary remains integration owner; assess genuinely independent read-only
specialists but do not manufacture starts.

1. Check newest actual primary status, parent return comment and full PR/branch
   SHA before source edits. If an assignment is already active, preserve it.
2. Source-review current `utils/rc1-activation-spool.cjs`,
   `utils/rc1-fixed-activation-host-worker.cjs`, the v6 HMAC codec and the CTO
   v7 durable guard. Do not rewrite working v6 modules unnecessarily.
3. Integrate a nonlive host-only composition, with an explicit owner-private
   pre-provisioned crash fence. Guard the **entire** actual fixed-action
   sequence, including known-good candidate digest and real route verification.
   Ensure no signed response or status can claim reload success until the
   trusted result is durable. Preserve previous v6 diagnostic statuses only
   when they are demonstrably pre-reload safe. Failure during/after reload
   must remain indeterminate and quarantined.
4. RED-first tests for distinct simultaneous signed request IDs (including
   separate host worker instances), crash/timeout, replaced sentinel, benign
   validation failure, forged positive reply, unchanged route file bytes,
   and absence of Docker socket or unexpected side effects. Run the CTO
   17-test suite, existing v6 43 tests and project canonical
   `./smart-build.sh test:unit`. No duplicate app or hidden preview server.
5. **No** live host worker installation, long-lived process, Docker action,
   owner `.artifacts` write, new listener, sidecar, API env change, nginx
   reload, protected merge, credential access or service recreation. If Mac
   one-shot file visibility needs ungranted owner-only authority, report
   exact `BLOCKED_TEST_BIND_AUTHORITY` without redoing the proven PR #63 probe.
6. Maintain `allowConfigEdit:false`; keep transaction cleanup and rename
   fail-closed until separately proved. Check Origin's five runtime gates:
   SOURCE_CURRENT, SINGLE_RUNTIME, NO_SHADOW_APPS, REAL_APP_VERIFIED and
   OWNER_WORK_PRESERVED. Unknown is NOT PASS.
7. Return ONE GitHub-linked `STARTED -> VERIFYING -> RETURNED` receipt at
   exact final 40-character SHA, source diff, tests with exit codes, synthetic
   vs Mac vs running-owner evidence, actual specialist status, and
   `NONLIVE_GUARDED_HOST_WORKER_VERIFIED / NOT_DEPLOYED` only if all
   test-owned integration requirements pass; otherwise factual BLOCKED.

## Release / UI / owner gates

No production GO or protected merge. The original live RC1 owner GO was
consumed. Actual Mac host transport ACL/UID, owner-authorized worker startup,
nginx worker state, exact mounted source and owner UAT remain separate gates.
No UI change is in scope; if an implementation unexpectedly touches any UI,
Engineer must return actual source-exact screenshot bytes from the sole
canonical app, and CTO must personally open/visually approve before owner UAT.

Stop after one complete consolidated return. The CTO will code-read committed
diffs and tests before deciding on any further engineering instruction.
