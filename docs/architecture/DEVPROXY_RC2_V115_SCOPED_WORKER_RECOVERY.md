# RC2 V115 — scoped owner-approved worker-only crash-lock recovery

## Real primary and owner authority
Sole Engineer-I V114 genuinely RETURNED PR #79 #6676783928 at `engineer/devproxy-rc2-controlled-release-20261104@7a4c320ab8e583a90211e1e87b976a08f36981c0`. CTO independently inspected the actual one-commit V113→V114 seven-file diff, native focused 18/18 and canonical unit exit-0 receipts and the disposable signed-refusal path with zero host action. The live proxy/API/ngrok IDs remain unchanged, 17 routes remain, browser auth/Ask/health are good per Mac receipt. The host worker remains stopped, with a dead PID and crash-durable singleton lock; no launchd supervisor was found. V114's source-only refusal fix is NOT asserted as applied to the live product binding or as the cause of the worker death.

**OWNER ACTION GATE: GRANTED FOR ONE narrowly scoped worker-only recovery.** Owner explicitly said `i authorize a narrowly scoped worker-only recovery`, recorded as issue #112 comment **6676775635** and primary PR #79 comment **6676792335**. This approval is independent of V114's earlier frozen `NO LIVE` acceptance, which is complete. Never ask for it again; do not expand it.

## CTO-first source: double sampled preflight
`utils/rc2-worker-only-recovery-preflight.cjs` consumes the already-tested V113 `inspectHostWorkerSingleton` and independently reads the private Mac host spool/lease structure twice, without any mutation. Reject:
- any live/unknown singleton PID, absent/unsafe/changed exclusive lock, unexpected lease files, replay reservation, missing or non-private directories;
- any nonempty signed requests, responses, prepared, acks or replay, or a new item appearing between passes;
- any independently detected competing host worker or worker count that changes between passes;
- a worker pin that fails independently reviewed current **same full proxy ID/image/mounts + existing NEW HMAC epoch** checks;
- any insecure directory mode/symlink/wrong UID/changed inode, or unreadable/unverifiable trust evidence.

The only positive code `WORKER_ONLY_PREFLIGHT_SATISFIED` **still returns** `ownerMacAttested:false`, `productionChangeAuthorized:false`, `lockCleared:false`, `workerStarted:false` and `operatorRecheckRequired:true`. It is a local consistency probe, **not an atomic deletion primitive, owner grant, race-free attestation, or proof of future worker liveness**. Callback functions must be wired to trusted Mac read-only process/identity checks; never self-certify or hard-code true. Immediate operator re-check under private 0700 owner-controlled root remains mandatory before the one explicitly authorized stale-lock unlink.

## The precise authorized action
Use the original authenticated, durable worker pin and installed worker launch path; do NOT rekey/re-bootstrap, alter Mac credentials, install launchd, change Docker services, ngrok, source, app route, or current private spool. After two consistent independent preflights, verify the same lock inode/UID/mode and no competing process **immediately before** unlink; preserve a private redacted disposition record. Remove only `host-worker-singleton.lock` once, and start exactly one approved `rc2-supervised-mac-host-worker.cjs --serve` under existing Mac owner identity from existing vetted executable/source. Verify a new exclusive 0600 lock, same durable pin/epoch, worker active after a bounded observation and shell disconnection, second instance refused, no unverified HMAC operation/replay or owner-app edit. This authorization allows one recovery action, not an unattended restart policy or ongoing crash cleanup.

If any guard fails, STOP without mutation; if the process starts and later fails, preserve the new lock for independent review rather than looping/restarting. If no durable Mac supervisor is installed, report the residual reliability issue separately; LaunchAgent installation requires a distinct owner scope.

## Independent testing and limitation
Fifteen RED-first tests were committed before the source. Native Node22 test and canonical `./smart-build.sh test:unit` are **Engineer-I gates**, not CTO-certified at this stage. Tests use owner-data-free fixture directories and callback stubs, not owner Mac files. The current tool has GitHub read/write but **no owner-Mac shell access**; only the primary Cursor Engineer working in the vetted Mac environment can execute the actual recovery. Do not claim the worker is restored until a real Mac runtime receipt proves it.

## No scope displacement
V115 is a *worker-only operational recovery*, not a deployment of V114 source, no production recreation, no old epoch replay, no one-use healing approval reuse, no issue #109 app-offline startup work, no governance issue #36 implementation and no protected master merge. Source changes can be imported into the primary worktree independently of live container binds without altering the frozen V114 return.
