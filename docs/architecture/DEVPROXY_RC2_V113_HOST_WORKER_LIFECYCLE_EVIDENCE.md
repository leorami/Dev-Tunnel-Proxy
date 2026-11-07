# RC2 V113 — distinguish Mac worker availability from crash-durable transaction quarantine

## Evidence and non-negotiable authority
At PR #79 comment 6674654385, single primary V112 **RETURNED** at `4525186a9b2c4aab138dc43448f0fa3c13a56efc`. CTO reviewed its actual six-file diff against V110 and read its receipt. Two RC2 Docker services and unchanged ngrok were reported running; host worker was **NOT RUNNING** and exclusive singleton lock persisted. No direct CTO owner-Mac access, no lock cleanup or restart, no credential or worker epoch change. Preserve issue #112 for truthful host-worker degradation. Existing V110 owner's three grants were exercised; do not re-use them as implied worker restart approval. P2 issue #109 app-backend behavior stays deferred.

## Source-grounded boundary
`scripts/rc2-supervised-mac-host-worker.cjs` runs `--serve` on Mac, outside Docker's restart policy. `utils/rc2-exclusive-host-worker-service.cjs` creates 0600 exclusive `host-worker-singleton.lock`; it unlinks only on clean shutdown and intentionally retains it when scan results are indeterminate or a process crashes. `utils/rc2-pending-host-worker.cjs` does not reprocess a request with durable response; unresolved replay reservation hard-stops the queue. The lock carries a PID, but a PID's presence or liveness does not authenticate the worker executable, process start epoch, origin pin, supervisor, or whether any fixed-action had settled. A missing Mac worker process therefore does not imply a route outage or authorize another worker.

## Independent CTO source contract
`utils/rc2-host-worker-singleton-inspection.cjs` is a bounded read-only classifier with dependency-injected optional PID liveness check. It refuses symlink/hardlink/publicly readable files, incorrect UID, malformed/oversized lock content, changed file identity and unsafe lease directories. Fixed result codes never reveal PID, paths, ticket/secret bytes, or source data. It never invokes Docker, process.kill, launchctl, network, HMAC, or file unlink. Codes:
- `WORKER_SINGLETON_ABSENT`: absence of lock, **not** proof that worker runs.
- `WORKER_SINGLETON_CRASH_QUARANTINE`: lock PID definitively dead according to externally trusted probe; still not deletion authority.
- `WORKER_SINGLETON_PID_PRESENT_UNVERIFIED`: PID probe says alive, worker identity **not established**.
- `WORKER_SINGLETON_PID_UNVERIFIED`: missing/unknown/untrusted probe.
- `WORKER_SINGLETON_UNSAFE`: any file/path/trust-boundary error.

Twelve adversarial RED-first test cases in `tests/security/rc2-host-worker-singleton-inspection.test.cjs`, committed first at `c128966b68358a56f3d0fa1f1680d41ff04c7795`. The source was added subsequently in `1e1016b44d36ff43ea5879cba47eae6fd8b5ba24`. **Native tests NOT RUN by CTO**: code tool container cannot reach GitHub raw source; primary must run Node22 and canonical build on actual checkout. This guard does not prove the Mac state or the cause of process exit.

## Recovery must remain separate
Read-only diagnosis first: actual Mac process identity, supervisor/LaunchAgent state (if present), exit reason, lock inode/mtime vs transaction timestamps, prepared/ack/replay state and exclusive epoch pin; no private contents in public evidence. An apparently dead PID is insufficient to delete an unsafe lock. If any transaction is indeterminate, preserve quarantine. A bounded worker-only recovery needs a separate explicit owner action grant; do NOT silently restart, rekey, clear lock, recreate Docker, or alter ngrok. Any future supervised recovery design must preserve the original pending evidence instead of papering over failure.

## Operating model
One primary Cursor Engineer-I only; GitHub is the coordination/evidence layer. No specialist writes to shared runtime/credentials/host state; optional specialist only for a read-only macOS LaunchAgent lifecycle research lane, if useful. Root `AGENTS.md` and `CORE_COLLABORATION_PROTOCOL.md` are absent; existing `.cursorrules` restrict Git state operations, and governance issue #36 is intentionally deferred. No governance PR or protected merge as part of V113.
