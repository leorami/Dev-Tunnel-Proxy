# RC2 V118 — verify Mac worker source-versus-stage drift and LaunchAgent path trust (NONLIVE)

## Current GitHub truth and owner authority
The one sole primary Engineer-I V117 genuinely **RETURNED** PR #79 #6677919876 at `engineer/devproxy-rc2-controlled-release-20261104@6cb77b039c0c40612a8d04a9e2655043e0cfe2a1` from V116 `10aef4fdc53593ce84e0ac1cd7645048b0326dc4`. CTO independently inspected the actual one-commit nine-file diff and both receipts: owner-Mac Node 22 source+generator **12/12**, disposable Docker nginx 1.26.3 **3/3**, canonical unit exit0, 17 app routes with 0 static app DNS references and 37 variable proxies. No app-down startup failure reproduced; current nginx `-t` is green and recent logs have 0 startup `[emerg]`; historical reboot-time failure cannot be proved from current restarted container. **No speculative nginx change.** P2 #109 observation remains open for genuinely new evidence.

At V115 and V116, one Mac `--serve` was recovered and reported alive; proxy/API/ngrok and 17 routes remained. V115 explicitly says the **preexisting durable worker product** was relaunched and the V114 signed-`CONFIG_SET_DIGEST_MISMATCH` refusal patch was **not synced**. GitHub returned V117 source `utils/rc2-pending-host-worker.cjs` has Git blob SHA `6a084d5f697e999219de5bd078032cbe8fde1536`. This is reviewed **repository source**, NOT proof of the module loaded by the live Mac process. Issue #121 tracks the difference. A valid signed refusal may crash an old worker if it lacks the code fix. We do **not** assert that this caused the original empty-spool worker death.

Issue #116 LaunchAgent candidate is source-only, not installed. No explicit authorization to install a LaunchAgent, stop/cutover the live worker, sync code into the live product, restart/rekey, rebuild Docker, modify secrets or app routes, change master or ngrok. **Current action gate: NONE for READ-ONLY SOURCE/TEST/OWNER-MAC INSPECTION.** Do not re-use the already executed one-time V115 worker recovery authorization.

## CTO independent code review + direct contracts
Read:
- `utils/rc2-pending-host-worker.cjs` (V114 signed no-action refusal with durable reply and no replay lease),
- `scripts/rc2-supervised-mac-host-worker.cjs` (same `--serve <private-pin>` entrypoint, SIGTERM abort and exclusive lock),
- `utils/rc2-private-host-worker-pin.cjs` (trusted private pin, `approvedRoot`, transitive imported modules),
- `utils/rc2-exclusive-host-worker-service.cjs` (uncertain scan preserves crash-durable lock), and
- `utils/rc2-macos-worker-launchagent-candidate.cjs` (source-only plist candidate, **not** a filesystem/identity attestation).

**Two distinct nonlive review tools:**
1. `utils/rc2-reviewed-worker-source-stage.cjs` compares the actual regular owner-controlled `approvedRoot/utils/rc2-pending-host-worker.cjs` bytes against the **independently reviewed GitHub blob**. It opens via O_NOFOLLOW, rejects symlinks/hardlinks and group/world writes, double-checks stable inode/timestamps and never exposes module text/paths/hashes. `REVIEWED_STAGE_MODULE_MATCH` means only **bytes on disk at inspected path** match reviewed source. `REVIEWED_STAGE_MODULE_MISMATCH` means source-stage drift, **not** proof of running-process compromise. `STAGE_SOURCE_UNSAFE` and `STAGE_SOURCE_UNVERIFIED` remain fail closed. All outputs hardcode `processIdentityAttested:false`, `liveLoadedCodeVerified:false`, `productionChangeAuthorized:false`.
2. `utils/rc2-worker-launchagent-path-provenance.cjs` (imported exact-blob from isolated previous CTO draft PR #120) verifies independently reviewed SHA256 for Node binary and `scripts/rc2-supervised-mac-host-worker.cjs`, stable O_NOFOLLOW handles, root/owner/mode/inode, private pin **metadata only**, private 0700 log root and safe existing 0600 logs. Reject source-tree pin/log/Node overlap, symlinks/hardlinks, insecure modes, unknown source. It never installs or reads secret. **Caller must obtain expected SHA256 from a separately approved release**; hashing the same untrusted file to define its own expected value is circular and forbidden. Homebrew `node` symlink must be resolved and its final executable reviewed on Mac, not silently followed.

The CTO committed the new stage tests BEFORE implementation; imported prior 12 adversarial path tests committed before their source; independent **native Linux Node v22.16.0 22/22 PASS**, exact GitHub blob/source tests match local files:
- `rc2-reviewed-worker-source-stage.cjs` `55a7bc4a179c68021e82a33a1caf191e4ef442e1`
- `rc2-reviewed-worker-source-stage.test.cjs` `f984a2c4f9131a7e2093a00bdb27108b5178ceae`
- `rc2-worker-launchagent-path-provenance.cjs` `14821c6c98c99add02125c9379ff105a5c1d023f`
- `rc2-worker-launchagent-path-provenance.test.cjs` `e591f16ee1b18f858e9e78abee685bcd3a1ae07c`
- Node `--check` both helpers OK. Canonical `./smart-build.sh test:unit` is **not** CTO executed; the owner-Mac primary will test exact integration.

## Limits, action priority, and next real proof
1. The sole primary should perform READ-ONLY redacted Mac attestation: same running worker PID/process start time/private pin/approvedRoot and actual on-disk stage Git blob classification against `6a084d5f697e999219de5bd078032cbe8fde1536`. Do not print PID/path/module text, secret/HMAC bytes, app routes or owner's hostnames in GitHub. Read and correlate actual process `cwd`/executable and loaded release identity without trying to infer a dynamically loaded module from its presence on disk. A matching on-disk file is **not** process-loaded-code proof.
2. If mismatched or unverified, **STOP** at source-proof/decision. Do NOT modify, stop, restart, hot-patch, signal or sync the running process. Prepare one decision-ready narrow future **worker product-source cutover** with full transitive reviewed artifact manifest, existing HMAC epoch/empty replay/pin continuity and preserved crash singleton. If safe and useful, combine with a **separately authorized** per-user LaunchAgent cutover; no new OS job until the owner expressly grants that scope.
3. If on-disk bytes match, still report loaded-process provenance unverified unless independently proven; do not certify real worker code from a filesystem read alone.
4. V116 LaunchAgent `RunAtLoad:true`, `KeepAlive:false` only starts once at login and intentionally does **not** auto-retry after crashes or Docker-late startup; do not present it as complete reboot resilience. No KeepAlive retry storms or lock auto-clear permitted.
5. Owner UAT of working proxy/dashboard/Ask/apps remains independent. Do not turn this into further optional hardening if runtime source divergence is disproven and the launch agent remains unauthorized.

## Project coordination
V118 is a **single** source/read-only next Engineer-I assignment after genuine V117 return and CTO diff review. One primary Cursor Engineer-I only; no arbitrary parallel worker launch. No specialist touching Mac/credentials. There is one current branch and a single SHA-pinned handoff. No protected merge. Issue #121 is source-stage divergence; issue #116 is supervised Mac lifecycle; issue #109 app-down startup is currently not reproduced. Architecture/source research can continue independently only off live production and assigned files.
