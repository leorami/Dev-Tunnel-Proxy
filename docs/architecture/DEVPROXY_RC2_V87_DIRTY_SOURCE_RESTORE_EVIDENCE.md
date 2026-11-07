# Dev Proxy RC2 v87 — prove restored owner bytes without erasing dirty-source evidence

**Source-only CTO engineering. No Mac access, archive extraction, Docker commands, live writes, production GO, or owner UAT.** Review the current sole Engineer-I return before choosing an integration boundary.

## Actual failure to correct

V86 Engineer-I restored the correct CURRENT proxy image in disposable Docker (v85), then produced a refreshed, owner-authorized private config snapshot. The refreshed archive had 17 routes and current `.env`/admin-session modes 0600, with restored file SHA+mode matching live owner files. Nevertheless, `utils/rc2-readonly-config-archive.cjs` returns `RC2_CONFIG_ARCHIVE_INTEGRITY_BLOCKED` solely because the private v2 manifest honestly says `sourceDirty:true`. There are tracked/untracked owner worktree changes outside routes. Blindly setting that flag to false would be false evidence and could lose user work. Repeating a bare NO-GO despite already verified bytes doesn't help.

## CTO implementation

- `utils/rc2-restore-content-attestation.cjs` independently verifies an already-extracted **private** v2 archive. It validates the full manifest schema and all file paths; rejects traversal, symlinks, hardlinks, special files, extras and missing manifest entries. For every listed file it verifies ownership, regular inode identity and stability before/after `O_NOFOLLOW` reading, exact SHA-256 content, size, POSIX mode and millisecond-accurate mtime. The route count is checked against the explicit expected 17; `.env` and admin-session must be 0600.
- An **optional read-only live comparison** independently rehashes every archive-included live file and compares the four fully snapshotted owner-data trees: `apps`, `overrides`, `config`, and `build/sites-enabled`. Newly added app routes or override/config files absent from the archive cannot silently pass. This protects against old archives despite matching file *names*.
- `readPrivateConfigManifest` opens only a 0600 `manifest.private.json` under a 0700 owner-private `private-rollbacks/config-<nonce>` directory, checking owner/inode/size, no symlink, and file stability; `verifyOriginalConfigArchiveHash` separately checks the actual original `config-state.tar` SHA-256 against owner-private `SHA256SUMS.private` with `O_NOFOLLOW`, an unmodified staging file set and no extraction.
- `scripts/rc2-verify-config-extract.cjs` is an explicit **read-only operator command**. It prints only fixed classifications and aggregate file/route counts — never private paths, file contents, Git names, credentials, checksums or secrets. It invokes no Docker, Git, npm, subprocess, network, chmod, tar, utimes or writes. Success at its narrow evidence contract is never authority to deploy.

Run against a **preexisting, disposable extraction** of the owner-private snapshot on the owner Mac (private paths are intentionally placeholders):

```sh
node scripts/rc2-verify-config-extract.cjs --inspect --manifest '<private-rollbacks/config-.../manifest.private.json>' --extract-root '<existing-disposable-extraction>' --live-root '<reviewed-owner-checkout>' --expected-routes 17
```

No other arguments or output files are supported. The source checkout must have canonical native Node and ownership. This tool **does not extract a tar or fix its mtimes**: the existing audited `restoreManifestMtimes` can be applied ONLY to a separately authorized disposable extraction first, never live data. The test-only fixture intentionally populates files directly. On macOS, `bsdtar` may truncate subsecond mtimes, which must be corrected and independently reverified before route-precedence evidence is accepted.

## Result semantics and release boundaries

- `RESTORED_FILES_VERIFIED_DIRTY_SOURCE_UNACCOUNTED`, exit **3**: every included extracted file matches the private manifest, and if a live root was provided, all included live files match; original manifest was honestly dirty. **Untracked/ignored or out-of-snapshot owner work is not established as preserved. This is PARTIAL EVIDENCE, not a release green.** The new verifier does *not* modify the old formal v2 inspector or mislabel it PASS.
- `RESTORED_FILES_VERIFIED_LIVE_INCLUDED_MATCH`, exit **0**: source manifest was clean, and bytes/modes/mtimes + included owner-data inventory match live. It still prints `SOURCE_CURRENT_UNKNOWN; OWNER_WORK_UNKNOWN; NO_DEPLOY` because runtime identity and full owner work are separate gates.
- `RESTORED_FILES_VERIFIED_OFFLINE_ONLY`, exit **3**: bytes proven in disposable extraction but live owner state not checked.
- Any path/symlink/hardlink/content/mtime/live-drift/original-archive-hash or unexpected owner file failure exits **2**. No secret or path is emitted in failure details.

All responses retain `sourceCurrent:'UNKNOWN'`, `ownerWorkPreserved:'UNKNOWN'`, `restoreVerified:false`, `releaseAuthorized:false`, `productionChangeAuthorized:false`, `deployed:false`, and `ownerUatApproved:false` regardless of included-file success.

**To actually close the owner-work gate:** Engineer-I must inventory the dirty tracked and untracked files privately, explicitly protect any nonarchived owner work (notably files outside the allowlist), prove the current exact recovered owner routes/config, and separately verify the secure **nonroot** RC2 candidate's recoverability. No `git clean`, deleted `.cursor` files, downgraded image, false `sourceDirty:false`, or acceptance of degraded AI healing is permitted as a shortcut. The earlier AI-heal owner-scope decision and postcutover Origin five remain unresolved.

## Tests and isolation

RED-first `tests/security/rc2-restore-content-attestation.test.cjs` and `tests/security/rc2-verify-config-extract-cli.test.cjs`: 21 focused tests passing on Node v22.16.0 in an isolated local source tree, covering dirty/clean distinction, missing/extra live routes, stale archive content, precise mtimes, private session/env mode, symlink/hardlink traversal and private 0600 staging; three new RED failures for tampered archive/symlink/mismatched SHA256SUMS were reproduced before implementing original-tar SHA verification. All code is syntax-checked. The actual Mac canonical `./smart-build.sh test:unit`, native bsdtar extraction and owner-private archives were **not** run by CTO.

This lane uses only newly created files, does not touch Engineer-I's v86 API/audit branch, production, the Mac bridge, ngrok, master, credentials, images, or existing owner snapshots. Import at a verified idle coordination boundary, not while another Engineer assignment is active.
