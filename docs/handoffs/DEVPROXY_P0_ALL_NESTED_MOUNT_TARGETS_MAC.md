# P0: Mac-safe all-nested-mount completeness before the SECOND owner-gated RO-source correction

## Ground truth / immutable pins

Repository leorami/Dev-Tunnel-Proxy. Approved product d89c962fb31a962a518f331bae458e63708e7e86, protected owner master 62a4d7babae986ade1feb0fd6dbe7dd32532523a. Approved initial proxy+API restoration returned Issue #10 comment 6597177845, but production API still has /app:rw and UID root. Its confidentiality checks pass, no Docker socket is mounted, 17 applications and ngrok remain stable. Read-only post-cutover evidence PR #48 @ ddc14a115f2f13457d3dfc7fd7ab158d32449831.

Latest genuine Engineer-I RETURNED draft PR #50 @ 05659c927d19b9499469c44aabea97531cf4124a: owner-decision-ready only, NOT DEPLOYED. Its Mac-specific correction changed rc1-empty-dotenv-target.cjs Git blob to aa691b831771cd7b0319d3cc6c20a514898869ce: /var is a symlink to /private/var on macOS; reject symlink stage/candidate LEAVES and verify realpath direct-child, not OS ancestor symlinks. Reported Mac Node22 11/11, canonical suite exit0, disposable API /app:ro smoke and existing sessions. Original one-time owner GO 6595948888 has been CONSUMED. A second live recreate requires a NEW GO.

## Actual source finding and CTO-owned code

Approved product Git tree tracks apps/, overrides/, and config/default.production.conf, but DOES NOT track .artifacts/ or build/sites-enabled/. A zero-byte .env target alone is not enough to guarantee Docker can attach all nested binds under /app:ro; missing dirs can repeat mountpoint EROFS. PR #50's disposable proof itself had to precreate .artifacts. Do NOT mistake this missing Git path for proof a specific private stage is missing it: inspect the actual candidate read-only.

This CTO branch is based EXACTLY on the Mac-corrected Engineer PR #50 SHA. New utils/rc1-nested-mount-targets.cjs checks approved existing product dirs/files; detects missing .env, .artifacts, build/sites-enabled; rejects symlinks, Git worktrees, populated or overpermissive dotenv and invalid boundaries. Only with explicit apply:true in an owner-private 0700 test-owned NON-LIVE candidate does it create empty directories 0700 and zero-byte regular .env 0600. All results productionChangeAuthorized:false, productionMutation:false, secretBytesRead:false. It never runs Docker, reads real credentials, edits source code, or alters current live services.

RED-first committed tests in tests/security/rc1-nested-mount-targets.test.cjs; native Node v22.16.0 RED exit1 then GREEN 21/21 exit0 with Mac-fixed helper byte for byte. New Git blob source 3315cb9ff298eee50f8d72bf95bb3a94511a4367; test 377ac7580d9c302665734d8ba4bd3cf9bbed4d26; Mac helper aa691b831771cd7b0319d3cc6c20a514898869ce. Exact blob hashes matched the independently executed local files. Canonical smart-build.sh test:unit hook added; full canonical suite on owner Mac NOT yet CTO-run.

## ONE primary Engineer-I remaining-only mini-sprint

GOAL: Prove COMPLETE nested bind destinations in an approved private Mac candidate and return ONE final second-cutover owner decision packet, NOT DEPLOYED.

CONTRACT GATE: First recheck actual latest primary Engineer-I status, Issue #10, draft PR #50 full SHA and this handoff full SHA. Preserve active work; no second primary. Never use the prior owner's one-time GO for another live recreate. No production up/down/restart, no global Compose, no live owner file write/delete probes, no owner .env/session reads or writes, no ngrok/bridge/master mutations, no raw Docker inspect environment or public tunnel probes.

STEPS:
1. Run on owner Mac: node --test tests/security/rc1-empty-dotenv-target.test.cjs tests/security/rc1-nested-mount-targets.test.cjs ; then ./smart-build.sh test:unit. If actual Mac failures appear, reproduce RED and fix only the narrow code on isolated Engineer branch.
2. Create a fresh private 0700, NON-Git, test-owned snapshot of approved RC1. Prove product-file digests BEFORE adding placeholders. Run apply:false and report the missing fixed-code target classes. Use apply:true only inside that private test-owned snapshot to create allowed empty mountpoint targets. Verify owner-only modes, zero-byte dotenv, no symlinks, no owner secrets, approved product files untouched.
3. Verify exact private origins-only overlay via read-only Compose config --quiet; then a UNIQUE disposable synthetic Docker stack demonstrating /app:ro with all actual required nested binds (.env RO, apps/sites RO, .artifacts RW, nginx/API config parity), API login/session, 17 app configs, loopback ports, and synthetic writes refused to source/owner-like .env. No running-container mutation or live probe.
4. Read ONLY safe live metadata needed to attest no new drift: approved proxy image, /app.RW, API 3001/3002 HostIp, 17 apps, unchanged ngrok/bridge. Prior supposedly read-only audit performed a temporary live source write; DO NOT repeat.
5. Commit ONE redacted source/test/receipt return on an isolated Engineer branch with exact full SHA, native exit codes, dry-run and disposable proof and only genuinely remaining owner decision. Return RO_ALL_MOUNTS_READY_OWNER_GO / NOT_DEPLOYED or RO_NESTED_TARGET_BLOCKED / NOT_DEPLOYED. No protected merge.

DOD: CTO independently compares actual committed return with this contract. Only then request fresh explicit owner GO for the smallest proven API-only /app:ro repair (proxy only if necessary), preserving owner credential, sessions, 17 apps, ngrok and bridge; fail closed rather than using insecure pre-RC1 image. Publishing this handoff DOES NOT launch Cursor.
