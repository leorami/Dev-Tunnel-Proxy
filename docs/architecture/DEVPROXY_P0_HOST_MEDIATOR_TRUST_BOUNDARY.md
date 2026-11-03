# Dev Proxy P0 host broker source-only trust gate

Source at exact independently verified Engineer-I PR #59 return `2a5769bd1105543692c7a21a51919e93f03d52d5`. No production operation is performed by this module; no secrets or real route texts are consumed. The acceptance result never authorizes deployment.

Test locally: `node --test tests/security/rc1-route-host-trust-gate.test.cjs`

`BROKER_DOCKER_PRIVILEGE_BLOCKED` prevents Mac disposable success with a socket-bearing Docker sidecar being mistaken for an approved host-process trust boundary. `CONFIG_EDIT_TRUST_NOT_PROVEN` blocks an unbound nginx security-config edit, and the remaining classifications protect API mounts, service identity, protected ports and the five Origin canonical-app fields. All evidence inputs require independent corroboration: synthetic booleans alone do not establish real Docker state.

Only the next source-approved Engineer-I performs Mac feasibility/proof on the normal single canonical app and returns a blocker if a new privileged host transport would require additional owner authorization. See `docs/handoffs/DEVPROXY_P0_HOST_MEDIATOR_RELEASE_BOUNDARY.md`.
