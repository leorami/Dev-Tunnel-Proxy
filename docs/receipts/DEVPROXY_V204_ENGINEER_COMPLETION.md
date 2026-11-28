# V204 engineer completion — Node 24 image-only candidate, owner API not switched

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7152068192
CTO pin: `origin/cto/devproxy-v204-rc2-node24-image-only-20261124@2821a11cf2e10e09b49d24dad98e491a64faef10`
Disposition: `READY_FOR_OWNER_IMAGE_CUTOVER_AUTHORIZATION`

No container recreate, nginx reload, worker restart, Compose launch, source replacement, or owner-stack image change.

## Baseline

The loaded Config API is not this Git branch. Docker context `desktop-linux`. The API container has no Compose project labels. The durable `compose/` directory is empty, so the effective source is the running inspect, not a generic Compose file. Those generic files were not used to launch anything.

| Surface | Evidence |
| --- | --- |
| `dev-proxy-config-api` | Still running. Image `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`, tag `node:18-alpine` preserved. Process Node v18.20.8, npm 10.8.2, `linux/arm64`. User `504:20`, read-only root, `cap_drop: ALL`, `no-new-privileges`, private IPC, not privileged, restart `unless-stopped`, loopback `3001` and `3002` on network `devproxy`. Command still starts the spool helper, `utils/notificationsAPI.js`, and `utils/proxyConfigAPI.js`. |
| Product closure | Read-only durable product mount, with writable overlays for apps, overrides, artifacts, and sites, plus a read-only env file and activation secret. Loaded `utils/proxyConfigAPI.js` sha256 `81782180cf7821e25f14378837c0a3f88c1234cf2a722ad194e341749c5fbdf3` differs from this branch. `utils/notificationsAPI.js` and `scripts/rc2-create-api-spool.cjs` match this branch. Loaded `package.json` has no dependencies and no `node_modules`. |
| `dev-proxy` | Unchanged nginx image `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1`. Worker pin matches this container id, image, and all eight mount destinations and sources. `nginx -t` succeeded. Upstreams are static names for the API container, with no `resolver` and no variable `proxy_pass`. |
| `dev-ngrok` | Left running. Not recreated. |
| `devproxy-calliope-hosted-1` | Separate Node 22 container. Not the Config API. Not changed. |
| Host worker | One supervised process, pid matched the durable pid file and the singleton lock. Not restarted. Homebrew Node remains the worker runtime and was not switched. |
| Host notification agent | Existing agent still running. The bridge plist is not loaded. No second notification service was started. In-container notifications answered on their existing listener. |
| Queue | One settled request/response pair from 2026-11-07, status `CONFIG_SET_DIGEST_MISMATCH`. Prepared, acks, and replay directories are empty. Not cleared. |
| HMAC epoch | Existing owner-approved epoch left in place. Not rotated. |
| Public checks | Public health JSON `200` with status ok. Anonymous private API denied. Foreign origin denied. No signed-in owner session was used. |
| Dirty checkout | `master@150d0e792bfca886a1509d07618aa2c5eedd5500`, ahead 210 / behind 192 of `origin/master`, uncommitted dashboard/status/compose edits. Not checked out over. |

Raw inspect, environment values, secret material, private paths, hostnames, and route text stay on the owner host.

## Candidate

Official `docker.io/library/node:24-alpine` index digest is still `sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5`. The local `docker image inspect` id is that index digest. It is not the config id and not the platform manifest.

Platform manifest for `linux/arm64/v8`: `sha256:f44b069ce4b5d00cb4f7dff81821a4a6953e3790420040abf300139b1d317c6c`.
Image config digest: `sha256:9ca3f7b76099c042f1e655ca8936e0a1ccda68b3c74a8a36375428ef76476d4e`.
Local rootfs diff ids match that arm64 image. Node.js security index still lists 24.22.3, 22.23.5, and 26.13.1. Node 26 was not qualified.

Activation pin, not applied:

`docker.io/library/node@sha256:f44b069ce4b5d00cb4f7dff81821a4a6953e3790420040abf300139b1d317c6c`

The source guard accepts any `docker.io/library/node@sha256:` digest. The index digest and the config digest are therefore not distinguished by that guard. The pin above is the platform manifest verified from the registry. No mutable tag was pulled.

Reviewed image-default differences, and no others:

- `NODE_VERSION` would change from `18.20.8` to `24.22.3`.
- Image npm is 11.19.1. The API command does not invoke npm.
- `YARN_VERSION` stays `1.22.22`. `PATH` is the same. `docker-entrypoint.sh` is byte-identical and ends in `exec "$@"`.
- Explicit user stays `504:20`. Mounts, command, capability set, read-only root, ports, IPC, restart policy, and explicit environment keys stay as they are.

`assessApiImageOnlyTransition` on the effective before/after documents, with only the API image set to the platform pin, returned `RC2_API_IMAGE_ONLY_SOURCE_MATCH` (`imageOnly: true`). The guard still reports `imageProvenanceVerified: false`, `runtimeAttested: false`, and `productionChangeAuthorized: false`. An extra environment mutation returned `RC2_API_IMAGE_ONLY_CONFIG_DRIFT`.

## Proof

- Explicit Node `v24.22.3`: `node --test tests/security/v204-rc2-api-image-only.test.cjs` — 5 pass, 0 fail, 0 skip, 0 todo.
- Same binary, `node --check` on the 43-file loaded startup closure — 0 syntax failures. No `SlowBuffer`, `new Buffer(`, `process.binding`, or `require('sys')` hits. No source delta.
- Disposable rehearsal, `--pull never`, no network, no published ports, read-only, `cap_drop ALL`, user `504:20`: printed `v24.22.3 arm64 linux 504 20` and was removed. It was not a second owner app.
- Frozen-pin Actions #45535393560 remain the source CI evidence: Node 22.23.5 and 24.22.3 each 28/28, zero fail/skip. This receipt does not claim a new Actions run.

## Authorization and rollback

No still-applicable owner grant covers this exact one-service image migration. The HMAC epoch grant, the durable recovery grant, and the 2026-11-05 API-only corrective apply are scoped to those earlier operations. Issue #271 and this handoff are not that grant.

A mode 600 rollback preimage was written beside the durable worker pin. It records the original image, container id, mounts, and effective host config. It was not executed. `node:18-alpine` still points at the historical image. The running API container is unchanged, so it remains the rollback preimage.

If a later explicit grant arrives on the trusted main channel, the bounded change is one recreate of `dev-proxy-config-api` onto the platform pin, then `nginx -t` and one reload of the existing proxy only if the upstream address changes. Expected interruption is that API and its in-process notification listener. Proxy image, ngrok, worker, host notification agent, and every other project stay up. That sequence was not run.

No UI change and no new screenshot. No owner UAT.

## Other lanes

Trajectory #90/7151052490 returned, and a newer Engineer is still STARTED at #90/7151999554. That tree was not edited. V202 Signal was not activated. Logan #233/7151039467 returned; #7151944381 is Plan181 READY / NOT STARTED. Logan was not edited. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2`. `governance/consumers.json` still omits Dev Proxy. Registration request remains #29/7147271428. Issue #155 is still an unpublished floor proposal. No new poller. Specialists: `NOT_SPAWNED`.

STOPPED for an explicit owner image-cutover decision. No further source-only cycle.
