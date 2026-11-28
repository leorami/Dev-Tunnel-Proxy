# V191 — authenticated Calliope agent messages: first honest trust primitive

**CTO candidate / SOURCE ONLY / no HTTP listener / no transport / no new permissions / no deployment.** Starting point: V190 Engineer-I returned `engineer/devproxy-v190-private-api-prefix-20261122@970b8e509407f8216862cd6cfaa8c722e5b56f70`, PR #229, based on source-only CTO V190 hardening; protected `main@590bcf2a980b434f533ddacac43a24a777a933e7` unchanged. Read the current lifecycle again before beginning another assignment.

## Product direction

Leo wants Dev Proxy to be installed with Trajectory and act as a private, trustworthy doorway to the owner's existing app/project source. A Signal-inspired, conversational Calliope could receive authenticated messages from authorized agents, return approved inspection evidence or files, and eventually propose repairs. **That is the destination, not a capability of this source candidate.** Prefer an elegant conversational experience to asking the owner to manage URLs, tickets and isolated agents.

The closest practical architecture is a *transport-independent message contract* (this slice), then a mutually authenticated private transport, then a separately approved bounded artifact-read service, then a separate consented repair proposal and commit flow. Signal messaging itself is neither a security proof nor necessarily the right transport; a future Signal protocol integration needs a deliberate protocol/library/security review. Do not call this Signal end-to-end encryption or represent it as a Signal integration.

## Boundary and identity

- `utils/calliope-agent-envelope.cjs`: pure verifier for a single non-executable `artifact.describe` metadata request, not an artifact export. An Ed25519 public-key registry is supplied by trusted caller configuration, never request JSON. Exactly one domain-separated signed payload schema with an expected audience, registered sender, project allowlist, SHA-256 content identity, timestamp, expiry <=60 seconds and 256-bit random nonce. Uses raw Ed25519 verification, no private keys or secret storage.
- Reject unknown fields, prototypes, accessor values, invalid signatures, unauthorized sender/project, stale/early/expired requests and replays; replay memory is bounded and unexpired entries must not be evicted to admit traffic. The in-memory replay map does **not** establish replay safety across restarts or multi-process replicas. Any live transport must bring durable/atomic shared replay state or another rigorously reviewed equivalent.
- The accepted result returns only the metadata digest and explicit FALSE for `ownerApprovalGranted`, `exportAuthorized`, `executionAuthorized`, `healingPerformed`, `liveAttested` and `productionChangeAuthorized`. It cannot read files, find project roots, choose URLs, inspect running hosts, access `.artifacts`, reach Docker/ngrok, call model tools, export screenshot bytes or apply repairs.
- A registered sender is an identity **claim verified by a pinned public key**, not an owner grant, role, permission to read files, blanket AgentCapabilityGrant or evidence that a real Trajectory service is configured. Rotating/revoking keys, durable nonce storage, per-project owner consent, end-to-end encryption, auditable redaction, message delivery, responses, trusted installation and endpoint authorization are **not** implemented in V191.
- Never put secrets, signed live requests, private file paths, screenshot bytes, device identifiers or owner data in this public GitHub repository, Actions artifacts or PR. Synthetic fixture data only.

## Security risks that must remain visible

1. A captured signed metadata request must not be treated as authorization or transport authentication; at minimum future service should require independently authenticated mutual TLS, signed audience/source/task-specific grants, replay-resistant delivery and explicit owner consent to file disclosure.
2. The one-per-process replay table loses history at restart. **No production endpoint may invoke this as its only anti-replay barrier.**
3. The fixed `artifactSha256` is an identity, not a retrieval locator or confirmation that the artifact exists, is readable, current or safe to disclose. Do not add client-supplied arbitrary file paths to this schema.
4. Existing protected management API, nginx, proxy host, sessions, API/worker process, owner-private screenshots and current Calliope local-model conversation are outside this change. Protected `main`, new production service and release scope untouched.
5. Zero failed in-scope tests at implementation DONE. Run focused test on actual Node 22; real CI must test exact returned SHA. Focused development suites are appropriate; a full repository suite is required for any actual stage/production release, per Origin #152. Do not suppress failures as legacy.

## Safe staged roadmap

**M1 (this slice):** signed metadata envelope verification, strict negative tests and documented policy; no endpoint. **M2:** independent, explicitly consented artifact-description *lookup* using allowlisted project identities and a stable source manifest, privately served via authenticated transport. **M3:** private encrypted original-byte delivery, source/viewport/hash proof and independent CTO inline visual review. **M4:** Calliope diagnostic conversation that knows its evidence freshness and sources. **M5:** scoped owner-reviewed repair proposals and verified rollback, never silent mutation or emergency authority. Trajectory integration can be planned in parallel but requires its own repo/grant and cannot be assumed live.

## Why this is worthwhile now

It advances the user's Signal-inspired Trajectory↔Calliope vision without confusing a new chat endpoint with secure file access. There is one trust decision to test in isolation, and no owner runtime interference. V190's separate Nginx source safety candidate remains accepted for *source review*, not an implicit live Nginx change. V189's four private screenshots remain inaccessible to CTO, so visual UAT remains HOLD; these pure-message tests do not require UI screenshots.

## Engineering and coordination

One primary Cursor Engineer-I owns final source integration and run verification. Evaluate optional independent specialists once exact scope and available provider-native spawning are known; one coupled small cryptographic helper does not justify parallel writers. Record actual STARTED and RETURNED/STOPPED issue comments, exact full SHA, PR and real GREEN results, plus a single consolidated receipt. Do not claim any agents are launched by creating a handoff. Use existing canonical `./smart-build.sh` only for its documented scope, and no owner-facing app restart. Current main `AGENTS.md` remains a narrower interim visual-evidence addendum; source-pinned master Origin `CORE_COLLABORATION_PROTOCOL.md@fda5e7311b8e0cc692827ad0918fb8fdec1f0250` applies to the proposed coordination model. Project local governance draft PR #123 is old and unmerged; do not blindly merge it over current `AGENTS.md`. Dev Proxy's Origin consumer registry/lock adoption is still tracked in #226.
