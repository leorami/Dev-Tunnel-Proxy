# V193 one-primary handoff — verified metadata description, never file export

**SOURCE-ONLY / candidate / no Cursor agent started by this handoff.** This is the next safe bounded primary assignment after independently verified V192 RETURNED. The instructions below do not authorize a production change, merge, live Signal endpoint, credentials, owner data or self-heal.

## Immutable source and lifecycle gate

Before beginning, inspect the **latest** Dev Proxy genuine STARTED/RETURNED/STOPPED status across GitHub issues/PRs. Preserve any newer active primary without interruption. V192 genuinely Issue [#234](https://github.com/leorami/Dev-Tunnel-Proxy/issues/234) STARTED comment #7107066680 → RETURNED/STOPPED #7107162813, Engineer PR #235 exact `engineer/devproxy-v192-libsignal-two-peers-20261123@636bbca02b9e72f8505b29b3275ca2288c3c651c`. CTO independently reviewed its only committed one-file receipt delta and actual exact-SHA [Actions #45216561426](https://github.com/leorami/Dev-Tunnel-Proxy/actions/runs/45216561426), Node24.18.1 real libsignal@0.106.0 two-process tests **3/3 PASS**, no Signal service installed.

The separate V193 CTO branch is `cto/devproxy-v193-descriptor-consent-boundary-20261123` at the **full commit SHA in the one-line dispatch**. It descends from **V191 Engineer source** `1f58c57bc407add17d88e41037164604a9b7fee8`, not from V192; V193 and V192 are sibling source branches. Protected `main@590bcf2a980b434f533ddacac43a24a777a933e7` untouched. Do not automatically rebase either sibling branch or install tests in the owner's normal app. Independent V192 source acceptance does not turn its synthetic ratchet keys into a real runtime.

## Specific engineering objective

Independently audit and return the smallest source-only **actual V191 Ed25519 signed identity → independent server-injected grant → source-locked allowlisted artifact metadata** evaluator. This is **not the Signal Protocol** and it never returns file content or a client-supplied path.

CTO source paths:
- `utils/calliope-artifact-descriptor-gate.cjs` — 100-ish line pure CommonJS helper with no I/O or host commands. Inside, genuine V191 verifier checks signature, identity, project, domain, intent, expiry, replay. Independently constructed, strictly shaped synthetic manifest and grant records must match sender/project/artifact digest/source SHA. Success returns frozen `DESCRIPTOR_CANDIDATE_ONLY` and bounded inert metadata with all authority flags **false**.
- `tests/security/v193-calliope-artifact-descriptor-gate.test.cjs` — eight focused tests for good metadata and negative approval forgery, wrong sender/project/source/manifest/digest, expiry, replay, private path/url/bytes injection, duplicate/ambiguous config and post-constructor mutation.
- `.github/workflows/devproxy-v193-descriptor-gate.yml` — Node22 exact scoped V191 + V193 native tests.
- `docs/architecture/DEVPROXY_V193_ARTIFACT_DESCRIPTOR_BOUNDARY.md` — explicit authorization, consent and provenance limitations; this handoff.

### Required checks and return

1. Read the actual source and V191 helper; confirm no user-owned live files, package.json, Config API, Nginx, runtime version or Docker changes. Review how `strictValues` rejects getters, symbols, prototypes, ambiguous fields; how source SHA, grant timestamps and snapshot immutability work; and that a forged `{verified:true}` cannot be accepted.
2. Independently assess *genuine* security failures, including grant provenance not being cryptographically attested in this helper, no actual owner consent claim, per-process nonce replay not restart-durable, and no source byte attestation. Record these as explicit future live-integration blockers, not fake missing development tests that promise they are solved by V193.
3. Run `node --check utils/calliope-artifact-descriptor-gate.cjs`, `node --check tests/security/v193-calliope-artifact-descriptor-gate.test.cjs` and `node --test tests/security/v191-calliope-agent-envelope.test.cjs tests/security/v193-calliope-artifact-descriptor-gate.test.cjs` on an isolated source test environment, with **0 failing or skipped in-scope tests**. Inspect actual GitHub workflow checkout/CI on exact final Engineer return SHA (use `workflow_dispatch` if PR only runs on synthetic merge). No live-mutating `smart-build.sh test:all` on owner machine; follow project canonical script only when genuinely safe for tested scope.
4. If you find a demonstrated in-scope defect, add a bounded RED assertion and root-fix, record the observed RED/actual GREEN. Do not manufacture a remediation cycle solely because V193 security proof is honest about not minting owner grants or implementing real replay persistence.
5. One primary implementation agent owns integration, tests, and report. Evaluate native parallel subagents; likely `NOT_SPAWNED_NOT_BENEFICIAL` given tight coupled helper. Only claim a spawned specialist with a real provider execution ID, exact starting SHA, isolated nonoverlap and one primary integration owner. Child agents never seek owner intervention directly.
6. Return one Engineer draft PR **against this exact V193 CTO branch** (not default main), full SHA, original test logs/results, genuine STARTED → RETURNED/STOPPED GitHub receipts and consolidated scope/risk report. No owner UAT for test-only policy helper.

### Frozen trust boundaries / STOP

NO API listener, actual Signal transport, guest/public endpoint, macOS keychain, true owner consent/credential, auth grant issuance, artifact scan/file read, screenshot byte transfer, auto-heal, Nginx/Compose/ngrok/worker/API restart, user Mac worktree swap, cross-repo mutations, protected main merge or deployment. `trustedGrants` is **synthetic trusted-input configuration for policy eligibility**, not validated real owner authorization. Even a passing match must never report `ownerApprovalGranted:true`. Any live integration needs separate explicit authorized release contract, trusted owner consent/issuer, endpoint enrollment, durable anti-replay, provenance, file confinement and independent CTO owner-facing visual review.

**Definition of Done:** one source-reviewed, reproducible zero-I/O policy candidate with real GREEN focused tests and all authority flags false, one consolidated receipt. Real Signal user messaging and owner-authorized file transfer remain future distinct work.
