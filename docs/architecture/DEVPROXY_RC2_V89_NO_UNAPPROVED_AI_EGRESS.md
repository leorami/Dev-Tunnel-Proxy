# RC2 v89 — owner consent for external embeddings and status provenance

Status: **isolated CTO patch, source-only. Not deployed; no Cursor launch or release authority.**
Starting source: sole primary Engineer-I v88 RETURNED at `88e9ed0b5af7a79a76a91ea1a935aba23a111709`. This branch reconciles the earlier standalone v89 security tests onto the actual returned v88 source and also repairs a newly discovered false-success self-check behavior. It does not change the HTTP scanning module, host worker, image, mount, or running application.

## Proven correctness defect

The production API contains **two** handlers for `POST ai/reindex`, both collecting local documents, chunking them and invoking `embedChunks` using the configured remote OpenAI embedding model. It also contains `POST ai/thoughts/inject`, a debug-only route that accepts arbitrary messages and pushes synthetic management status events. The existing `rc2-management-safety-policy.cjs` did not deny either under protected production/spool modes; its old test expressly asserted `ai/reindex` should be allowed. Admin authentication alone does not establish the owner's consent to upload documentation or manufacture status history.

Prior CTO draft PR #83 had discovered these defects and proposed a policy fix, bundled with a behavior-changing GET diagnostics patch. This v89 branch **reconciles only the two narrow policy protections onto the latest actual primary SHA**. We intentionally do not force the GET change from PR #83 into active v88 without dashboard compatibility verification. PR #83 stays untouched.

## Contract

- Fail closed for `POST /ai/reindex` and `POST /ai/thoughts/inject` when *any* of the existing secure modes apply: configured HMAC spool, `NODE_ENV=production`, or explicit deny, regardless of legacy allow flag.
- Preserve other existing secure denials and the transactional route-control paths (`apps/install`, `apps/create-route`, `apps/regenerate`, `overrides/promote`) and read-only management responses.
- The old unsecured developer fixture remains unchanged; changing local AI egress policy outside the scoped RC2 release would require separate review. No external-model invocation is authorized by this patch.
- The API's existing authenticated handler and fail-closed security gate precede all such sensitive route handlers. Source test checks ordering; native full-repo unit suite required before integration.
- No owner route state, Docker identities, admin session, saved credentials, macOS bridge or ngrok changes, production deployment, protected merge, or AI-healing parity claim.

## Evidence / integration

CTO verified the live primary API source and security-policy source via GitHub. A new isolated Node v22 fixture reproduced **six genuine RED failures** (both sensitive POST routes allowed in each of three secure-mode settings). After applying the same minimal denylist intervention from PR #83, the focused test returned **10/10 PASS**. The standalone source contract parses, but cannot run against the complete API in the limited CTO fixture; Engineer-I must run it and the canonical `./smart-build.sh test:unit` in the actual checkout at the next safe integration boundary. Independently compare the returned v88 implementation and reconcile only nonoverlapping source paths. No code is deployed by testing or draft PR creation.

## New independently reproduced self-check truth defect

The returned v88 secure `POST ai/self-check` handler ignored its request body entirely. An authenticated `{"heal":true}` or `{"advanced":true}` was silently treated as a successful read-only app inventory (HTTP 200), despite `healingPerformed:false`. An explicit `?http=1` on a missing or malformed diagnostics artifact also yielded HTTP 200 with an unavailable subreport. These are operational-trust failures; an owner must be able to distinguish a requested repair from an observation.

New code in `utils/rc2-secure-self-check.cjs` adds a 2 KiB bounded JSON parser, explicitly refuses unavailable healing (`SELF_CHECK_HEAL_UNAVAILABLE`) and unimplemented targeted observations (`SELF_CHECK_TARGET_UNSUPPORTED`) without touching Docker. It returns HTTP 503 when an explicitly requested HTTP scan has no valid source, but preserves `POST ai/self-check` inventory-only default. The real API handler calls this bounded parser **after authentication and before** any status output or legacy deny. It does not forward secrets, shell commands, or external model requests.

Focused Node22 tests reproduced 6 external-egress RED failures, two missing/corrupt diagnostics RED failures and four absent request-parser RED failures; after both repairs, **19/19** focused tests passed. Additional static full-API source contracts and canonical Mac suite must run in primary checkout before integration. This change does **not** restore healing; the consolidated owner decision remains open.
