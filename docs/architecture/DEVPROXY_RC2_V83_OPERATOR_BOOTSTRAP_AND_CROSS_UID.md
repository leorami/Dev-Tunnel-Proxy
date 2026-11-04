# Dev Proxy RC2 v83: Correct Docker Desktop parent-bind IPC and host-worker credential provisioning

## Ground truth that changed this design mid-implementation

Primary Engineer-I PR #79 advanced from `7ca399a782488d0c2a25274df4aaf7759d24db74` to **`33b03657274a8c25c18a9d4eb57a1083880c73e4`**, genuine `RETURNED` receipt `6640238467`. It proved a real two-process signed request/host PREPARED/API ACK/durable FINAL in disposable Mac+Docker Desktop, AND found a **new material mount rule**: the root of a Docker Desktop bind-mounted IPC directory appears as UID 0 inside the API. Because the signed-spool reader demands `0700` ownership by the calling API UID 504, the bind ROOT cannot itself be `DEVPROXY_ACTIVATION_SPOOL_DIR`. The **API user must create its own `0700` `spool/` child within a separately mounted IPC parent**. The host Mac UID and container API UID need not be equal; assuming they must match, as CTO initially did, would have introduced another release failure. The CTO changed the source/tests before committing v83.

## Implemented production-source correction

- `utils/rc2-production-compose-candidate.cjs`: replaces the unsafe direct `/app/.artifacts/rc2-spool` bind with **`/app/.artifacts/rc2-ipc` as an isolated writable IPC-parent bind**, with `DEVPROXY_ACTIVATION_SPOOL_DIR=/app/.artifacts/rc2-ipc/spool`. Existing `paths.spoolHostDir` is now the **host IPC parent**, never the queue itself. The immutable API source is still RO, four owner data mounts remain RW, signed secret remains a separate RO bind, nonroot UID/GID and two services are preserved. Starts `scripts/rc2-create-api-spool.cjs` as the same nonroot API user **before** notifications and API.
- `scripts/rc2-create-api-spool.cjs`: fail-closed, nonroot-only container initializer. It accepts a checked isolated IPC parent of sticky mode **01770** and API GID, allows the *parent* to appear UID0, creates/verifies a `spool/` CHILD and the five authenticated queue leaves in **0700, actually owned by the API UID**. No Docker calls, network, credentials, service starts, replay deletion, implicit chmod, automatic cleanup or owner-route mutation. On restart, validates and preserves existing requests, replies and replay.
- `utils/rc2-readonly-production-preflight.cjs`: exact Docker mount and RW/RO source identity expects the parent IPC bind, plus the distinct RO signing-secret bind. Rejects old root-spool mount, wrong source, mutable secret, extra exposed binds or source overlap. Remains read-only, evidence-only, no release GO.
- `scripts/rc2-provision-private-host-worker.cjs`: operator-only one-shot stage **before API launch**. Requires separate owner-private 0600 v81 candidate and v83 host bootstrap manifests, crosschecks proxy digest/source, nginx mounts, signed secret and parent paths. Allows **Mac host UID != API UID**, but requires reviewed shared GID for the isolated parent. Creates new stage-owned `host-share/` parent 01770 (under an owner-private 0700 stage), host-owned 0700 lease/replay, 0600 random 32-byte HMAC secret and host pin. It **does not** create the API-owned spool; reports `RC2_PRIVATE_HOST_STAGED_AWAITING_API_SPOOL`. Refuses duplicate stages/partial recovery, symlinks, unpinned Docker commands and secret/source exposure. All work limited to the operator's previously authorized private test stage.
- `utils/rc2-api-spool-identity-probe.cjs` and `scripts/rc2-verify-api-spool-access.cjs`: after the **disposable** API candidate has started, fixed read-only Docker inspect plus a nonroot `docker exec` **without UID override** confirms the exact parent and secret bind Sources/Destinations/RW, actual process UID/GID, child spool owner UID/mode 0700 and signing-file effective UID/mode 0600, read/write traversal and open-only secret access. It rechecks identity and private pin source; returns only evidence or blocked. No secret contents or private paths enter output. The earlier v82 host pin loader can be used **only after** the API creates the spool; this is intentional.

## Owner-private manifest and execution contract

Operator creates an existing canonical 0700 private stage **outside** source/data/ngrok and stores two owner 0600 JSON files:

1. `rc2-candidate-pins.json`: already existing v81 standalone Compose input, exact source/root/secret/image/mount fields; `paths.spoolHostDir` points to `<stage>/host-share`, **not** `<stage>/host-share/spool`. `apiUid` is the candidate's independently reviewed nonroot Linux user (e.g. **504**), and `apiGid` is a reviewed group (e.g. **20**).
2. `rc2-host-bootstrap-input.json`: exact `protocol:DEVPROXY_RC2_OPERATOR_BOOTSTRAP_V1`, reviewed Mac `dockerBinary` allowlist, the **disposable** proxy's full 64hex `proxyContainerId`, `proxyImage` image sha, exact nginx `expectedMounts`, `approvedRoot` equal to candidate `paths.sourceRoot`, `apiUid/apiGid` equal to candidate, and `operatorProvisionAuthorized:true`. Mac host GID must equal the candidate GID; **Mac host UID need not equal API UID**. The private manifest's true boolean does not independently authorize a live reload.

Only on an operator-approved **private disposable** candidate, after inspecting source and ensuring a new stage:

```text
node scripts/rc2-provision-private-host-worker.cjs /absolute/private/stage
node scripts/rc2-render-private-compose-candidate.cjs /absolute/private/stage
docker compose -f /absolute/private/stage/rc2-compose-candidate.json config --quiet
# After launching a separately named disposable two-service candidate, verifying full IDs:
node scripts/rc2-verify-api-spool-access.cjs /absolute/private/stage <actual-full-64hex-API-container-ID>
```

The parent `host-share` is `01770` for the reviewed group **inside an inaccessible 0700 private stage**, so unrelated Mac group members cannot traverse the stage path. Inside Docker Desktop, API process GID is allowed to create only its own 0700 child; no broad group/world write is permitted on the child or secret. **Must reverify** actual UID/GID and virtiofs behavior on the owner Mac; these code-level tests do not establish it. Read-only verification requires the actual API candidate process identity and cannot be replaced with root or `docker exec -u`.

The existing v82 host-worker `--serve` CLI must not be started until its pin loader accepts the API-created spool and the rest of the signed request/ACK/final, nginx image provenance, owner work-preservation, backup, feature and Origin checks are green. No launchd service is installed by source publication.

## Evidence and remaining gates

v83 source has genuine RED-first tests for missing IPC child/parent layout, unsafe parent permissions, uid0 and path-confusion, private manifest mismatches and API effective UID identity. The inherited v81 parent-layout and preflight tests were adapted to the **new security contract** rather than accepting the now incorrect old direct-bind contract. Node 22.16 fixture results are evidence of source behavior, **not** owner Mac cutover, full canonical Mac unit, or release authorization.

The new Engineer-I return already proved *disposable* two-process HMAC settlement; do not downgrade this to a fake callback. Remaining production gates: real live pinned host-worker placement, private spool/secret API-owned mapping, actual candidate image/module/include attestation, secure recovery+state and 17 routes, all five Origin runtime fields, and owner-used AI-healing functional parity. Owner's fresh GO still authorizes **only one** controlled proxy/config API cutover when all independent gates are green. Never touch ngrok, Mac bridge, credentials, other services or protected master; no auto retry/clear of crash fences or replay.
