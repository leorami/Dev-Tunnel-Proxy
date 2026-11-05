# RC2 v90: read-only management GETs must not change nginx routing

**Status:** isolated CTO implementation. Not integrated into primary Engineer-I, not deployed, and not an additional production permission.

## Confirmed production-boundary defect

At returned Engineer-I v89 SHA `e7693151a71ea11dfe37b7c6afcefc8b85cd41e9`, authenticated `GET /apps/diagnostics` and `GET /apps/active` each call `spawnSync('node', generateAppsBundle.js)` when the expected `.artifacts/bundle-diagnostics.json` is absent. This generator writes `build/sites-enabled/apps.generated.conf`, diagnostics and conflict files without the explicit cross-process transaction and signed Mac host activation used by `POST /apps/regenerate` and route edits. A GET can change persistent generated routing files, even without a reload. The legacy behavior also hides missing evidence by returning `ok:true` with a synthetic empty list.

## CTO source correction

- Two existing GET handlers now call `readExistingBundleDiagnostics` and **never** regenerate or change configuration. The `GET apps/diagnostics` payload stays `{ok:true,...diagnostics}` when the artifact exists; `GET apps/active` remains `{ok:true,active:included}` with the generated order preserved.
- The new reader opens only the exact preexisting, regular `bundle-diagnostics.json` under the fixed server-owned artifact root. It enforces a 256 KiB cap, no symlinks or hardlinks, no group/world writable metadata, inode/ownership/mode/mtime/ctime stability, no redirects or scripts. The JSON must contain a bounded included array; missing, unsafe or malformed artifacts are explicit **503** errors with fixed codes, not false empty success.
- The explicit authenticated transactional `POST apps/regenerate` is deliberately unchanged. Operator or UI must choose that operation to regenerate routing data; no automatic writes triggered by a GET. It must retain the HMAC activation rules for `reload:true`. No refresh of production data or Docker action occurred in this source lane.

## Compatibility / evidence

Intentional behavior change when artifacts are missing: old GET caused a hidden write and could return a synthetic success, new GET yields 503. Primary Engineer-I must inspect actual owner dashboard/status handling, explain where the authorized regenerate action lives, verify no silent refresh loop, and run canonical native Mac tests. No source-only fixture establishes live UI parity, automatic routing recovery, the five Origin runtime fields, or production GO. This patch does not relax the owner-only AI-heal scope decision or the verified dirty owner recovery gate.

Node v22 local RED-first test failed with `MODULE_NOT_FOUND` before the helper existed; after implementing the helper **7/7 unit tests passed**. Full API static contract test is shipped for complete repo checkout and must be run with the primary Mac suite; not claimed locally. GitHub source must be read back byte-exact before dispatch.
