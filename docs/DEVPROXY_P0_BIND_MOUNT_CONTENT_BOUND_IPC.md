# Dev Proxy P0: source-only configuration-set HMAC over an existing host data bind

## Status and source truth

**CTO code-first proposal, NOT deployed and NOT a permission grant.** Independent of the current Engineer-I's completed PR #61. Build only as source on an isolated branch rooted at returned Engineer SHA `1f2dbb78e8c045c008ace441e414aed495cbcdc1`. No run/launch or owner-Mac write is authorized by this document.

Engineer PR #61 proved a precise blocked condition: a Mac host Unix socket is not available inside the Docker Desktop Linux VM as a simple bind mount. Engineer PR #59's successful disposable broker instead mounted the host Docker engine socket in a *sidecar*. That solves functional reload but creates a dangerous privileged container. The source-only alternative here exchanges bounded **signed files over an already-approved owner-private host-data bind**, rather than requiring Mac Unix-socket forwarding or a Docker-engine socket inside any container. The host has a separately authorized executable that reads the same bind-mounted files and invokes the already fixed-action, full-image-ID attested Docker CLI adapter. No new network listener, port, sidecar or second application is inherent to the file format.

**Crucial distinction:** A host worker process, even if not a second application, is a privileged new execution capability. This source does not start it, configure startup, or grant permission for host commands. The existing Mac owner mount is currently not certified usable for the queue: Docker Desktop UID mapping, `fsync`/`close` EIO, and durability need actual owner-authorized, test-owned validation. A successful synthetic filesystem test or SHA-pinned PR is not a green Mac/production verdict.

## CTO-authored source

- `utils/rc1-route-candidate-manifest.cjs`: fixed v2 SHA-256 content-set digest for **three** approved relative files: `build/sites-enabled/apps.generated.conf`, `config/default.production.conf`, `config/nginx.production.conf`. The API and trusted host independently hash this entire set before an activation claim. No caller-supplied files; symlinks/hardlinks, missing/large/changed files rejected. No data/text is logged.
- `utils/rc1-content-bound-activation-request.cjs`: fixed-action request and response HMAC-SHA256 with distinct domain separators; requires v2 whole-set digest, unguessable request ID and short timestamp window. A successful MAC is **not** owner GO, host identity, Docker authorization, or deployment authority.
- `utils/rc1-activation-spool.cjs`: test-owned, owner-private 0700 directory with `requests`, `responses`, `replay`; atomic O_EXCL temp file + hardlink no-overwrite publication, fsync; 0600 files; durable replay reservation; origin-side `submit` and `readResult`; host-side `processOne`, independently hashing the security config before and after the *separately injected* fixed action. It never creates a network or Unix socket or starts a process. Any transport mismatch or unsupported fsync must fail closed.
- `utils/rc1-fixed-activation-host-worker.cjs`: host-only explicit `processOne` composer. Calls `attest -> nginx-test -> attest -> nginx-reload -> attest -> verifyActiveRoute` with one AbortSignal deadline; the untrusted request never chooses Docker argv/container/path. Operator must supply the previously reviewed fixed-ID, exact-image `createHostDockerAdapter` and an independent active-route verifier from the trusted host context, not from the API request.
- `tests/security/rc1-*.test.cjs`: 43 RED-first deterministic tests; native Node 22 GREEN. They **simulate** host Docker callbacks; they do not touch Mac Docker or production files.

## Independently discovered constraints

The v5 `utils/owner-authenticated-reload.cjs` signs only the generated bundle and cannot justify security-sensitive `config/default.production.conf` editing. PR #61 intentionally sets `allowConfigEdit:false`. **Keep it false** until a reviewed v2 all-config content binding is integrated and owner-authorized. A safe v2 MAC by itself is insufficient: the host must compare exact image/container identities, validate nginx, reload only the expected fixed container, prove the actual active route, preserve all 17 owner routes, and reject any socket-bearing sidecar.

This proposal currently does **not** wire the real web API to the file spool, install a host worker, provide the CLI wrapper, implement bounded application polling, prove UID/ACL isolation, or prove Docker Desktop bind atomicity and fsync. A host worker with full Docker CLI access is privileged despite fixed argv; its installation and startup are a distinct owner decision. Public/ngrok/mounted owner paths and real secret bytes remain excluded from Git.

## Non-negotiable Origin and owner authority

ONE canonical owner app/source/URL; no second app runtime for testing or owner UAT. All five Origin fields (`SOURCE_CURRENT`, `SINGLE_RUNTIME`, `NO_SHADOW_APPS`, `REAL_APP_VERIFIED`, `OWNER_WORK_PRESERVED`) must have independently observed evidence and unknown is not PASS. No protected merge, host Docker socket in API/sidecar, production reload, new background service, external listener, credential migration, changed live mount, ngrok bridge, private route export, or reuse of previously consumed GO.

This work is backend-only; there is no UI change or CTO visual approval. If a later assignment changes owner UI, Engineer first captures actual source/served-SHA bound pixels on the canonical app and CTO opens/reviews those bytes before inviting owner UAT.
