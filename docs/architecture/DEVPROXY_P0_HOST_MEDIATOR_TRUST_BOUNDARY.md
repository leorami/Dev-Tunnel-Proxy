# Dev Proxy P0 — host reload mediator trust boundary

## Actual evidence and limit

The latest Engineer-I return is PR #59 at `2a5769bd1105543692c7a21a51919e93f03d52d5` (receipt comment on parent PR #58; original receipt commit `d8e6e52717d0759c1d35ca19810a7827d9013b49`). Engineer reported **Mac disposable** route install, promotion, config edit, regeneration, HTTP 422 rollback, 503 quarantine, a 17-route synthetic matrix and 125/125 CTO tests. These are useful implementation facts, **not** approval to change the owner's running proxy or proof of complete production trust. The actual code changes are backend, not UI.

## The precise security distinction

The disposable broker was a Linux **Docker sidecar containing the host Docker engine socket**, while the web-facing API did not have that socket. HMAC and fixed Docker argv reduce the web API's exposed commands, but do **not** remove the broker's full Docker-engine privilege if its process or image is compromised. The original CTO design expected a constrained **owner-controlled host process**, not an extra privileged container. Docker Desktop on Mac was reported not to carry a host Unix socket into a Linux container by simple bind mount; this is a transport feasibility blocker, not grounds to make a long-lived root-equivalent broker the default.

A second independent risk is the disposable `DEVPROXY_ALLOW_CONFIG_EDIT=1` flag. The current HMAC request binds the generated apps bundle SHA-256, **not** the bytes of `config/default.production.conf`, which may contain security-sensitive server directives. A bare environment switch cannot attest the security configuration or authorize its live modification. Retain app/override route mutations where already proved; require a separately reviewed config-content binding and explicit authority for security-config editing.

## Executable prelive classifier

`utils/rc1-route-host-trust-gate.cjs` rejects a sidecar broker with a host Docker socket (`BROKER_DOCKER_PRIVILEGE_BLOCKED`), any Docker engine socket mounted into API/proxy/ngrok, writable API source or owner environment, loss of writable intended route data, non-loopback management bindings, unapproved proxy image, insufficient host transport evidence, unbound active config edits, lost owner routes, and unknown Origin single-app observations. Source-backed regressions: `tests/security/rc1-route-host-trust-gate.test.cjs` (29 Node tests, RED-first), including a fixture reproducing the *reported shape* of the PR #59 test broker. Evidence fields must be corroborated from actual host metadata, not asserted by the applicant.

**Its only successful classification is `HOST_TRUST_PLAN_ONLY`.** Even flawless fixture tests cannot grant production GO, prove owner-current runtime, demonstrate a real Mac host broker, approve a second persistent app, or invite owner UAT.

## Remaining milestone

See [the next bounded handoff](../handoffs/DEVPROXY_P0_HOST_MEDIATOR_RELEASE_BOUNDARY.md). Primary Engineer-I should first establish real host/VM IPC feasibility with **read-only** evidence and preserve the one existing canonical running app. A proposed externally reachable listener, full-engine sidecar, credential or runtime mutation is a genuine owner-only decision; preserve unaffected work and return a precise blocker instead of creating another stack. Protected master merges, new GO, live nginx reload, owner credentials and private route content remain separate authorities. Actual UI changes in a later plan still require Engineer actual-UAT pixels and independent CTO pixel inspection before owner review.
