# Architecture decision — official libsignal, latest validated stable release

**Owner decision (2026-11-23, America/Chicago): ADOPT OFFICIAL LIBSIGNAL.** Its maintainers' explicit statement that third-party use is unsupported is an **accepted engineering/maintenance risk**, not a reason to substitute custom cryptography or abandon the protocol. The owner did **not** authorize external contact, distribution without applicable license compliance, credentials, production deployment, persistent keys, new services or protected-branch merges by making this technology choice.

## Canonical dependency

Use the upstream **`signalapp/libsignal`** project and official **`@signalapp/libsignal-client`** Node package. Never confuse it with the unrelated `libsignal` npm package or a homegrown Signal-like protocol.

As verified by V198 original [Actions #45322981573](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45322981573) on 2026-11-24 03:57 UTC, upstream [release](https://github.com/signalapp/libsignal/releases/tag/v0.108.6) and npm latest both identify **v0.108.6**; this exact package passed **30/30 source-focused native Signal tests** on Linux Node24.18.1. The earlier npm delay correctly held the gate; it is now resolved. This is not macOS product-runtime qualification. The official package declares **AGPL-3.0-only**, and upstream says external use is unsupported. These are factual obligations/risks to track, **not a veto of the owner-chosen technology**. Never claim that a personal relationship guarantees official support, authorization, a commercial-license exception or third-party approval; no contact is initiated.

**Meaning of "always the latest, tested version":**
1. At each upgrade check, resolve the current upstream stable release and npm `dist-tags.latest`; record both the requested candidate and the exact installed version. A release on npm without a corresponding verified upstream stable tag is a **HOLD**; never implicitly ship an unverified preview tag.
2. Run the official-library PQXDH PreKey/Double Ratchet **real** tests between distinct isolated OS processes, encrypted signed-descriptor integration, identity/recipient/tamper/replay/denied-export regressions, typed session lifecycle, and all relevant security/owner authorization tests. Capture exact source SHA, package version, installation integrity and test result. New upstream APIs may change; fix the actual compatibility issue before promotion, never falsify or skip tests.
3. Only a candidate with full GREEN scoped tests becomes the **currently validated version**. **Pin its exact semver and lockfile/integrity** in whichever runtime is eventually authorized; never use an unbounded `latest`, caret, floating version or network-time installation in a production deployment.
4. When a newer stable appears, mark prior version `UPDATE_AVAILABLE / NOT CURRENT` and run compatibility CI. Hold production upgrades while that candidate is not proven. Do not silently downgrade or say the untested version is current. If a security release requires emergency upgrade, separately record the risk and authorized release decision.
5. Test native library support on the **actual approved target runtimes** (Mac ARM64 and x64 as relevant, separate native sidecar or supported Node version). Prior 0.106.0 Linux Node24 tests are historical proof and cannot validate v0.108.5, macOS builds, running owner Dev Proxy Node18, Trajectory Node22 or deployed Calliope Node22.
6. CI version-check is **read-only against registries** and only installs the selected package in a disposable GitHub Actions runner temp path. It does not change the existing app, install dependencies on the owner Mac, deploy services, create keys, register a Signal account, change ngrok/containers or issue owner-granted capabilities.

## Release and legal separation

The owner affirmatively chose official libsignal despite unsupported third-party API/support. Do **not** repeatedly treat lack of upstream endorsement as a product-strategy blocker. It remains a tracked **maintenance risk** requiring compatibility tests and fallbacks, especially when upstream breaks ABI/API.

AGPL-3.0-only is an independent distribution/network-service compliance obligation. Product integration needs an appropriately reviewed approach to licensing and source obligations; accepting unsupported status does **not** create a license exception or permission to ignore applicable terms. Qualified counsel can advise on planned architecture. No assumption that outside help is guaranteed.

The genuine live delivery NO-GO from V195 remains narrowly scoped to **missing real**: trusted enrollment and owner grant issuer, authenticated private ciphertext transport, crash-safe ratchet/prekey state, owner product installed-source attestation, approved install/release process, and applicable license compliance. Version selection is now **DECIDED** and no longer a product choice to revisit.

## Version-validation gate (current non-production CTO work)

`.github/workflows/devproxy-libsignal-latest-compat.yml` installs the **current npm stable candidate** into an ephemeral runner (never product `package.json`) and tests already source-grounded V192/V194 end-to-end Signal paths. A successful run establishes *Linux Node24 test compatibility for the recorded version*, **not** actual owner-Mac or installed product readiness.

When the current upstream tag/package pair changes, the project's **version pin for a future authorized runtime** must be reviewed and updated to the newly passing exact version. The latest package must never auto-deploy merely because a CI run passed.

The owner-facing next milestone remains one **real** and authenticated Trajectory Room → enrolled Calliope `artifact.describe` → non-executable Room reply, after the separate owner-scoped runtime, pairing and release approvals. Stop adding standalone cryptography demonstrations unrelated to that path.
