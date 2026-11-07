# RC2 source-exact replacement candidate — NOT DEPLOYED

## Source-derived problem this implementation resolves

The repository's `docker-compose.production.yml` still describes an API
running as `root` with `/app` writable and a host Docker socket. The actual
accepted secure RC1 host image has **no** socket, but its live API still runs
as root with `/app:rw`, while existing route-data submounts are missing or RO.
The primary Engineer's 2026-11-04 PR #79 return (`660fab4366f7b4c8f8a3c523187202347c1f41dd`)
confirmed a private one-off nested-mount probe (UID 504, GID 20) was viable,
but did not deliver a committed, reproducible exact-two-service replacement
candidate. The existing RC2 before-state is evidence, NOT a required green
match for a future after-state manifest.

This CTO source supplies:

1. `utils/rc2-production-compose-candidate.cjs`: builds a deterministic
   **standalone Compose JSON** for only `proxy` and `proxy-config-api` from
   reviewed pinned custom Brotli nginx + API image **repository digests**,
   non-root Linux container UID/GID, canonical absolute private-stage paths.
   It does not include or recreate ngrok, dashboard, or any Mac worker.
2. `scripts/rc2-render-private-compose-candidate.cjs`: explicit operator
   CLI with **one input file** named `rc2-candidate-pins.json` inside an
   independently owner-private 0700 staging directory; pins file must be
   owner-only 0600, regular, one hardlink, and source-stable. Output is always
   `rc2-compose-candidate.json`, exclusively created 0600, no overwrite,
   synced and never logged to GitHub. The CLI does not use Docker or networks.
3. `utils/rc2-readonly-production-preflight.cjs`: extends *the real current
   accepted hardened preflight* to recognize the additional signed-spool RW
   bind and immutable secret RO bind **only as a pair**, requiring their host
   source paths to be disjoint from proxy and other API exposed sources.
   The four original route/session data dirs must remain RW and `/app` remains
   RO. A private pin cannot whitelist a Docker socket or secret in proxy data.
   The preflight still returns evidence-only and performs two read-only rounds;
   it cannot grant release GO.

## Exact candidate architecture

- Only two existing `container_name` values: `dev-proxy`,
  `dev-proxy-config-api`. Both join existing external network `devproxy`.
- API source `/app:ro` and existing owner `.env:ro`, fixed non-root UID/GID,
  root filesystem RO; required nested route-data (`apps`, `overrides`,
  generated sites, `.artifacts`) RW; only API additionally gets a separate
  private RW signed spool and a separate immutable HMAC secret-file bind.
- **CRITICAL**: host spool and secret paths must be *outside* the approved
  source, all ordinary route/session data, the nginx-shared artifacts, and
  any other proxy or API exposed source. The proxy never mounts these paths.
- No API Docker socket, no `docker-cli`, no `apk add`, no root API, no privileged
  container or additional sidecar. Any fixed-action Docker operation must be
  Mac-host only, explicitly invoked with owner-private pins after separate
  host UID, ACL, image, mount and exact-command verification.
- Proxy main/default nginx config and generated bundle RO; existing
  nginx entrypoint, certificates, status/dashboard mounted RO; existing
  artifact volume RW; custom Brotli-enabled image explicitly digest-pinned.
  Host-published proxy 8080 and 443 restricted to 127.0.0.1; ngrok's existing
  `devproxy` Docker network is preserved for container-side proxy access.
- API `notificationsAPI.js` and `proxyConfigAPI.js` still launch, port
  bindings loopback-only. The production default automatic scanner remains OFF.
  Unsettled legacy AI healing remains blocked; this candidate does NOT
  claim to restore those functional gaps.

## Critical operator steps — no automatic production action

1. Fresh-verify the actual Engineer-I branch SHA, state, 17 routes, session
   inode/mode, authorized owner trusted origins, and images. Establish a
   private owner-Mac stage (0700) **without copying secrets into GitHub**.
   Confirm all candidate source/mount paths exist with correct file or
   directory types; no symlinks/hardlinks; read-only source with nested mount
   targets pre-created. UID/GID must match the *observed Mac Docker Desktop
   mount mapping* and have access to the existing 0600 session and owner env.
2. Independently build/inspect the two exact release images, including Nginx
   Brotli `.so`, `/etc/nginx/mime.types`, and the full loaded `nginx -T`
   include graph. The `image` refs accepted by this generator are **registry
   content-digest references** (`name@sha256:<64>`). If the approved custom
   local image has no usable digest reference, STOP and supply a separately
   reviewed source+image-pinned alternative; do **not** replace it with
   `latest`, an unreviewed tag, or an unbuilt stock nginx image.
3. Prepare owner-private `rc2-candidate-pins.json` (0600) with exactly the
   fields in tests. Run
   `node scripts/rc2-render-private-compose-candidate.cjs /abs/private/stage`.
   Output is private; never commit/render inline in a public receipt. Run
   **`docker compose -f /abs/private/stage/rc2-compose-candidate.json config --quiet`**
   on the Mac and inspect the actual resolved services/mount destinations.
   DO NOT pass either of the old insecure base Compose files as a second `-f`:
   Compose merge can accidentally retain root user or `/var/run/docker.sock`.
4. On the *isolated*, existing authorized private stage only, verify Docker
   Desktop's nested bind-mount implementation, `.env` and secret-file UID/ACL
   access as nonroot, an API write to all four owner-data directories, and
   `EROFS` for app source. Confirm a signed request/reply crosses the real
   Mac↔VM private spool, host owns lease and only fixed commands, and no
   nginx source/include outside the audited root can be modified.
5. Verify a secure, tested backup + recovery path for previous images/routes/
   owner config, session and private keys **without first changing production**.
   Compare the complete new security and functional candidate to the expected
   **AFTER-state** pins; existing BEFORE drift is not an impossible gate.
6. Only if pre-cutover safety, source provenance, host secret isolation,
   feature continuity and recovery evidence are independently GREEN, use the
   **already issued, single scoped owner production GO** for proxy/config API.
   Do not touch ngrok, Mac bridge, credentials, other services, master, or
   unreviewed image/worker privileges. After cutover immediately run the
   AFTER-state read-only preflight, real route operations, session/auth/origin
   preservation and all five Origin runtime checks. Fail closed and use only
   a **verified secure** recovery if any postcheck fails.

This implementation is **source-exact, NO LIVE AUTHORITY**, not proof that the
Mac has been changed or that the 17 routes would all pass a live UAT.
Do not describe `docker compose config --quiet` or local Node fixtures as a
successful runtime deployment.

## Local test evidence

- TDD: missing source modules produced genuine RED tests; the signed-spool
  acceptance and private renderer tests also failed RED before implementation.
- 55/55 Node v22.16.0 local tests: original 17 hardened preflight tests,
  19 source-only Compose compiler tests, 9 independent spool-preflight
  integration tests, and 10 owner-private filesystem renderer tests.
- No `docker` CLI in the CTO container, no Mac private stage, no live verification.
