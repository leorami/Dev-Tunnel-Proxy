# V207 engineer completion — worker qualification reliability

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7157436363
CTO pin: `origin/cto/devproxy-v207-closure-stability-20261125@4c667cec3f90669622bf265607c24d6a5a9e77b2`
Handoff blob: `5309f4578bb61dcb195be4fcf42af1ff55e69790`
Disposition: `QUALIFICATION_RETURNED`
Recovery: `CURRENT_RECOVERY_STALE`

No worker stop or start. No launchctl change. No Docker create, recreate, reload, retag, export, restore, or prune. No queue, lock, pin, or HMAC change. No notification delivery and no second app. The decision packet below is not a grant.

## Lifecycle

Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7`. V206 remains RETURNED/STOPPED #271/7155441518 at `ab68a295509277016270e35efbd888b47d5f98ef`, reviewed #274/7155556700. That branch was not edited. V207 READY / NOT STARTED was #271/7155594356. No V207 engineer branch existed at start. Draft #275 is the frozen CTO source.

Work was done in an isolated worktree at the frozen pin. The dirty local `master` checkout was not used. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2` still matches. `governance/consumers.json` at that commit still does not name Dev Proxy. This receipt does not claim operational adoption. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`.

A private read-only before snapshot and a private after snapshot of the running API, the stopped Node 18 preimage, the proxy, the nginx master, ngrok, the host worker, the queue, the lock, and the notification engine matched. No process identity changed.

## CI, read from the job logs

Native Mac results below are separate from these GitHub Actions runs. The source gate is "Dev Proxy supported Node LTS source gate".

| Run | SHA | Result | What the logs showed |
| --- | --- | --- | --- |
| 45566058972 | `2b66520f8c0380be2de806eab3e3896930f3de4b` | failure | Node v22.23.5 and v24.22.3. Runtime/archive 8/8 and 0 fail on both. Closure 13/14 and 1 fail on both. The failing test was the single external-sibling retry. |
| 45566131376 | `f45c7259e04e4c3b6822be15368cb56cb09a1a5a` | success | Same two Node versions. Runtime/archive 8/8. Closure 14/14. 0 fail, 0 skipped. |
| 45566218113 | `4c667cec3f90669622bf265607c24d6a5a9e77b2` | success | Node v22.23.5 and v24.22.3. Runtime/archive 8/8. Closure 14/14. 0 fail, 0 skipped. |

The final run had completed before this qualification started. It was not treated as passed while pending.

## Native Node 24 closure

The Node 24.22.3 darwin-arm64 binary used for these runs matches signed checksum `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd` for the official tarball and `ba7073582822078d8c90bca3facacc46690bc5366fab4b815aeef9148cd6e854` for `bin/node`. `node --version` reported `v24.22.3`. It was not placed on the default PATH and no running service was pointed at it.

`tests/security/rc2-worker-release-closure.test.cjs`, five quiet runs: 14 pass, 0 fail, 0 skipped, exit 0 each time. That includes the deterministic one-sibling retry, the mocked continuous-churn bound of three attempts, the stage/file non-retry, and the permission-drift non-retry.

The same file, three runs while a test-owned helper created and removed sibling directories with pauses: 14 pass, 0 fail, exit 0. A later burst of sibling activity that then stopped also returned `TEST_ONLY_WORKER_CLOSURE_MATCH`.

Continuous sibling creation in the shared temporary parent, overlapping one direct call of the inspector: `WORKER_CLOSURE_UNSAFE` in 59 ms. The same continuous activity during the whole file: 14 tests, 10 pass, 4 fail, exit 1, about 230 ms. Those four failures were `WORKER_CLOSURE_UNSAFE` where a stable snapshot would have matched or mismatched. That is the fail-closed bound, not a new product defect, and it was not repaired by rerunning. The mocked continuous-churn test in the quiet runs already asserts the three-attempt cap.

Runtime and historical archive contract, same binary: `tests/security/v203-supported-node-runtime.test.cjs` and `tests/security/recovery-image-tag-binding.test.mjs`, 8 pass, 0 fail, exit 0.

## Canonical unit subcommands

`cmd_test_unit` in `smart-build.sh` was read and each subcommand was run separately with this Node 24 binary first on `PATH`. One early pass used umask 077. That masked two explicit mode `0644` fixtures down to `0600`, so `rc1-empty-dotenv-target.test.cjs` reported 10 pass / 1 fail and the LaunchAgent provenance file reported 21 pass / 1 fail. Both files were rerun under umask 022: 11/11 and 22/22, exit 0. Those first failures are recorded and are not a product defect.

With that umask correction, the executed subcommands are 622 tests, 622 pass, 0 fail, 0 skipped. `tests/security/v171-four-auth-prefix-nginx.test.cjs` was not executed. It pulls and runs `nginx:1.26.3-alpine`. This assignment forbids that on the owner host. The same blob `24b6eb7dc9922fe104bd2448dfdca272dbe16292` ran in GitHub Actions job 138938024513 of run 45534614364 at `52c8f580caebf1dadf5ecf15ddaec2e8c7bf66f9`. That job's command includes the v171 file, pulls `nginx:1.26.3-alpine`, and reports 12 tests, 12 pass, 0 fail. That is existing CI evidence for another commit with the same test blob. It is not a local exit 0, and the split evidence is not a canonical `test:unit` exit 0.

## Historical RC1-v7

`tests/security/rc1-v7-guarded-host-worker-nonlive.test.cjs` with `--test-timeout=8000`, before the fixture change, on Node 24.22.3 and on the existing Node 25.9.0: 9 tests, 4 pass, 4 fail, 1 cancelled, exit 1, on both. The cancelled test is the parallel case, which hit the 8000 ms runner timeout.

The cause was demonstrated, not assumed. `os.tmpdir()` is not a canonical path because a macOS ancestor resolves through `/var` to `/private/var`. The fixture fence therefore failed `fs.realpath(directory) !== directory` inside the existing quarantine check, which threw `HOST_FENCE_NOT_PREPROVISIONED`. The same call on the canonical path did not throw that error. The parallel test only opens its gate from inside `nginx-test`. The first worker returned before that call, so the gate never opened. The trust check was not weakened.

RED commit `770c78afbde6de2c43fe0448cde415e01bd819f2` adds the failing canonical-path assertion only. It failed 1/1 before the fixture change. Fix commit `04eb3515cd18820309b7c44e0faac228ac6cb451` canonicalizes the test-owned root and makes the parallel test fail with the settled result if the gate is never entered. After that, Node 24.22.3 and Node 25.9.0: 10 pass, 0 fail, 0 cancelled, exit 0. The product quarantine module was not edited. The live twelve-file closure was not edited. No live pin, queue, or HMAC was used.

## Runtime provenance

The Node release index, fetched this turn, marks 24.22.3 on 2026-11-10 as `security: true` and the newest 24 release. The Node release schedule puts 24 (Krypton) in maintenance from 2026-10-20 through 2028-04-30. Node 25 ended 2026-06-01. 25.9.0 is dated 2026-03-31, `lts: false`, `security: false`. It remains the loaded host worker and notification binary. It was not promoted.

Fingerprint `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356` is the Antoine du Hamel key in the v24.22.3 README, on keys.openpgp.org, and in `nodejs/release-keys`. The keyserver copy and the release-keys copy have that same fingerprint. The keyserver copy also carries a `rosa.be` user id that the release-keys snapshot does not. Sequoia, in a private virtual environment, reports the certificate not revoked and without an expiration, and reports one valid signature over `SHASUMS256.txt.asc` by that fingerprint. The signed body contains the tarball checksum above. PGPy still warns that self-signature verification and revocation checks are not implemented. That PGPy limitation remains. The Sequoia check is what covers it for this candidate.

The verified tarball was extracted into the owner-approved per-project runtime directory. That directory and its parents through the per-project folder are mode 0700 and owned by the operator. The binary is mode 0555, Mach-O arm64, `v24.22.3`, hash `ba7073582822078d8c90bca3facacc46690bc5366fab4b815aeef9148cd6e854`. It was not activated and it was not added to the default PATH. The Node 25.9.0 inverse binary is still present, mode 0555, hash `fba87e4402c55ea4fc7ca9b9838790c32534e3e77c9c7834c37073752d070678`.

The twelve on-disk worker files match `REVIEWED_WORKER_FILES` for commit `20427efaf372d19f341d39c84e21139e9413a907`: 12 match, 0 mismatch. `node --check` of those twelve with the durable binary: 0 failures. The running process does not still have those source files open, so this is disk identity, not an attestation of bytes mapped inside the process.

## Notifications, not changed

The wrapper `macos/dev-tunnel-proxy-notifications` still prefers `/opt/homebrew/bin/node` before any other Node. The loaded engine is that Node 25.9.0 binary running `macos/notifications-engine.js`. Those engine and bridge bytes match the pinned source. `node --check` of both with the durable Node 24 binary: 0 failures. Existing fake-sender tests, same binary: 28 pass, 0 fail, exit 0. Nothing was delivered and no extra engine was started.

The running job reports keepalive and run-at-load. The on-disk engine file is not the installer XML. It is a one-element JSON array naming the wrapper. The bridge plist is present, with `KeepAlive` and `RunAtLoad` and an explicit Homebrew Node path, and the bridge service is not loaded. `macos/install-notifications-engine.sh` unloads and loads both the engine and the bridge. A worker-only change does not change the notification runtime. Running that installer is out of scope.

## Recovery, not exported

The running API image and the running proxy image are still present locally. Their combined size is under 1 GiB, inside the exporter's 8 GiB cap. The volume has space for that archive. The Node 18 image and the stopped preimage are still present and were not retagged. `private-rollbacks` exists, is not a symlink, and contains no `rc2-images-*` stage. Its mode is 0755. `utils/rc2-pinned-current-image-export.cjs` rejects a parent or stage that is not mode 0700. The existing exporter is still the one that would perform a future two-image export, and only with `--execute --owner-approved`. It still reports restore as not verified. It was not invoked. No restore grant is inferred.

## Ordinary routes

On the existing HTTPS listener: `/health.json` 200 `{"status":"ok"}`, `/` 200, anonymous `/devproxy/api/config/` 302 to the login path, that same path with `Origin: https://foreign.example` 403, `/admin/check` 401, and `/admin/check` with the foreign origin 403. `/health.json` with the foreign origin stayed 200. The public status page loaded in a disposable browser tab and was then closed. It shows the status UI, a route-conflict notice that could not parse details, and one configured app card reporting localhost 503. The overview timestamp on that page is 2026-11-03. No signed-in session was available to this process, and none was requested. This is not a tunnel-wide outage finding. No screenshot was committed.

## Decision packet, not authorized

Three actions are justified. None is granted by V207. Each is separately stoppable. None may start a second copy of a service that is already running.

1. Worker only. One cooperative SIGTERM of the single current host worker, then one start of the same `--serve`, same private pin, same working directory, and the same twelve source files, using the durable Node 24.22.3 binary from this assignment. Keep the Node 25.9.0 binary above as the inverse. Do not change the pin, HMAC epoch, supervisor source, LaunchAgents, global Node, Docker, nginx, ngrok, or the notification engine. Do not clear the settled queue pair or the lock by hand. Before the signal, re-check that the process start, the loaded binary, the pin, and the queue are unchanged and that prepared, acks, and replay are still empty. After SIGTERM, wait for that process to exit and for it to unlink its own lock. If the stop times out, the lock remains, or any in-flight file appears: stop, and do not start a second worker. If the Node 24 process fails its checks, SIGTERM only that new process and start one process with the preserved Node 25 binary, same script and pin. While the worker is stopped it does not scan. Tunnel, API, proxy, and app routes do not depend on that process.

2. Notification engine only. Do not run `macos/install-notifications-engine.sh`. That script loads and unloads the bridge as well as the engine. The bridge is not loaded and must stay unloaded. A future engine change has to account for the on-disk file being a one-element program array while the running job reports keepalive. Do not send a notification and do not leave an extra engine running. If the engine does not return to the same label, or if the bridge would be loaded: stop and leave the current Node 25 engine in place. This action is independent of the worker action. Changing only the worker leaves this engine on Node 25.

3. One current private export, not a restore. Use the existing `scripts/rc2-export-private-images.cjs` only after a separate grant, into a new empty `private-rollbacks/rc2-images-*` stage. The parent directory must be mode 0700 before that run. Today it is 0755, so the exporter would reject it. The pin must name the running proxy image and the running API image. Leave the Node 18 image, the stopped preimage, and the historical archives untouched. The exporter does not prove restore. Do not point the historical recovery bindings at the new image.

## Origin evidence

- `SOURCE_CURRENT`: not claimed for this git branch as the running product. The on-disk worker bytes match the reviewed twelve-file closure. The notification engine bytes match the pinned source. The running binaries are still Node 25.9.0.
- `SINGLE_RUNTIME`: one running Config API, one proxy, one ngrok, one host worker, one notification engine. The Node 18 API container is stopped. The notification bridge is not loaded.
- `NO_SHADOW_APPS`: no second API, proxy, ngrok, worker, or notification engine was started. The disposable nginx test was not run.
- `REAL_APP_VERIFIED`: public health, root, anonymous denial, foreign-origin denial on the admin and config paths, and the status page match the expected unauthenticated behavior. One configured app card reports localhost 503. Signed-in journeys were not run.
- `OWNER_WORK_PRESERVED`: dirty checkout, queue, epoch, pin, and the running worker and engine survived. No owner data was written.

Private inspect output and test logs stay outside git. No public screenshot.

STOPPED for independent CTO review. No owner UAT.
