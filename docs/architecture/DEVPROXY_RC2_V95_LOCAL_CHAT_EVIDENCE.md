# RC2 V95: private local documentation answers without pretending to heal

Status: independently implemented CTO source/test, not integrated into Engineer-owned API or deployed. Parent is the actual V93 RETURNED Engineer-I SHA `cbcadfee47444dbf7cde067997e592b2ead25eb5`; sole Engineer-I is STARTED V94 and must not be interrupted.

## Why this source matters

In secure nonroot/spool mode, `utils/proxyConfigAPI.js` currently rejects `POST ai/ask` using `refuseInlineDocker` BEFORE reaching its original response implementation. The dashboard calls that endpoint when Leo asks Calliope about networking. Although we have restored an owner-reviewed redirect-loop repair and learned-lesson recognition, the ordinary chat experience still reports unavailable. The legacy ask path opportunistically starts Docker, can rewrite overrides, fetch externally, and contains unbounded `parseBody`. Re-enabling it wholesale would break our trust and consent requirements.

The independently coded local-evidence adapter provides a small but usable **non-generative** fallback: answer bounded questions with excerpts and paths from a fixed allowlist of existing tracked project documentation. It is not an LLM or an autonomous healer. If no suitable answer is available, it says so explicitly. It never creates an index or sends a document to an external model. It does not read `.env`, owner `.artifacts`, untracked work, source checkout outside the fixed markdown allowlist, or Calliope's legacy healing KB.

## Implementation

`utils/rc2-local-calliope-evidence.cjs`:
- `readBoundedLocalQuestionBody(req)`: 2048-byte maximum JSON request, exact `{query}` or `{query,maxDocs}` shape; the existing UI sends `{query}` and receives three excerpts by default. No caller-selected URL, root path, model, function name, approval, or host action. A request may only specify query and 1-3 snippets. Authenticated caller status MUST be enforced by existing `requireAuth` and trusted Origin before invoking this reader.
- `answerFromLocalProjectDocs({root,query,maxDocs})`: only eight fixed markdown paths under fixed operator ROOT. Uses `lstat` + `O_NOFOLLOW` + regular inode/nlink/ACL/file-size and stable-read checks to avoid reading symlinks, hardlinks, world-writable content, or oversized files. The root argument is set by code, NEVER client JSON.
- Deterministic, capped paragraph retrieval, explicit local-citation paths, `usedAI:false`, `healingPerformed:false`, `executionAuthorized:false`, `liveAttested:false`, `productionChangeAuthorized:false`, and `networkTransferAuthorized:false`.
- No Docker, network, subprocess, filesystem writes, model prompt, or AI API calls anywhere in the module.

Focused `tests/security/rc2-local-calliope-evidence.test.cjs` began RED with missing module, later 3 more request-adapter RED and a real UI `{query}` compatibility RED; **14/14 local Node v22.16.0 tests PASS**. Conditions include real relevant query, no-match, missing docs, symlink/hardlink, world-writable, huge docs, query traversal `.env`, malformed/oversized requests, poisoned authorizations, deterministic answers and no false execution flags. `node --check` passed. Full macOS canonical integration and browser UI are not claimed here.

## Non-overlapping primary integration after V94 genuinely RETURNS

A later Engineer-I may import source/test/docs without overwriting V94's owner-review API or UI changes. It should RED-first assert current secure `POST ai/ask` yields 503, then add a specific **authenticated and trusted-Origin** secure-mode branch BEFORE legacy `refuseInlineDocker`, only for `ai/ask`, calling the bounded reader and pure docs answer. Preserve old legacy endpoint only in explicitly authorized nonsecure development contexts; never use `OPENAI_API_KEY` implicitly or silently turn on untrusted old healing. Return the existing frontend-compatible `{ok,answer,sources,usedAI}` contract plus explicit `mode:'local_documentation'`, no false healing. Do not write raw user queries to persisted chat files without explicit owner policy; do not advertise an actual LLM or new repair ability. Source-test missing and oversized docs and UI status. `ai/health` should honestly distinguish `local_documentation` from unavailable external-model chat; but do not modify V94-owned UI/API until its actual RETURNED diff is inspected.

## Beyond docs: observe/explain (Engineer V95)

`utils/rc2-local-calliope-observe-explain.cjs` answers two bounded question classes without executing probes or heals:

1. **Fixed-host observation limits** — what `LOCAL_HTTP_HEAD_ONLY` / inventory observation proves and does not prove.
2. **Reviewed heal explain** — propose → one-use `reviewTicket` → Confirm → CAS/`editApp` + HMAC; never auto-applies; never claims a doc excerpt is a completed heal.

Secure `GET ai/health` is answered **before** the legacy mutation control gate with `mode:'local_documentation'` so OpenAI key presence is not the only Ask readiness signal.

Use this as an **independent functional improvement**, not an extra pre-cutover gate; it improves Calliope's ability to answer basic questions privately while richer local models and verified self-healing mature. The existing one-time conditional proxy+API release can proceed as soon as previously authorized recovery, security, owner feature-scope, and independently verified runtime conditions truly pass. Never claim Origin-five AFTER before cutover. Never demand the owner choose permanent degradation; we are actively improving it.
