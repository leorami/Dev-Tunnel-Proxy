# V217 activation packet

This document is not an installer and it is not permission to install. No command here is authorized to run against the owner tree. `scripts/v216-frontend-install.cjs` still refuses any directory that is not under the temporary directory, and it refuses a git checkout. Removing that guard is out of scope. Promoting that helper into an owner-host installer is out of scope.

Nothing in this packet changes a served file. If any preflight check differs from the table, the operation stops and writes nothing.

## Source pin

The candidate bytes are the `status` files on product commit `53422746e528cfc6a338abf1bac4aee4b5198be4`. Recompute every hash from that commit before any later activation. The `status` tree is `1696cc771f415725863617b1392ef4324e8c1149`, the same tree as V216. The hashes below are that tree.

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `status/health.html` | `014d74dd771a71c7958263cb9fd584ceb5de472c` | `11380567f1dba63faf2ce52262a6edbc0f31ea829401c5cd62dfe150bf4834ac` |
| `status/reports.html` | `1d2184b674afc7fbda6f2c6c2511685726f3e32c` | `ee545a532e43c26bf502656d74d477aa04ac9540f7e552e24f3896ffec8b399f` |
| `status/status.html` | `928ef41dfbb3d160862a38f22f36ce1543df72d1` | `8ead4bbf3437c6364517a3f9834b732b7776fe7f60069c2eaa4a926255b43d35` |
| `status/common.v215-42c0928ec30a.css` | `e2da6231d921893311bda441be3a0161454bd72a` | `42c0928ec30a12de732d3cf8d9469de001046d44d8fa107e6d66393139237b80` |
| `status/common.v215-dfd52e64df59.js` | `a3cb96da695e81382737a7c63796c4cba76d149f` | `dfd52e64df59644e9f52562b745bdf5ce6334b3203677d14090d50548d3b7eda` |

`status/common.js`, `status/common.css`, and `status/config.js` are not replaced. The unversioned pair that must still be the served baseline, and must still be present after the operation, is:

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `status/common.js` | `33d757a78f2d65edcaad93d543fa955010a7e069` | `c967d51b384982abb52c3f83015081b3fa0ceb98c598a095a0deebcc1f4b9932` |
| `status/common.css` | `28f006befdc02bc93f460abf04d2241a7a05ef4b` | `07c995ce8d3f24279c1c87ac01944c30d1db2823a4c47e5b22cad7861175ab97` |
| `status/config.js` | `bd858c04942a6756dd43180830120463fe5eea5c` | `d3047ea4229bd0788c0007d77b84d8710aa7bb04cf0961b4f1c1af5f55972b1b` |

The three documents that must be present before the first write are the public V213 served blobs, stored for the fixture at `tests/security/fixtures/v216-served-baseline/`:

| File | Git blob | SHA-256 |
| --- | --- | --- |
| `status/health.html` | `dd58d4b9fbde72dd2be06fd54682366a0aae9e04` | `9c30e78b7b2eea1ae34d34269ab3b08094d87855f6dec43276b6bec7fa5d6643` |
| `status/reports.html` | `42aebbec2626703a8b2d9ee671ff387e637e5546` | `484b34d71ce558af0470cb5903f02bdfadb58c6f200d9bb8b5473ea88fbf4c9c` |
| `status/status.html` | `1728475984c35569b5b45caac0bed944ca7535a9` | `f5c8e539c52ca7df782924f9bc6ce7e2f2e377f9ce52f5ea5ebba97513fbe5d4` |

## Preflight

Stop with no write unless all of the following are true. Read these. Do not print secret values, credentials, or private config.

1. The served `health.html`, `reports.html`, and `status.html` match the V213 blobs and SHA-256 values in the baseline table.
2. The served `common.js`, `common.css`, and `config.js` match the unversioned table.
3. Each of those six files is a regular file with link count 1. A symlink or a hard link is a stop.
4. The versioned CSS and JS names are absent, or already byte-identical to the candidate table. A different byte string is a stop.
5. The document root inode and device are recorded. The status directory inode and device are recorded. Each of the six files' device and inode are recorded. A later step that sees a different directory identity stops with no further write.
6. Ownership, mode, ACL, extended attributes, and macOS file flags can be read for every file that will be replaced. Linux reads every namespace with `getfattr -d -m - -e base64`. macOS reads values with `xattr -px`. If any attribute cannot be read, or cannot be copied back (including `security.*` and `com.apple.provenance`), stop. Text encoding is not a substitute for the bytes.
7. Custody is a directory outside the entire served document root, mode `0700`, owned by the operator, and free of symlinks. It is not a path nginx can serve. A custody directory inside the document root, even outside the `status` subdirectory, is a stop.
8. Dependency, serve, hash, and auth reads, before any write:
   - The already-running proxy answers the existing public health URL with the same status code and body shape it answered before this operation. Record that code. Do not restart it to obtain the answer.
   - Authenticated reads of `/status/health.html`, `/status/reports.html`, `/status/status.html`, `/status/common.js`, and `/status/common.css` return the baseline hashes above. An unauthenticated request to those documents still gets the current auth challenge and no document body.
   - No new listener is started. No credential is printed or changed. Owner browser tabs stay on their current URLs.

## Steps and the check after each step

The journal is a version 2 record. It is written in custody, and it includes the transaction id, the document-root and status-directory identity, the document and asset hashes, and each temporary file's exact name, transaction id, device, inode, size, and hash before that temporary file is created. A missing or invalid journal stops with no write. Recovery deletes a file only when that identity matches. Any other name, including a name that starts with `.v216-`, is left in place.

1. Copy the two versioned assets into the private custody store and write the journal. The served directory is unchanged. Check: the three documents still match the baseline hashes, and the recorded directory identity is unchanged.
2. Add `common.v215-42c0928ec30a.css` by an exclusive same-directory temporary file whose intent is already in the journal, fsync, copy metadata, re-read it, and rename only if the bytes and metadata match. Check: the new file's SHA-256 is `42c0928ec30a12de732d3cf8d9469de001046d44d8fa107e6d66393139237b80`, and it is a regular file with link count 1.
3. Add `common.v215-dfd52e64df59.js` the same way. Check: SHA-256 `dfd52e64df59644e9f52562b745bdf5ce6334b3203677d14090d50548d3b7eda`.
4. Replace `health.html`. Check: SHA-256 `11380567f1dba63faf2ce52262a6edbc0f31ea829401c5cd62dfe150bf4834ac`, and the mode, owner, group, ACL, extended attributes, and flags match the preimage. The document-root and status-directory identity are unchanged.
5. Replace `reports.html`. Check: SHA-256 `ee545a532e43c26bf502656d74d477aa04ac9540f7e552e24f3896ffec8b399f` and the same metadata and identity rule.
6. Replace `status.html`. Check: SHA-256 `8ead4bbf3437c6364517a3f9834b732b7776fe7f60069c2eaa4a926255b43d35` and the same metadata and identity rule.

`common.js` and `common.css` are compared again after every step. A change in either file is a stop. The journal is updated only after the step's check passes. A crash is recovered from the private journal, not from a backup inside the document root.

## Inverse

Walk the documents backward: `status.html`, then `reports.html`, then `health.html`. Restore a document only when its current SHA-256 is still the installed value in the table above and its metadata still matches the journal. The restored bytes are the private preimage. The versioned assets are not deleted. Nothing references them once the three documents are back to the baseline hashes.

If a document's bytes, link count, owner, mode, ACL, extended attributes, flags, or the directory identity are not the expected values, that inverse step stops and does not write. The other documents stay as they are. Owner files that are not the three documents are not deleted.

## Read-only checks after a future activation

These are reads. They are not a license to activate.

- The three documents and two versioned assets match the candidate table. `common.js`, `common.css`, and `config.js` still match the unversioned table.
- The same authenticated routes still require auth. The public health URL still returns the code recorded in the preflight.
- The open owner tabs still show the pages they showed before. No tab is navigated or resized by the operation.
- Unrelated services and the report state are unchanged. No worker, notification job, or nginx process was restarted.

## What this packet does not do

It does not merge, deploy, restart a worker or a notification job, change nginx, change credentials, open a new listener, or copy these files into the served tree. A later owner authorization has to name this packet, the product commit, and the live preflight result. A mismatch is not an authorization. A synthetic fixture result is not live user acceptance testing.

The 16 V216 frames stay the visual record for this unchanged status tree: evidence `fb9503f3894f10f9bdb411174cc69074dd5f9e96`, artifact `15237208294`, zip SHA-256 `be49487815638e4b03c086eb97c57ce68ffcbc44e70890fc1213fd12977da9cb`. They are a source preview, not owner acceptance.
