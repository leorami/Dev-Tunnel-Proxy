# V206 engineer completion — host worker runtime and current recovery

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7154982537
CTO pin: `origin/cto/devproxy-v206-supported-worker-and-recovery-20261125@663a7b8f0ddc9ae9a43231de4a75d15b10784e3b`
Disposition: `QUALIFICATION_RETURNED`
Recovery: `CURRENT_RECOVERY_STALE`

No worker stop or start. No launchctl change. No Docker create, recreate, reload, retag, export, restore, or prune. No queue, lock, pin, or HMAC change. No second app. The decision packet below is not a grant.

## Lifecycle

Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7`. V205 remains RETURNED/STOPPED #271/7154564192 at `90f4d820ccd7c3830ec9f60e570311dd99787b62`, reviewed #273/7154770393. That branch was not edited. V206 READY / NOT STARTED was #271/7154791503. No V206 engineer branch existed at start.

Worktree `/private/tmp/devproxy-v206-20261125` was detached at the frozen pin. The dirty local `master` checkout was not used. Trajectory #90 latest note #7154401750 keeps mandatory CTO visual evidence and leaves private Dev Proxy Room integration deferred (#7152978945). Not edited. V202 remains RETURNED/STOPPED #265/7148509024. Not activated. Logan #233 latest note #7153577327 is Plan182 READY / NOT STARTED. Not edited. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2` matches this pin. `governance/consumers.json` at that commit still does not name Dev Proxy. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`.

## Running API, unchanged by this assignment

Docker context was the existing one. One running Config API. The Node 18 container is stopped.

| Surface | Observed |
| --- | --- |
| `dev-proxy-config-api` | Running `5029fb45374218a62b57e00006b67cf1667ec746c909590bb776d7fe32f2e46d`. Image `sha256:f44b069ce4b5d00cb4f7dff81821a4a6953e3790420040abf300139b1d317c6c`, `linux/arm64/v8`, image `NODE_VERSION` 24.22.3. Process `v24.22.3 arm64` uid 504. User `504:20`, read-only root, `cap_drop ALL`, `no-new-privileges`, private IPC, restart `unless-stopped`, loopback 3001 and 3002. Started 2026-11-25T06:10:55Z. |
| Loaded API source | Same eight bind mounts and the same mount sources as the stopped preimage. `utils/proxyConfigAPI.js` sha256 `81782180cf7821e25f14378837c0a3f88c1234cf2a722ad194e341749c5fbdf3`, the V205 receipt bytes. Explicit environment keys match the preimage. The only value difference is image `NODE_VERSION`. |
| Preimage | `dev-proxy-config-api-node18-preimage` `c2e6693974708cc75c8e54424c0a6ff764ec833d16e274109604689e39805180` exited 137 at 2026-11-25T06:10:55Z. Image `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`, Node 18.20.8. Same command, entrypoint, user, security, restart policy, and stored port bindings. `RW` matches, including read-only `/app`, `.env`, and the activation secret. Docker reports `Mode` `ro` on the preimage and an empty `Mode` string on the running container for those three mounts. |
| Proxy | `3506d7fe0b819a2603e069b09cd8fe5483c9e514959f7c267e177dfe30942192`, image `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1`, up since 2026-11-23T18:53:08Z. Nginx master pid 989 unchanged. `nginx -t` succeeded. Upstreams are static `dev-proxy-config-api:3001` and `:3002`. No `resolver` directive. |
| ngrok | Container `178b23cbdb9d` running since 2026-11-24T21:43:35Z. The retained log repeats a static-domain configuration and has no error line in the last 40 lines. The local API port was not published. |
| Notifications | LaunchAgent `com.leorami.devtunnelproxy.notifications`, pid 1253, started 2026-11-10. Loaded executable is the same Homebrew Node 25.9.0 cellar binary as the worker. Not restarted. |

Both API containers use restart `unless-stopped`, the same network aliases, and the same loopback 3001/3002 bindings. The preimage was explicitly stopped, so a Docker daemon or host restart should not start it while that policy remains. The two containers cannot publish those host ports at the same time. They can compete only if something explicitly starts the preimage while the Node 24 container is not holding the ports. Restart policy was not changed, and no reboot was performed.

Route checks on the existing HTTPS listener, after this inspection: `/health.json` 200 `{"status":"ok"}`, `/` 200, anonymous `/devproxy/api/config/` 302 to the login path, `Origin: https://foreign.example` 403, `/admin/check` 401 `{"authenticated":false}`. Loopback 3001 `/admin/check` 401. Loopback 3002 `/devproxy/api/notifications/health` 200 `{"ok":true}`. One configured application route returned the proxy's own 503 "not currently running" JSON. No signed-in session was available to this process. None was requested from the owner, and no credential was fabricated. No screenshot: this assignment did not change UI.

The private pin matches the running proxy container id, proxy image, and all eight proxy mount destinations. Queue: one settled request/response pair, status `CONFIG_SET_DIGEST_MISMATCH`, type `VALIDATE_AND_RELOAD_CONFIG_SET_V2`. Prepared, acks, and both replay directories are empty. The singleton lock is mode 0600, protocol `DEVPROXY_HOST_WORKER_V1`, recorded pid 33224, mtime equal to that process start. It was not removed. The HMAC epoch file is present and was not printed.

## Host worker

Pid 33224, user owner, started Wed Nov 18 19:14:24 2026, parent pid 1 by reparent after the original parent exited. Cwd is the private durable product stage. Command is `--serve` with the private pin. No LaunchAgent plist references this script. The notifications plist does not start it. Nothing found will restart it after a clean stop.

The argv binary is the Homebrew symlink `/opt/homebrew/bin/node`. The loaded executable is `/opt/homebrew/Cellar/node/25.9.0_3/bin/node`, inode distinct from the symlink, mode 0555, uid 504, Mach-O arm64, sha256 `fba87e4402c55ea4fc7ca9b9838790c32534e3e77c9c7834c37073752d070678`, `v25.9.0`. `/opt/homebrew/opt/node@24` resolves to that same Node 25 binary. The Cellar `node` 24.7.0 binary does not start (missing `libsimdjson`) and is not 24.22.3. Interactive `node` and this worker are the same Node 25.9.0 build. They are not independent runtimes.

The Node.js release schedule, fetched this turn, ends Node 25 on 2026-06-01. It was never LTS. The newest 25 release in the index is 25.9.0, dated 2026-03-31, `security: false`. Today is after that end date. Node 24 (Krypton) is LTS through 2028-04-30, in maintenance since 2026-10-20. The newest 24 release is 24.22.3, dated 2026-11-10, `security: true`. The worker is not on a supported LTS.

The twelve loaded worker files match both this worktree and the V118 blobs in `utils/rc2-worker-release-closure.cjs`. That closure helper and the LaunchAgent provenance helper are not in the running stage. A match is source bytes, not a claim that the provenance module attested the live process. The running supervisor is `scripts/rc2-supervised-mac-host-worker.cjs`. It installs nothing. Clean SIGTERM aborts the loop and `runUntilStopped` unlinks only its own unchanged 0600 lock. A crash or indeterminate scan leaves the lock. The pending selector skips a request id only after a durable response. This queue has that one settled pair and no in-flight state.

No exact Node 24.22.3 binary was already on the machine. The official `node-v24.22.3-darwin-arm64.tar.gz` was downloaded under `/private/tmp`, mode 0700, and not put on the default PATH. `SHASUMS256.txt.asc` verified with PGPy against key fingerprint `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`, which the Node v24.22.3 README lists for Antoine du Hamel. This Mac has no `gpg` binary. PGPy warned that it does not check self-signatures or revocation. The tarball sha256 is the signed line `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd`. Extracted `bin/node` is mode 0755, uid 504, Mach-O arm64, min OS 13.5, host macOS 27.3, `v24.22.3`, sha256 `ba7073582822078d8c90bca3facacc46690bc5366fab4b815aeef9148cd6e854`. Homebrew was not modified.

`node --check` on the twelve loaded files with that binary: 0 failures.

## Tests

Canonical `./smart-build.sh test:unit` was code-read. Its `cmd_test_unit` subcommands were run one at a time with this Node 24 binary first on PATH, from the worktree, the same commands the script evals. `tests/security/v171-four-auth-prefix-nginx.test.cjs` was not executed: it `docker run`s `nginx:1.26.3-alpine`. This assignment forbids Docker create and a second service. That is an unavailable command, not a skipped assertion.

Reported by those `node --test` runs: 618 tests, 617 pass, 1 fail, 0 skipped, 0 cancelled. The failure is `rc2-worker-release-closure.test.cjs`, "exact staged synthetic files are read-only", actual `WORKER_CLOSURE_UNSAFE`, expected `TEST_ONLY_WORKER_CLOSURE_MATCH`. The other nine tests in that file passed. An immediate rerun of that file alone: 10 pass, 0 fail, 0 skipped, exit 0. The checker stats every ancestor, including the shared per-user temp directory, and treats an mtime change as unsafe. Sibling temp directories created while it runs produce that result. It is not a mismatch of the loaded twelve files, which were hashed separately and matched. The first suite execution still exited 1 for that subcommand. This is not a claim that `test:unit` exited 0, and it is not a production-suite claim.

`test/collect-docs.test.js` and `test/calliope-embeddings-integration.test.js` exited 0. The embeddings file does not call an embedding API. The notification-bridge probe tests inject a fake request function and were not pointed at the live bridge.

Additional worker files, same Node 24 binary, not all inside `test:unit`: singleton inspection 12 pass, 0 fail, 0 skip; `rc1-fixed-activation-host-worker` 8 pass, 0 fail, 0 skip; `rc2-v83-host-worker-provision` 28 pass, 0 fail, 0 skip. Historical `rc1-v7-guarded-host-worker-nonlive.test.cjs` is not the loaded supervisor and is not in `test:unit`. On Node 24.22.3: 9 tests, 4 pass, 4 fail, 0 skip. On the worker's Node 25.9.0: 9 tests, 4 pass, 4 fail, 1 cancelled by a 20 second runner timeout, 0 skip. Same failing contract on both runtimes. Not a Node 24 regression, and not repaired here.

A first multi-file `node --test` of the worker suites deadlocked in `rc1-v7` because the runner was started with no test timeout. That process was killed. It was not pid 33224. A parallel multi-file run also failed two closure tests for the same shared-temp reason; those files pass as separate invocations. Pid 33224, both API containers, the proxy, and ngrok were the same after the tests.

## Recovery

`utils/recovery-image-binding.cjs` and `scripts/private-rollback-export.mjs` still bind `dev-proxy-config-api` to `node:18-alpine` `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`, and the proxy to the older id `sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634`. Those RC1 bindings are historical. Using either as the ordinary recovery target would select Node 18, or a proxy image that is not the running one. They were not executed and were not retagged.

`utils/rc2-pinned-current-image-export.cjs` exports only when `execute` is true, only into an empty `private-rollbacks/rc2-images-*` directory, and returns `RC2_PRIVATE_IMAGE_EXPORT_CREATED_RESTORE_NOT_VERIFIED`. No such directory exists. The private V204 rollback plan is still `executed: false` and `cutoverPerformed: false`. It names container `c2e669397470…` and image `sha256:8d6421d663b4…` as the original API. It names `sha256:f44b069ce4b5…` only as the candidate that had not been applied. No scanned private metadata file names the running container `5029fb453742…`. Older recovery directories name `8d6421d663b4` and `c2e669397470`. The stopped preimage and `node:18-alpine` remain. Nothing was exported, unpacked, or started.

Classification: `CURRENT_RECOVERY_STALE`. Old rollback evidence does not verify recovery of the running Node 24 API.

## Decision packet, not authorized

Two actions are justified. Neither is granted by V206.

1. Worker runtime only. One cooperative SIGTERM of pid 33224, then one start of the same `--serve`, same private pin, same cwd, and the same twelve source files, using the verified Node 24.22.3 binary path rather than the Homebrew symlink. Keep the Node 25.9.0 cellar inode `fba87e44…` for the inverse. Do not change the pin, HMAC epoch, supervisor source, LaunchAgents, global Node, Docker, nginx, ngrok, or the notification agent. Do not clear the settled pair or the lock by hand. Before the signal, re-check that pid, start time, inode, pin, and queue are unchanged and that prepared, acks, and replay are still empty. After SIGTERM, wait for that process to exit and for it to unlink its own lock. If the stop times out, the lock remains, or any in-flight file appears: stop, do not start a second worker. If the Node 24 process fails its checks, SIGTERM only that new pid and start one process with the preserved Node 25 cellar binary, same script and pin. While the worker is stopped it will not scan. Tunnel, API, proxy, and app routes do not depend on that process. The notification agent is also on Node 25.9.0 and is outside this action.

2. One current private export, not a restore. Use the existing owner-gated `scripts/rc2-export-private-images.cjs` into a new `private-rollbacks/rc2-images-*` stage whose pin lists the running API container and `sha256:f44b069ce4b5…`, plus the unchanged running proxy image. Leave the Node 18 image, the stopped preimage, and the historical archives untouched. The exporter does not prove restore. A restore rehearsal is a separate later grant. Do not point `recovery-image-binding.cjs` or `private-rollback-export.mjs` at the new image by retagging the historical ids.

## Origin evidence

- `SOURCE_CURRENT`: not claimed for this git branch as the running product. The loaded worker bytes match the reviewed twelve-file closure. The loaded API bytes match the V205 preimage. Only the API image changed in V205.
- `SINGLE_RUNTIME`: one running Config API, one proxy, one ngrok, one host worker. The Node 18 API container is stopped.
- `NO_SHADOW_APPS`: no second API, proxy, ngrok, or worker was started. The disposable nginx test was not run.
- `REAL_APP_VERIFIED`: public health, root, anonymous denial, foreign-origin denial, and both local listeners match the expected unauthenticated behavior. One configured app route is served and reports that app is not running. Signed-in journeys were not run.
- `OWNER_WORK_PRESERVED`: dirty checkout, queue, epoch, pin, sessions, mounts, and worker pid survived. No owner data was written.

Private inspect output, the Node tarball, and test logs stay in mode 0700 directories under `/private/tmp`. They are not in this commit. No public screenshot.

STOPPED for independent CTO review. No owner UAT.
