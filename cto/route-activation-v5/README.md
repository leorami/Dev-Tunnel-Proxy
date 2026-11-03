# Dev Proxy — CTO source-first v5 (125 passing synthetic tests)

This is an **uncommitted isolated CTO implementation artifact**, not a deployed release or a GitHub branch. Engineer-I's latest detected return is PR #56 at `17b5053d6dd3803da57711730ed3f015835fad99`, BLOCKED because CTO v4 source bytes were not accessible in the Engineer's environment. Earlier PR #55 was also RETURNED (test completed) but release BLOCKED on HTTP 422 after persistent route writes.

The v5 package extends the real CTO v4 sources with five consequential security/integrity improvements, described in `docs/handoffs/DEVPROXY_P0_CTO_V5_CONTENT_BOUND_ACTIVATION.md`. Node v22.16.0 on a Linux container: `node --test tests/*.test.cjs` **125/125 PASS, 0 skipped**; `node --check` passed all JS source/test files. See `cycle1-red.tap` through `cycle5-green.tap` and `cycle5-full.tap` for reproducible work and test evidence.

**No Git operations, no live Docker commands, no deployment, no secrets accessed.** API codemod remains source-blob gated and preview-only. Do not claim that Cursor can retrieve these bytes unless explicitly made available in its environment or committed to an authorized isolated CTO branch with a verified full SHA. The repository `.cursorrules` requires explicit approval for commit/push; no implicit authorization is inferred here.

The next legitimate Cursor handoff must be one pinned `origin/<cto-branch>@<40-character-SHA>:docs/handoffs/DEVPROXY_P0_CTO_V5_CONTENT_BOUND_ACTIVATION.md` **after**, not before, the exact files exist on GitHub. Do not recycle a previous SHA from PR #54 or #56 as though it contained this code.
