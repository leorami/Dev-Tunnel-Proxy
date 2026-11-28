# V209 engineer completion — notification runtime persistence

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7160052425
CTO pin: `origin/cto/devproxy-v209-notification-runtime-persistence-20261125@ec292aca2f2b27a40b4a6b6ca41448a5eafd34c3`
Handoff blob: `b1f019640e43685c0de114d6f31f7747b96a4dff`

Launcher qualification: passed, no product defect found.
Job recovery: `BLOCKED_ORIGINAL_DEFINITION_NOT_RECOVERED`.
No live wrapper copy, plist write, launchctl change, engine stop, bridge load, test notification, Docker action, export, or restore.

## Lifecycle

Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7`. V208 remains RETURNED/STOPPED #271/7158730786 at `d239adef10fed54237e456d8def5c0dea2f453ce`. Draft #277 was not edited. V209 READY / NOT STARTED was #271/7159682224. No V209 engineer branch existed before this start.

Work was done in an isolated worktree at the frozen pin. The dirty local `master` checkout was not used. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2` still matches. `CORE_PROTOCOL_LOCK.json` blob `1a13179679ce9cf1172ac1506f2d37019a4b021d`. `governance/consumers.json` blob `60d1ad8497f921333aa470ea794716070f6cfe69` still does not name Dev Proxy. This receipt does not claim registration or operational adoption. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`.

## Launcher

The pinned wrapper and `tests/security/v209-notification-pinned-runtime.test.cjs` were read. No correction was required.

Native `/bin/bash` is 3.2.57. On that bash the version pattern keeps literal dots (`v24X22Y3` does not match). BSD `/usr/bin/dirname --` accepts the durable binary's path, and `/usr/bin/shasum -a 256` output still yields the digest when the path contains spaces.

`node --test tests/security/v209-notification-pinned-runtime.test.cjs` under the durable Node `v24.22.3`: 5 pass, 0 fail, 0 skipped, exit 0. The same 5 passed again inside `./smart-build.sh test:unit`.

Additional synthetic checks used a copied wrapper and a fake engine only:

- A wrong digest did not execute the named binary.
- A no-pin invocation on this host selected the Homebrew Node 25 discovery path and exited `NOTIFICATION_RUNTIME_UNSUPPORTED` before the engine.
- With Homebrew Node and nvm hidden from that one process, no-pin discovery selected the durable Node 24 binary and forwarded arguments, including an argument containing spaces.
- An uppercase digest was rejected.
- `--version` was forwarded to the fake engine rather than consumed by the wrapper.

`bash -n` passed for `smart-build.sh` and `macos/dev-tunnel-proxy-notifications`. `./smart-build.sh test:unit` on Node `v24.22.3`: 53 groups passed, 0 failed, exit 0. That run is the local full unit suite. It is not the CI result.

CI already terminal on the frozen pin, before this receipt: source gate #45594849341 succeeded on Node 22 and Node 24, and auth parity #45594849277 succeeded. Earlier RED #45594643222 and implementation GREEN #45594742026 / #45594741996 remain as recorded by the handoff. This receipt commit does not touch a path those workflows filter, so it does not by itself re-run them.

The live wrapper was not replaced. Its git blob is still `5c35499cf96a1073e0a7205d07f64b793ffe2c80`, the pre-V209 wrapper, not the pinned blob `baf8b34af44b30f5985ea1e26d9b225bc9a90bd8`. Those bytes were copied into private evidence for a future inverse. Mode 0755.

## Job provenance

The on-disk engine job is the same inode created 2025-12-23. It was rewritten in place at 2026-11-25 02:56:17 local. It is now 90 bytes, mode 0644, one link, no ACL, no extended attributes, sha256 `2889db39f9b708caeaa3411379d6cd7ec266c3ba749c3dc047b6b64fc89f0047`. `plutil -lint` on a private copy reports an unexpected `[`. The bytes are a one-element JSON array. That element is the running job's program, and the program basename is the notification wrapper. The live file was not opened for write. Every `plutil` call used a private copy.

The V207 inspection command ran `plutil -extract Label raw`, then `plutil -extract ProgramArguments json`, then `plutil -extract RunAtLoad raw`, all without `-o`, on the live file. Its captured output printed the label, printed nothing for `ProgramArguments`, then failed `RunAtLoad` with "No value at that key path". The same sequence on a disposable plist leaves the label extract untouched, rewrites the file to a one-element JSON array with no stdout, and then fails `RunAtLoad` with that same error. The rewrite minute matches the captured V207 output file. V208 started after that mtime and did not write the file.

No repository script or test invokes `plutil -extract` or `plutil -convert`. The writer was that V207 inspection command. Future inspection of a live job file must copy it first, or use `plutil -p` or `plutil -extract ... -o -`. Directing `-extract` or `-convert` at the live file is a write.

The running job, from a read-only `launchctl print`, is in the user gui domain, state running, one run, keepalive, runatload, program inferred from one argument, stdout and stderr paths set, and job environment keys `OSLogRateLimit`, `NOTIF_POLL_INTERVAL_SEC`, and `XPC_SERVICE_NAME`. No working-directory field is present. The bridge service is absent and nothing is listening on its local port. The bridge's own on-disk file still lints and was not modified.

No second copy of the engine job exists under the durable private tree, the V207 or V208 evidence directories, or `private-rollbacks`. Time Machine's destination did not mount. The only local APFS snapshots are OS-update snapshots, not a job backup. The installer template and the printed job are not an executable rollback.

## Candidate and inverse

`BLOCKED_ORIGINAL_DEFINITION_NOT_RECOVERED`. No candidate plist, no inverse plist, and no cutover plan were written.

What survived is only the program argument. The printed job confirms keepalive, runatload, stdio paths, and one environment key that belongs to the engine, but it does not prove the absence of any other original key. Those settings cannot be invented.

The durable Node `v24.22.3` binary was re-checked and not executed as the engine. sha256 `ba7073582822078d8c90bca3facacc46690bc5366fab4b815aeef9148cd6e854`, Mach-O arm64, mode 0555. Its runtime directory ancestry is mode 0700 and owned by the operator. Developer ID Application: Node.js Foundation (`HX7739G8FX`), with Developer ID Certification Authority and Apple Root CA. The official tarball still hashes to `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd`. Sequoia verified one signature over `SHASUMS256.txt.asc` by certificate `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`, the same certificate as the Node release-keys copy, with no expiration. The Node release index fetched this turn still lists 24.22.3, dated 2026-11-10, as the newest 24 release, LTS Krypton, `security: true`. The Node 25.9.0 inverse binary is still present, mode 0555, hash `fba87e4402c55ea4fc7ca9b9838790c32534e3e77c9c7834c37073752d070678`, and its code signature is ad-hoc. None of this authorizes activation while the original job definition is missing.

## State and health

Engine state is valid JSON with `lastSatisfied` and `lastRunAt`. All 5 active rules have a boolean satisfied bit. Three are true. No active id is missing and no stale id remains. `lastRunAt` was current during the read. The state file is mode 0644. The engine log has not been modified for about 12.6 hours, so the historical firing lines in it are not a current send. The tail has no send-failure line. There is no pending-send queue in the state file.

The sender posts to the local bridge. The bridge is not loaded and its port is not listening, so a fire could not be delivered. No test message was sent.

A restart that loses state is not safe. `loadEngineState` falls back to an empty `lastSatisfied` when the file is missing or unreadable, and a satisfied rule is then treated as a new transition and sent. `writeJson` uses a non-atomic write. The file header's "first run sends nothing" comment does not match that code. Minimal proposal, not implemented: if the state file exists but cannot be parsed, skip evaluation instead of firing, and replace the state file by writing a temporary sibling and renaming it. That is not a launcher defect and was not changed here.

Unchanged after this pass: one engine still on Node 25.9.0, one host worker, lock mode 0600, replay empty, one Config API, the Node 18 API preimage still stopped, one proxy, one ngrok. HTTPS: `/health.json` 200 `{"status":"ok"}`, `/` 200, anonymous config path 302, `/admin/check` 401, foreign-origin config 403, foreign-origin admin 403, foreign-origin health 200. The existing private archive's checksum file matches `rollback-images.tar` (`ef09775d0b39fc0c...`) with `shasum -c` exit 0. No re-export.

## Decision

Do not copy the pinned wrapper into the live source and do not replace the engine job. The running Node 25 engine has to stay up, because the on-disk file cannot bootstrap it and a genuine original definition is not available. Origin registration and any later activation stay separate.

STOPPED for independent CTO review. No further source or operational attempt is started from this receipt.
