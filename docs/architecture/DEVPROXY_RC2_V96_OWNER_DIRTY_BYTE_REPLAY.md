# Dev Proxy RC2 V96: exact owner-work replay without inventing a clean Git tree

## The defect in the old evidence classification

`utils/rc2-dirty-source-recoverability.cjs` classifies archived/supplemented dirty **path coverage**. It validates the syntax of purported SHA-256 values but never checks those claims against real files. Thus it may classify a path as recovered while the independently staged bytes or modes have drifted. This is a real distinction, not a reason to discard the already verified V87/V88 Mac archive and supplement evidence.

## Independent CTO implementation

`utils/rc2-owner-dirty-byte-replay.cjs` performs a bounded, read-only comparison of **every explicitly inventoried dirty file** against an actual owner checkout and one of two **separate disposable recovery roots**. For each file it requires the supplied source SHA-256 and POSIX mode to match both real file instances, and verifies stable inode/device/owner/size/mode/mtime/ctime while reading from an `O_NOFOLLOW` descriptor. Rejects symlinks, hardlinks, traversal, unaccounted files, duplicate/cross-channel classification, altered bytes, modes, oversized inputs, root aliases, world-accessible private supplement stage and unsafe owner roots. Limits: 256 files, 32 MiB/file, 256 MiB combined read budget. Does not execute Git, tar, Docker, shell, network, privileged tools or any write.

`scripts/rc2-inspect-owner-dirty-replay.cjs` accepts only a 0600 `plan.private.json` under an owner-owned 0700 `private-rollbacks/owner-replay-<nonce>` stage. The plan contains approved absolute paths only on the owner's Mac; never paste it into GitHub/chat. Run from the current owner checkout with canonical native Node (no bundled Docker needed for this **read-only** comparison):

```sh
node scripts/rc2-inspect-owner-dirty-replay.cjs --inspect --plan '<owner-private>/private-rollbacks/owner-replay-<nonce>/plan.private.json'
```

The private plan has exactly these ten top-level keys: `sourceDirty:true`, `sourceHead` (actual 40-character checkout SHA), `expectedDirtyCount`, `dirtyFiles` (path/SHA256/mode records for every dirty tracked and untracked file), `archiveDirtyPaths`, `supplementDirtyPaths`, `liveRoot`, `archiveRestoreRoot`, `privateSupplementRoot`. It must be prepared PRIVATELY by the owner Mac operator from an independently captured, complete Git status/inventory and the already verified real disposable restored files. Use actual source data; no invented paths or digests. The prior Engineer receipts identify six archive-covered paths and two private supplement paths. If any have changed, the evidence must be refreshed without cleaning or deleting owner work.

Outputs are **only** fixed codes and counts, never paths, SHA-256 values, file bytes, credentials or source prose. Exit 0 means `OWNER_DIRTY_BYTE_REPLAY_MATCHED` **for that exact listed set**, not blanket owner recovery or release GO. Exit 2 is fail-closed. Mode 0600 protects the plan; the private stage remains 0700; source and restored bytes remain on the owner Mac. Previous original tar SHA verification, 76-file restore/mode/mtime attestation and 17-route checks remain separate mandatory evidence, but don't rerun them unless source/private-stage drift requires it.

## Critical scope distinction

A cryptographically matching file replay still does **not** prove the dirty-path list was exhaustive, the original archive tar generated the disposable extraction, the host worker can restore the *new nonroot RC2 candidate*, or owner approval to deploy. The new result explicitly retains `sourceDirty:true`, `formalCleanPass:false`, `dirtyInventoryExhaustiveAttested:false`, `originalArchiveTarAttested:false`, `sourceCurrent:'UNKNOWN'` and `releaseAuthorized:false`. Do **not** convert this single result into a cutover permission. Combine it with independent existing owner Git inventory, original tar SHA, archived extraction, candidate secure rollback, session and feature-scope evidence. Once those are legitimately reviewed, an honestly dirty but **recoverable** tree need not be mislabeled clean to preserve owner work.

## Engineer preservation decision (V96)

`utils/rc2-recoverable-dirty-preservation.cjs` is a separate audited gate: matched byte replay **and** exhaustive dirty inventory attestation **and** original archive tar attestation **and** secure nonroot candidate restore attestation. It never sets `formalCleanPass:true` or `releaseAuthorized:true`. RED-first tests prove each missing proof independently blocks. Path-only `VERIFIED_RECOVERABLE_DIRTY_SOURCE` without live/restored byte identity is insufficient.

## RED-first CTO evidence

Local Node v22.16.0 tests: 22/22 GREEN across file verifier and operator CLI. RED existed before implementation for missing module/CLI, and one later adversarial RED found a false `sourceDirty:true` flag on failed validation; corrected to `sourceDirty:null` unless all actual checks pass. Tests include actual bytes/modes in two separate roots, tampering after staging, stale hashes, incomplete or overlapping inventory, absolute/traversal/hidden `.cursor` paths, symlink/hardlink, private ACL, replay against live-root descendant, stage-plan symlink, poisoned extra release flags and output redaction. No production, owner Mac, formal original tar SHA or canonical project build was touched by CTO.
