# Dev Proxy P0 v13 — durable final receipt before host fence release (NONLIVE)

## Actual source gap corrected

The v12 host `settle()` completed the second nginx verification, deleted its
`host-settlement-prepared.json` and `host-settlement-inflight.json` markers, and
only then returned the final HMAC receipt. If the host process stopped between
its last unlink and the response delivery, the calling API had no durable final
proof even though another operation might now be allowed. The replay record
still contained only an empty reservation. This makes an otherwise successful
reload difficult to distinguish from an indeterminate one after a lost reply.

## v13 source change

Existing v12 `utils/rc1-two-phase-host-settlement.cjs` is extended, not
replaced. Its `begin`, `prepare`, `settle` contract remains unchanged.

After final nginx/config checks, before either fence marker is deleted:

- Build the same HMAC-signed `HOST_SETTLEMENT_CLOSED` receipt as before.
- Open the existing unique `replay/<requestId>` reservation with `O_NOFOLLOW`;
  check regular file, owner-private mode 0600, one link, zero size, and pinned
  inode. Write full receipt and fsync file and replay directory.
- Only after that durable write, verify marker inode and unlink prepared then
  inflight. Any failure leaves an unresolved quarantine; no automatic reset.
- Return the signed final only after both fence removals complete.

A new export `readVerifiedFinalSettlement({directory,approvedRoot,prepared,secret})`
is READ-ONLY and diagnostic, never a production command or automatic HTTP 200.
It requires exact authenticated prepared HMAC, private directory, absence of
both fence markers before and after reading, a pinned 0600 final replay file,
final HMAC match and equality of the current three-file candidate digest.
Its only positive output is `DURABLE_FINAL_RECEIPT_RECOVERED` with explicit
`productionChangeAuthorized:false`, `liveAttested:false`,
`actualHostAttested:false` and `ownerUatApproved:false`. The secret, contents,
nonce and private paths are NEVER returned. Tamper, stale candidate, marker
presence, unsafe inode, malformed reply and loss of file are distinct blocked
states. Because this is only diagnostic, it does not replace an independent
runtime read or authorize a later reload.

## RED-first and crash evidence

v12 unmodified tests passed 22/22 before the change. The first five new RED
regressions all failed against unmodified v12. After implementation, 14 v13
regressions pass, including separately spawned short-lived Node processes that
actually receive SIGKILL in test-owned directories at two release boundaries:

- After deleting PREPARED, before deleting INFLIGHT: final HMAC is durably
  present but positive recovery is BLOCKED by remaining host quarantine.
- After deleting INFLIGHT, before returning final over transport: both fences
  are absent and the existing sealed replay file can be read back as
  nonauthorizing evidence. Replayed request nonce remains denied.

Total tests on locally reconstructed source: **112/112 PASS** Node v22.16.0,
`node --test --test-concurrency=1 tests/security/*.test.cjs`; this is **not**
the Mac canonical `./smart-build.sh test:unit`. Crash tests use process SIGKILL
on local filesystems, not power-loss or Docker Desktop virtiofs durability
proof. Do not elevate evidence class beyond fixture.

## Release blockers unchanged

Full nginx effective-config provenance (mime.types, image modules), actual
Mac host process worker approval, source/mount identity, replay spool UID/ACL,
noncooperating writer confinement, source permissions, Origin owner runtime
gates and owner production GO remain **unverified/unauthorized**. This is a
nonlive data-integrity correction, not the P0 production cutover.

A permanent replay log needs an operator-reviewed retention policy; **do not
implement automatic deletion** of replay reservations or final records. This
module alone cannot make a hostile same-UID writer safe.
