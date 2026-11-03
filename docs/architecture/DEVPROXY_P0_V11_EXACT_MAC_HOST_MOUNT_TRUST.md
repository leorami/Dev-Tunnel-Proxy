# Dev Proxy P0 — v11 host-only Docker mount, image and execution boundary

## Why this exists

Engineer-I completed PR #71 on actual source `c20c1eeb1f2c87297a37e04e0eac46777f8a66a5`: v10 synthetic nginx-file identity composition, not production. Existing v5 `host-execfile-adapter.cjs` already pins the FULL 64-hex Docker container ID, image ID and running state before fixed nginx commands. It did **not** check (1) elevated Docker privileged status, (2) whether the container's private host mounts had drifted to another source, (3) whether nginx code/config mounts became writable, (4) whether a previously unexpected mount or Docker socket appeared, or (5) those properties again after a reload. Signed config bytes alone cannot establish an immutable, correctly mounted runtime.

## CTO-authored source

`utils/rc1-host-mount-locked-docker-driver.cjs` composes the ORIGINAL v5 host Docker adapter; it does not replace its proven fixed ID/image/command implementation. An independently reviewed PRIVATE host-only `expectedMounts` list binds **every** expected destination, exact Docker-inspected SOURCE (private, never printed), `Type=bind`, and exact `RW` boolean. The three critical nginx mounts MUST be read-only. The only explicitly allowed RW mount class in this conservative candidate is `/usr/share/nginx/html/.artifacts` (never an nginx config/code path). Any unexpected mount, bad JSON, duplicate destination, any `docker.sock`, privileged=true, wrong image/ID, or nonrunning container fails CLOSED. Constructor accepts only fixed vetted Docker executables. A separate callback gate is required even for two fixed `nginx -t` or `nginx -s reload` commands; NO arbitrary shell or CLI args accepted. Inspect outputs never become user-visible fields.

The adapter rereads pinned ID/image/running + privileged bit + entire mount set BEFORE and AFTER each fixed action. Inspect is via bounded, sanitized-environment `execFile` on Mac host. This is a **test-owned source candidate**, not a live service or owner authorization grant. It is intentionally honest about possible execution: `mayInvokeHostDocker:true`, `ownerAuthorizationEstablished:false`. The injected authorization callback in tests stands in for a future approved operator scope, not owner consent by itself.

### Limits it does NOT solve

- Filesystem source symlink/realpath, file content, inode stability and Mac Docker Desktop mount provenance still need independently trusted host evidence. The exact `Source` strings must come from operator-approved private configuration (never inbound HTTP/spool requests). The Docker inspect output is not itself a root of trust if the host or Docker daemon is compromised.
- A full image digest, read-only mounts, three-file identity and nginx include closure do NOT yet attest `/etc/nginx/mime.types`, image-supplied module files or all nginx parser/runtime effects.
- The v7 fence-release / v8 outer-settlement race is STILL OPEN. This adapter narrows identity + mounts but does not create a cross-process content lease or block noncooperating writers.
- Host privilege capability to run `docker exec` remains sensitive; approve ONLY an isolated, accountable Mac host process under a future specific owner GO. This implementation never installs/starts that process and does not mount `/var/run/docker.sock` in any container.
- Existing running RC1 API `/app` remains RW and its route API spool is NOT live wired. This work does not change those facts or permit a recreate.

## Test evidence

RED-first missing-module reproduction, then native Node22.16 source tests (no Mac Docker). Fixed-action driver tests cover malicious mount additions, RW drift, changed/duplicated source, short IDs, image mismatch, rootless engine-socket absence, changed after reload, aborted requests, hanging/malformed inspect and explicit privilege. Integrated source-shaped read-only test uses v10 exact loaded-file hostView + v9 effective include closure + host-attested fake Docker calls. Every positive result is synthetic and NOT_RUNTIME_ATTESTED. Canonical macOS suite is NOT independently run by CTO.

## Security and owner controls

No service startup, ngrok change, privileged sidecar, new listener, host worker installation, owner .artifacts mutation, secret/session access, merge, deployment or owner UI UAT. Keep original consumed RC1 GO consumed. Git operations only on isolated CTO branch. For any future UI work, source-bound screenshots must be independently inspected and approved by CTO BEFORE inviting owner UAT.
