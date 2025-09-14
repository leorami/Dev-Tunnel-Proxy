# Config Composition & Precedence

This project composes local app snippets with proxy-owned overrides into a single generated file that Nginx loads. This ensures proxy fixes/improvements always take precedence over app-provided snippets, without hardcoding any app references in the repository.

## What changed

- Nginx no longer includes `apps/*.conf` directly.
- A generator composes `apps/*.conf` with optional `overrides/*.conf` into `build/sites-enabled/apps.generated.conf`.
- Nginx includes only files from `/etc/nginx/conf.d/sites-enabled/*.conf` (mounted from `build/sites-enabled`).
- Start/restart/reload scripts run the generator automatically.

## Precedence model

- **Overrides win (canonical)**: Any `location` defined in `overrides/*.conf` takes precedence over a matching block from `apps/*.conf`.
- **Match strategy**: Matching considers both the raw `location` expression and a normalized prefix so logically-equivalent patterns are deduplicated.
- **Co-existence**: Exact routes may co-exist with prefix routes (e.g., `location = /impact/` plus `location ^~ /impact/`). The composer keeps the exact route even when a normalized prefix exists.
- **App content preserved**: Non-conflicting app locations are included unmodified.

## File locations

- Local app snippets (gitignored): `apps/*.conf`
- Proxy-owned overrides (optional): `overrides/*.conf`
- Generated output: `build/sites-enabled/apps.generated.conf`
- Core server: `config/default.conf` (includes only `sites-enabled/*.conf`)

## Lifecycle

- `./scripts/smart-build.sh up|restart` runs the generator before starting containers.
- `./scripts/reload.sh` runs the generator before reloading nginx.
- Run manually if needed:
  ```bash
  node utils/generateAppsBundle.js
  ```

### Troubleshooting
- If ngrok shows `ERR_NGROK_8012`, ensure it points to `dev-proxy:80` (see `config/ngrok.dynamic.yml` and `scripts/ngrok-entrypoint.sh`).
- If `/impact/` returns 404 but `/impact/static/...` works, ensure the exact-match base route is present in the generated bundle (`location = /impact/ { proxy_pass http://UPSTREAM/; }`).

## Migration notes (existing users)

- If you previously relied on including `apps/*.conf` directly, no action needed; your `apps/` files remain the source of truth, but are now composed into a generated file.
- If conflicts existed, move the proxy-owned decisions into `overrides/` so they consistently win.
- If an app’s build writes to `apps/*.conf`, it will not overwrite overrides because nginx only loads the generated bundle.
- Conflict scanning and reports still read from `apps/`; serving uses the generated bundle.

## Writing overrides

- Place minimal, targeted `location` blocks in `overrides/*.conf`.
- Keep overrides generic and not tied to specific app names.
- Prefer policy-level fixes (headers, resolver, proxy semantics) over app-specific paths when possible.
- Example:
  ```nginx
  # overrides/force-websocket-headers.conf
  location ^~ /sdk/ {
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
  ```

## Why a generator instead of runtime includes?

- Deterministic precedence when multiple configs declare similar `location` paths.
- Easier auditing/debugging with a single output file and provenance header.

## Provenance

The generated file includes a header with:
- Generation timestamp
- List of override files
- List of app files included
- Normalization notes when a location was de-duplicated due to an override

## Operational notes

- `build/` is gitignored.
- Container mounts `build/sites-enabled` at `/etc/nginx/conf.d/sites-enabled` (read-only).
- Health/status endpoints unchanged.
- If something regresses, inspect `build/sites-enabled/apps.generated.conf` first. It is the single source nginx reads.

## Impact

- App configs in `apps/` continue to be edited locally per project.
- No app names are referenced in repository code.
- If a route breaks after changes, inspect `build/sites-enabled/apps.generated.conf` and the files listed in its header.

## Policy: Root is reserved for the proxy

- Application routes must live under an app prefix (e.g., `/mxtk/`, `/sdk/`, `/impact/`).
- Do not declare app dev-helper routes at the proxy root (`/`). Examples that must be prefixed:
  - `@vite`, `@id`, `@fs`, `node_modules`, `sb-manager`, `sb-addons`, `sb-common-assets`, `src`
  - Correct: `/sdk/@vite/...`, `/impact/static/...`
  - Incorrect: `/@vite/...`, `/node_modules/...`, `/sb-manager/...` at `/`
- The composer lints for root-level dev-helper routes and emits warnings.
