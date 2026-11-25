# V208 engineer completion — authorized host runtime and current recovery

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7158544130
CTO pin: `origin/cto/devproxy-v208-authorized-host-runtime-recovery-20261125@da997113c312c227d61eba5917e3cf37aa4eb521`
Handoff blob: `a0cf7af5984a6abe2808beb6ea9dc32cc8c09aaf`

Lane A: `CURRENT_IMAGE_EXPORT_INTEGRITY_VERIFIED` / `RESTORE_NOT_VERIFIED`
Lane B: `WORKER_NODE24_VERIFIED`
Lane C: `NOTIFICATION_BLOCKED_BEFORE_MUTATION`

No API, proxy, or ngrok restart. No nginx reload. No source deployment. No notification delivery and no bridge load. No second export. No second worker. The notification engine was not stopped.

## Lifecycle

Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7`. V207 remains RETURNED/STOPPED #271/7157773702 at `71ded43ec3a1326ae8b5cdfc46bcfad6b42b248a`, reviewed #276/7158074446. That branch was not edited. V208 READY / NOT STARTED was #271/7158302272. No V208 engineer branch existed before this start.

Work was done in an isolated worktree at the frozen pin. The dirty local `master` checkout was not used. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2` still matches. `CORE_PROTOCOL_LOCK.json` blob `1a13179679ce9cf1172ac1506f2d37019a4b021d`. `governance/consumers.json` blob `60d1ad8497f921333aa470ea794716070f6cfe69` still does not name Dev Proxy. This receipt does not claim registration, operational adoption, or confidential-portfolio verification. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`.

## Common gate

One running Config API, one proxy, one ngrok, one host worker, and one notification engine. The Node 18 API preimage container was still stopped. The notification bridge was not loaded and nothing was listening on its local port. The worker queue held one settled request/response pair with status `CONFIG_SET_DIGEST_MISMATCH`, `productionChangeAuthorized: false`, and `liveAttested: false`. Prepared, acks, and replay were empty. The singleton was mode 0600 and owned by the operator. The worker's parent was launchd, not a LaunchAgent.

The durable Node 24.22.3 darwin-arm64 binary still hashes to `ba7073582822078d8c90bca3facacc46690bc5366fab4b815aeef9148cd6e854`, reports `v24.22.3`, and is Mach-O arm64 mode 0555. Its ancestry through the per-project runtime directory is mode 0700 and owned by the operator. The official tarball still hashes to `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd`. Sequoia, using the existing private verifier, reports certificate `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356` not revoked and without an expiration, and one valid signature over `SHASUMS256.txt.asc` by that fingerprint. The Node release index fetched this turn still lists 24.22.3, dated 2026-11-10, as the newest 24 release and `security: true`. The Node 25.9.0 inverse binary is still present, mode 0555, hash `fba87e4402c55ea4fc7ca9b9838790c32534e3e77c9c7834c37073752d070678`.

The twelve on-disk worker files matched `REVIEWED_WORKER_CLOSURE_MATCH_SOURCE_ONLY`. `node --check` of those twelve with the durable binary: 0 failures. On the existing HTTPS listener: `/health.json` 200 `{"status":"ok"}`, `/` 200, anonymous `/devproxy/api/config/` 302, `/admin/check` 401, foreign-origin config 403, foreign-origin admin 403, foreign-origin health 200. The Config API container reported `v24.22.3`.

## Lane A — current private export, not a restore

The exporter's restricted environment and the interactive Docker context returned the same daemon id. Both live images were running. Combined image size was about 314 MiB, under the exporter's 8 GiB cap, and the volume had space. The durable `private-rollbacks` parent was the operator's directory, not a symlink, with an empty ACL and no extended attributes. It was mode 0755 and empty. Its mode was changed to 0700 and rechecked: same inode, owner, and empty listing. No recursive chmod.

One new exclusive stage was created and the exporter was invoked once with the durable Node 24 binary: `scripts/rc2-export-private-images.cjs --execute --owner-approved`. Exit 0. Stdout: `RC2_PRIVATE_IMAGE_EXPORT_CREATED_RESTORE_NOT_VERIFIED; NO_RESTORE; NO_DEPLOY`. The stage contains exactly `rc2-current-images.private.json`, `rollback-images.tar`, and `SHA256SUMS.private`, each mode 0600, one link, not a symlink. Archive size 83055616 bytes. `inspectPrivateImageArchive` returned `RC2_IMAGE_ARCHIVE_CHECKSUM_MATCHES_RESTORE_NOT_VERIFIED` with `restoreVerified: false` and `liveImageBindingVerified: false`. An independent `shasum -a 256` matched the private sum and the script's own recomputation: `ef09775d0b39fc0cb17b9613b312647f02743c0c7b3ece380c1490a32d39cff6`.

The pin's container ids and daemon-reported image ids matched live `docker container inspect` before and after the save. This Docker daemon's image id is not the config-blob digest: the two saved config blobs have different digests, and their filenames match those blob digests. The saved configs have no repo tags. Their rootfs diff ids and created timestamps match live `docker image inspect` for the pinned ids, in pin order. That is content binding, not a restore and not a full configuration or data recovery. The Node 18 image and the stopped preimage were still present afterward. No second export.

## Lane B — host worker runtime

Immediately before the signal: one `--serve` process, the same pin and epoch hashes, the same settled pair, empty prepared/acks/replay, one owned 0600 lock, and `REVIEWED_WORKER_CLOSURE_MATCH_SOURCE_ONLY`. One SIGTERM was sent to that process. It exited and unlinked its own lock. No SIGKILL and no manual lock removal.

One replacement was started with the same script, working directory, pin, and captured environment, using the durable Node 24.22.3 binary. After the launcher exited, its parent was launchd. The process text is that Node 24 binary, hash unchanged, `v24.22.3`. The new lock is mode 0600 and names that process. The pin and epoch hashes did not change. The settled pair's bytes did not change. Prepared, acks, and replay stayed empty. It was still the only worker after 60 seconds, and the closure still matched. No new signed live ticket was submitted.

Synthetic fixture `tests/security/rc2-v120-signed-refusal-cutover-integration.test.cjs` on this Node 24 binary: 3 pass, 0 fail, 0 skipped, exit 0. That fixture does not touch the live pin, queue, or process. Liveness is not a source-current claim and not a new live settlement.

Shared services after the restart: the same API, proxy, and ngrok container ids were still running; the notification engine process was unchanged; the bridge was still unloaded; the HTTPS checks above were unchanged.

## Lane C — notification engine, not migrated

`NOTIFICATION_BLOCKED_BEFORE_MUTATION`. No `launchctl` load or unload, no plist write, and `macos/install-notifications-engine.sh` was not run.

The loaded job is the existing wrapper, with keepalive and run-at-load. The wrapper selects `/opt/homebrew/bin/node` whenever that file is executable, so a configuration-only change cannot both keep the wrapper and select the durable Node 24 binary. The on-disk job file is a 90-byte one-element JSON array, not a property list (`plutil` reports an unexpected `[`). No separate valid engine job backup was found. The effective definition exists in the running launchd job and was copied to private evidence only. The engine was left on Node 25.9.0.

The bridge job is not loaded, its on-disk plist still lints, and its local port is not listening. Persisted engine state was readable JSON with `lastSatisfied` and `lastRunAt`. All 5 active rules already had a boolean satisfied bit, and `lastRunAt` was current, so a missing-state replay was not what blocked the lane. The wrapper and the non-bootstrapable job file did. The next unload or login cannot rebuild this job from the on-disk file. That risk was already visible in V207; the file's modification time is inside the V207 qualification window. It was not repaired here.

## Ordinary routes

The same unauthenticated HTTPS results held after each lane. The public status page was opened in a disposable browser tab and then closed. It shows the status UI, overview generated 2026-11-03 12:33 local, a route-conflict notice that could not parse details, and several route rows reporting localhost 503 and ngrok 503. Those are the previously deferred product issues, not a new outage finding from this migration. No login was submitted. This is not a signed-in journey and not owner UAT. No screenshot was committed. The disposable tab was restored off any device metric and closed; the existing tabs were left as they were.

## Origin evidence

- `SOURCE_CURRENT`: not claimed for this branch as the running product. The on-disk worker bytes still match the reviewed twelve-file closure. The worker process is now the durable Node 24.22.3 binary. The notification engine is still Node 25.9.0. The Config API container was already `v24.22.3`.
- `SINGLE_RUNTIME`: one Config API, one proxy, one ngrok, one host worker, one notification engine. The Node 18 API container is stopped. The notification bridge is not loaded.
- `NO_SHADOW_APPS`: no second API, proxy, ngrok, worker, or notification engine was left running.
- `REAL_APP_VERIFIED`: public health, root, anonymous denial, and foreign-origin denial match the expected unauthenticated behavior. The status page shows the deferred stale overview, unparsed conflict notice, and 503 rows. Signed-in journeys were not run.
- `OWNER_WORK_PRESERVED`: dirty checkout, queue, epoch, pin, notification state, and the running engine survived. The new private archive and the parent mode 0700 are the intended recovery artifacts. No owner data was reset.

Private inspect output stays outside git. No public screenshot.

STOPPED for independent CTO review. No further operational attempt is started from this receipt.
