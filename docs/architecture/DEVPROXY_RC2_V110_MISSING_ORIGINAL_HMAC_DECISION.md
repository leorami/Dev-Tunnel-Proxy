# CTO V110 — reconcile key-loss recovery without fabricating HMAC continuity

## Exact owner-action state (must be first)

**OWNER ACTION GATE: APPROVAL REQUIRED — NEW HMAC EPOCH IS NOT YET AUTHORIZED.** The owner previously authorized durable production recovery (#6673992882) and the exact HTTPS/privacy API correction (#6672650274). Those permissions remain valid, **but excluded generating a replacement signing secret**. The sole primary V108 genuinely RETURNED at `engineer/devproxy-rc2-controlled-release-20261104@de001e1d4f665f1bdc41241db826cb5010c55a54` (#6674108648) with `UNRECOVERABLE_ORIGINAL_HMAC_MATERIAL`. Original 32-byte `activation.secret`, worker pin, and original host-share spool/lease were **not located**; the only discovered Development stub was empty. Existing immutable proxy/API images and reviewed nginx source remain recoverable. The V108 source work/test GREEN did **not** restart production. Laptop reboot explains stopped Docker, not the separate lost temporary mount state.

## The two real recovery choices

**A — authenticated original backup:** Owner provides an actual independently trusted source of the old `activation.secret`, associated pin and queue/lease/replay data where available, through trusted Mac-local access. Existing durable recovery approval can proceed if original continuity and rollback are genuinely proven; the new V110 read-only checker may help compare **copies**, but it cannot authenticate the backup or replay ledger.

**B — newly authorized HMAC epoch (recommended if original cannot be recovered):** Owner explicitly authorizes generating a **NEW** HMAC activation key and a **FRESH** private spool/lease/replay epoch, binding a single vetted Mac worker to verified new proxy identity. Prior lost signed actions/tickets MUST NOT be replayed, accepted, or represented as completed. Any previously issued one-use owner-heal approval must be invalidated and newly reviewed before future application. A new secret is NOT the original. Quarantine (do not overwrite) any old owner-held archives if later found. This is a real break in HMAC settlement continuity, which the owner must knowingly accept. No actual rotation may occur before this NEW grant.

## Security implementation completed independently by CTO

`utils/rc2-recovered-activation-secret-continuity.cjs` is **read-only**: strict owner-private 0700 parent and 0600 regular file, no symlink/hardlink, race-checked open, 32–128 byte nontrivial key, two distinct canonical paths, timing-safe byte comparison, buffer zeroing, fixed/redacted codes. It rejects absent original material; it **never generates a key**, accesses Docker or prints secrets/hashes/host paths. Even when copies match, its result explicitly returns `backupProvenanceVerified:false`, `spoolReplayHistoryVerified:false`, `productionChangeAuthorized:false`, `liveRuntimeAttested:false`. Its 11 RED-first cases were committed prior to implementation; both exact GitHub blob copies (source SHA `03fb2e8930cc1219c93edc96c2a3bdf8cfa42f6a`, test SHA `79a9cce11371c894e3c5c2d610fed7035b05d817`) were checked by `git hash-object` and passed **11/11 native Node v22.16.0** tests in isolated Linux. Native Mac and full `./smart-build.sh test:unit` remain for the primary; CTO never inspected user secrets.

Existing `scripts/rc2-provision-private-host-worker.cjs` runs `crypto.randomBytes(32)`: safe for an explicitly **new** bootstrap, unsafe to call during recovery and then claim "original signing secret restored." This V110 change does not silently alter or call that script. New HMAC generation/rotation must be explicitly marked and owner-approved, with the entire old state invalidated, no fake replay, and new exclusive worker pin/lease proof.

## Priority order, unchanged

1. Make owner-authorized durable RC2 two-service recovery operational as soon as the original material **or NEW rotation grant** permits. Reviewed durable bind mounts, images, 17 route records and existing ngrok domain/config, private backup and rollback; no protected master/owner code changes.
2. Complete already approved exact private HTTPS Origin addition, public-health metadata/privacy fix, local Ask, session/CSRF and owner UAT. Full Origin-five AFTER truthful.
3. P2 proxy may sometimes fail startup while an app upstream is down — tracked #109 and **deferred**. Laptop reboot itself was NOT proof of this issue.

**No work in this branch is deployment authority, no second primary is started, and no new decision is inferred from tests or GitHub metadata.**
