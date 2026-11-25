# V205 engineer completion — Config API image replaced with Node 24

STARTED: https://github.com/leorami/Dev-Tunnel-Proxy/issues/271#issuecomment-7154282892
CTO pin: `origin/cto/devproxy-v205-authorized-node24-cutover-20261124@2338fd6b8b567e3ee9ba84133706761fcda00a14`
Disposition: `CUTOVER_VERIFIED`

One recreate of `dev-proxy-config-api`. No nginx reload. No rollback. Proxy, ngrok, host worker, host notification agent, and every other project container were not restarted.

## Baseline

Docker context `desktop-linux`. The API container still had no Compose project labels. The durable compose directory was not used to launch it. The V204 mode 600 rollback record matched the running image, container, user, command, entrypoint, and explicit environment. The worker pin matched the proxy container id, image, and all eight mounts, and did not name the API container.

| Surface | Before |
| --- | --- |
| `dev-proxy-config-api` | Node v18.20.8 on `sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e`. User `504:20`, read-only root, `cap_drop ALL`, `no-new-privileges`, private IPC, restart `unless-stopped`, loopback 3001 and 3002. |
| Loaded closure | 43 files. `utils/proxyConfigAPI.js` sha256 `81782180cf7821e25f14378837c0a3f88c1234cf2a722ad194e341749c5fbdf3`. Same bytes as the V204 receipt. |
| `dev-proxy` | Unchanged image `sha256:9b2ae98f11d8fee29d1f62e7eb08b0a3f2a43cae081b081fb48740154636f0b1`. `nginx -t` succeeded. API upstreams are static names with no resolver. |
| Queue | One settled 2026-11-07 pair, status `CONFIG_SET_DIGEST_MISMATCH`. Prepared, acks, and replay empty. Not cleared. |
| Public | Health JSON 200 status ok. Root 200. Anonymous private API 302 to the login path. Foreign origin 403. `GET /admin/check` 401 `authenticated:false`. No signed-in session was used. |

## Candidate

Node.js index still lists 24.22.3 as the newest 24 release, dated 2026-11-10, security true. The registry index remains `sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5`. The `linux/arm64/v8` manifest remains `sha256:f44b069ce4b5d00cb4f7dff81821a4a6953e3790420040abf300139b1d317c6c`. Local rootfs diff ids matched that manifest. A digest pull materialized that manifest as an untagged image. `node:24-alpine` still points at the index. `node:18-alpine` still points at the historical image.

Reviewed image-default differences only: `NODE_VERSION` 18.20.8 to 24.22.3, and image npm 10.8.2 to 11.19.1. `PATH` and `YARN_VERSION` are unchanged. `docker-entrypoint.sh` is byte-identical. The API command does not invoke npm.

`assessApiImageOnlyTransition` on the effective documents, with only the API image set to the manifest pin, returned `RC2_API_IMAGE_ONLY_SOURCE_MATCH` (`imageOnly: true`). Provenance, runtime attestation, and production authorization stayed false. An extra environment value returned `RC2_API_IMAGE_ONLY_CONFIG_DRIFT`.

## Proof before mutation

- Explicit Node v24.22.3, `node --test tests/security/v204-rc2-api-image-only.test.cjs tests/security/rc2-production-compose-candidate.test.cjs`: 28 pass, 0 fail, 0 skip. Exit 0. No new Actions run is claimed. Frozen-pin CI #45535393560 remains the earlier source evidence.
- Same binary, `node --check` on the 43 loaded files: 0 failures.
- No `SlowBuffer`, `new Buffer(`, `process.binding`, or `require('sys')` in that closure.
- Spool helper on a synthetic non-owner tree: missing production env exited 2 `RC2_API_SPOOL_INVALID`; unsafe parent exited 2 `RC2_API_SPOOL_PARENT_UNSAFE`; valid parent printed `RC2_API_PRIVATE_SPOOL_READY / NOT_DEPLOYED` on both Node 24.22.3 and Node 18.20.8.
- Disposable startup, internal network, no published ports, read-only root, `cap_drop ALL`, user `504:20`, synthetic state: both images reached spool ready, notification health 200, and `GET /admin/check` 401. Containers and the network were removed. The owner API was still the original image afterward.
- Inverse on a disposable nginx with a forced address change: stale upstream timed out, `nginx -t` succeeded, one reload returned Node 24, the original container was restored, and one restoration reload returned Node 18. That nginx was not `dev-proxy`. Elapsed about 8 seconds for the same-address sequence and about 16 seconds for the forced-address sequence. Live recovery deadline was 45 seconds for local listeners and 20 seconds after at most one reload.

## Cutover

Stopped `dev-proxy-config-api`, renamed it to `dev-proxy-config-api-node18-preimage`, and created one replacement with the same user, command, entrypoint, mounts, explicit environment, ports, IPC, restart policy, read-only root, capabilities, and network aliases. Image `docker.io/library/node@sha256:f44b069ce4b5d00cb4f7dff81821a4a6953e3790420040abf300139b1d317c6c`. Image-default `NODE_VERSION`, `PATH`, and `YARN_VERSION` were left to the new image.

Local listeners were 401 and 200. Process identity was `v24.22.3 arm64` uid 504. The replacement kept the previous network address, so the static upstream was not stale. `nginx -s reload` was not run. Public health and root stayed 200. Proxy container id and start time were unchanged. Nginx master pid was unchanged.

Counts: recreate 1, reload 0, rollback 0.

## Postcheck

Loaded closure bytes matched the preimage, including `proxyConfigAPI.js`. Mounts, explicit environment, command, ports, and security boundary matched. Both listeners answered. Health 200 status ok. Root 200. Anonymous private API 302. Foreign origin 403. `GET /admin/check` 401. Startup log again recorded the read-only `.env` chmod failure that was already present on Node 18, then loaded the existing session store and listened. HMAC epoch bytes, worker pin, worker pid, queue names, proxy, ngrok, and the host notification agent were unchanged. Dirty owner checkout hashes were unchanged. The historical `node:18-alpine` tag and the stopped preimage container remain for rollback. Node 24 prints `DEP0169` for `url.parse()`; the checked routes still behaved as before.

Signed-in owner journeys were not performed. No owner UAT and no visual acceptance. Repository branch source was not made the running product tree.

## Origin evidence

- `SOURCE_CURRENT`: not claimed for this git branch. Loaded product bytes are the preimage bytes. Only the runtime image changed.
- `SINGLE_RUNTIME`: one running Config API. The Node 18 container is stopped. Disposable rehearsals were removed.
- `NO_SHADOW_APPS`: no second API, proxy, ngrok, or worker was left running.
- `REAL_APP_VERIFIED`: public health, root, anonymous denial, and foreign-origin denial match the preimage. Signed-in journeys were not run.
- `OWNER_WORK_PRESERVED`: dirty checkout, queue, epoch, sessions, mounts, and worker pin survived.

## Other lanes

Trajectory #90 latest note #7152978945 remains a STOPPED primary and an owner deferral of private Dev Proxy Room integration. Not edited. V202 Signal was not activated. Logan #233 latest note #7153577327 is Plan182 READY / NOT STARTED. Not edited. Origin `leorami/project-template@c7fd045116783cd26d70c55583f0349b9896d0c2`. `governance/consumers.json` still omits Dev Proxy. Registration request remains #29. Issue #155 has no comments. Delegation: `NOT_SPAWNED_NOT_BENEFICIAL`. No protected merge and no screenshot.

STOPPED for independent CTO review. The owner grant was used once.
