# RC2: close environmental opt-outs and legacy management writes (CTO source)

## Source-grounded defect

Engineer-I's actual returned `utils/calliopeHealing.js` at PR #79
`7e1329cc6d0456758bb54dda7c2404cbfa50ee98` allows both
`DEVPROXY_ALLOW_INLINE_DOCKER=1` and `DEVPROXY_DENY_INLINE_DOCKER=0` to
**override** the authenticated spool's no-inline-Docker policy. `utils/proxyConfigAPI.js`
likewise accepts `DEVPROXY_ALLOW_INLINE_DOCKER=1` before checking the spool.
Those environmental escape hatches are unacceptable on the production release
path because a configuration mistake could re-enable privileged, nontransactional
Docker calls while source and new settlement tests appear green.

Source review also identified legacy management operations that write route
files before verified activation, exec/restart arbitrary containers or run
unmediated self-healing actions. Some are reachable behind authenticated API
paths, so authentication alone does not make them transactionally safe.

## CTO implementation

- `utils/rc2-inline-docker-policy.cjs` denies legacy privileged Docker
  whenever the spool variable is present, when `NODE_ENV=production`, or
  `DEVPROXY_DENY_INLINE_DOCKER=1`, regardless of older allow/deny opt-out values.
  Unknown/invalid flags fail closed. Development fixtures without production
  intent remain available. This function runs no Docker and discloses no paths.
- `utils/rc2-management-safety-policy.cjs` classifies **exact** privileged and
  nontransactional API routes for an early authenticated 503 response while
  spool settlement or production mode is active. Keep safe read-only pages,
  health/route inventory, session management and explicit transactional
  endpoints available. This must be called in `proxyConfigAPI.js` immediately
  AFTER the authentication boundary and BEFORE the legacy route handlers.
- `utils/calliopeHealing.js` and `utils/proxyConfigAPI.js` must delegate to the
  shared invariant rather than checking an override first. Guarding one named
  `regenerateNginxBundle()` call is not enough; direct API and AI pathways
  must share the same gate.

## Functional limitation — do not hide it

This first cut denies legacy AI ask/self-heal and direct app install routes
until they can be rewritten through the authenticated transactional mutation
service. A 503 is safer than a false-positive HTTP 200 or a write-before-reload,
**but it is a visible functional regression**. Do not label production feature
parity PASS or invite the owner to UAT until Engineer-I restores transactional
features or the owner explicitly accepts a documented temporary limitation.

## Correct preflight semantics for repair

The current live RC1 has measured API source RW, root API UID, RO route data,
and proxy port drift. Applying an **after-state** security pin to those **before**
containers will necessarily report `READ_ONLY_PREFLIGHT_BLOCKED` repeatedly.
That is useful evidence about what must be repaired, **not** evidence that a
controlled candidate cannot be staged. Owner's fresh 2026-11-04 production GO
permits a bounded repair *once* independent candidate, backup, permission,
source, session, host-spool, nginx and rollback gates are all actually green.
Keep BEFORE inventory and AFTER target attestation separate. No GO follows
from this source module alone. Do not start or restart production Docker if
any critical candidate or preservation gate remains unknown.

## Evidence and exclusions

RED-first test suite covers management exact routes, safe reads, environment
opt-outs, production mode even with injected Docker socket, malformed and
accessor input, and owner-path redaction. No Mac runtime, source scan through
Docker, branch merge, UI change, or production mutation occurred in these tests.
