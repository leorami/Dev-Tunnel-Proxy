# V191 one-primary handoff — Signed Calliope agent metadata boundary

**PREPARED / NOT STARTED / SOURCE ONLY.** No live Calliope inbox, agent connector, Signal integration, screenshot transport or deployment is authorized. Review parent issue #228 genuine STARTED #7091751640 → RETURNED/STOPPED #7091769360, exact Engineer `970b8e509407f8216862cd6cfaa8c722e5b56f70` before starting. CTO's isolated V191 source branch starts from that returned Engineer source; protected main remains `590bcf2a980b434f533ddacac43a24a777a933e7`. Check *fresh* remote tips and every newer primary status; do not interrupt an actual active primary.

## Goal and contract

Establish a tiny honest cryptographic identity primitive for future authenticated, private Trajectory↔Dev Proxy↔Calliope messages. **No file disclosure or healing authority** is delegated by this signed message. The product intent is described in `docs/architecture/DEVPROXY_V191_SIGNED_AGENT_MESSAGE_BOUNDARY.md`. V190 Nginx source and V189 authentic owner screenshots are separate release/visual gates and must not be modified.

CTO candidate is source-only and includes:
- `utils/calliope-agent-envelope.cjs`: Ed25519 verification, domain separation, fixed intent/audience, strict shape, project allowlist, expiry/nonce replay and all authority flags false.
- `tests/security/v191-calliope-agent-envelope.test.cjs`: positive signed identity, wrong-key/domain/intent/project/expiry/prototype/extra-field negatives and bounded replay denial.
- `.github/workflows/devproxy-v191-agent-envelope.yml`: Node 22 syntax + focused security tests.
- Architecture canon and this handoff.

## Primary assignment

1. Verify most recent real STARTED/RETURNED/STOPPED, remote V191 CTO branch FULL SHA, Engineer V190 return exact SHA, and protected main SHA; use exactly one primary worktree/author. Post authentic STARTED only after actual Cursor execution begins.
2. Inspect the committed candidate and source against the established auth, owner-heal and local-model boundaries. Assess actual crypto risks (key/algorithm confusion, canonical encoding ambiguity, replay, unexpected accessors/prototype pollution, time, signer-project authorization, duplicate config and signature encoding). Don't introduce another cryptographic protocol, transport, daemon or a live API.
3. Run canonical focused `node --test tests/security/v191-calliope-agent-envelope.test.cjs` and Node 22 syntax checks with actual exits. If a security test discovers a genuine gap, add a bounded RED assertion and fix the root cause. **All relevant in-scope tests must pass with zero failures/skips.** No skipped test or fabricated GREEN. Confirm GitHub Actions ran against the exact final returned SHA (if a detached PR workflow path requires a workflow dispatch, record the actual reason and outcome); no release-scope full suite is claimed.
4. Verify a valid signed request returns metadata only; unauthorized intent, file path, screenshot download, arbitrary URL, host operations or healing never become possible. In-memory replay is only per instance: do NOT present this as multi-process security, persistent receiver readiness or owner's approval. No private keys in repo or logs; tests generate ephemeral synthetic keys.
5. Return one reviewed Engineer draft PR based on the CTO branch. The allowed delta is an isolated documented helper/test/CI correction and one consolidated completion receipt. No private owner Mac inspection, credential changes, source mount swaps, process recycle, Ngrok, Nginx -T/reload, Docker Compose, code merge, live remote messages, Signal library or project-specific Trajectory repository writes.
6. Evaluate specialists honestly. Coupled small crypto contract likely `NOT_SPAWNED_NOT_BENEFICIAL`; if useful independent read-only crypto review is possible and truly launched, list genuine provider run ID, exact base SHA, own task, evidence and disposition; one primary integrates and verifies.
7. Post one authentic RETURNED/STOPPED with exact full SHA, PR/diff, test commands/exits/CI and explicitly no live activation. CTO independently reviews source and CI before next step. Source outcome is NOT runtime/owner UAT.

## Follow-on work (not this assignment)

A separately planned M2 should bind authenticated sender/project to an allowlisted *description* of an already identified artifact. Owner-authorized private byte transfer, source/runtime attestation, screenshot embedding, secure transport, message E2EE and approved repair flows each remain separate trust boundaries. Do not turn `artifact.describe` into an implicit `artifact.export`.

**Stop:** Any request requiring live host, secrets, owner grant, protected branch merge, new internet service, data transfer or release scope must be deferred and reported; do not silently enlarge source-only permission.
