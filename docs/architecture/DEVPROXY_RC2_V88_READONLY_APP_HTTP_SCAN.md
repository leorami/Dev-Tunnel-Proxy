# RC2 v88: evidence-only, no-side-effect app route HTTP inventory

Status: **INDEPENDENT CTO SOURCE ONLY. NOT INTEGRATED INTO API, NOT DEPLOYED.** This does not authorize new production changes, owner UAT, functional parity, or a second Cursor primary.

## Source-grounded failure

`POST /devproxy/api/apps/scan` in the Engineer-I v86 source (SHA `1b8947ea83a5de44ab9370a4ec48bf1842715677`) still calls `spawnSync('node', test/scanApps.js)` with an owner-supplied `base` and an inherited environment. The script creates `.artifacts/reports`, reaches the ngrok-origin discovery layer, fetches HTML/JS/API candidates, attempts WebSocket upgrades, writes reports, and probes user-controlled URLs. Secure-mode `rc2-management-safety-policy.cjs` correctly blocks it. Removing the deny rule to recover functionality would restore unbounded network/process/file effects and bypass the independent authenticated host worker.

## Standalone implemented module

`utils/rc2-readonly-app-http-scan.cjs` provides `readExistingRoutes`, `deriveSafeAuditRoute`, `scanExistingAppHttpRoutes`. No API route or security denylist is modified in this independent CTO lane.

- Reads *only the existing* `.artifacts/bundle-diagnostics.json` with `O_NOFOLLOW`, one regular hardlink, bounded 256-KiB payload, stable inode/mtime/ctime, and no group/world write. If missing or unsafe, it explicitly reports `READONLY_HTTP_SCAN_UNAVAILABLE`; it NEVER runs `generateAppsBundle.js` or creates a synthetic artifact.
- Validates the actual `generateAppsBundle.js` schema: `included: [{kind:'app'|'override',pathSpec,source}]`, max 128 source rows. Rejects inconsistent source kind, unexpected file names, invalid object types, and invalid JSON. No source content or owner-private paths are ever reflected in HTTP results.
- Converts **only literal** nginx location paths to safe route selectors: normal `/app/`, exact `= /app`, and `^~ /app/`. Excludes regex, root catch-alls, management/private prefixes, dot segments, URLs, encoded/query/fragment/duplicate-slash inputs. De-duplicates paths, limits network observations to 32, records skipped count and truncation.
- Invokes the already tested `createConstrainedLocalHttpAudit()` instance from v86 only via injected `probe.audit({url:'/app/'})`: that adapter owns the fixed `HEAD dev-proxy:80`, no remote host, redirect or credentials. The scan itself performs **no network, shell, Docker, file write, route reload or source mutation**.
- Reports each bounded HTTP status, counts and `READONLY_HTTP_SCAN_EVIDENCE_ONLY`, with `browserAudited:false`, `healingPerformed:false`, `sourceCurrent:'UNKNOWN'`, `realAppVerified:'UNKNOWN'`, `deployed:false`, `ownerUatApproved:false`. An HTTP-200 is not a browser audit or a production Origin-five PASS. Any invalid/noisy probe response is recorded as unavailable, not green.

## RED-first evidence and future integration boundary

CTO isolated Node v22 suite deliberately failed RED when module was absent, then passed 12/12 source-only fixtures. Tests check fake routes, malicious URLs/metadata and admin prefixes, symlink/hardlink/unsafe ACL/oversize, missing artifact no writes, failure redaction, duplicate/regex skip, bounded request count and honest output flags. These are not a Mac native test or owner-route browser UAT. Run actual canonical `./smart-build.sh test:unit` and real owner authenticated API integration checks only **after** primary v87 returns and a code-review reconciliation against its actual latest SHA. There may already be v87 work to restore `apps/scan`; do not duplicate or overwrite it. If it has independently satisfied the same contract, defer this module; if not, the primary can integrate it behind the existing login/Origin gate without removing the security deny on the legacy `scanApps.js` handler.

Full legacy `scanApps.js` parity (HTML/JS/assets/WebSockets + ngrok) and safe AI healing remain **NOT IMPLEMENTED**. Owner's existing conditional production release gates remain unchanged.
