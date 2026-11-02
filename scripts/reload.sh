#!/usr/bin/env bash
set -euo pipefail

# Safely rebuild and reload nginx. Never reload if bundle generation or nginx
# validation fails. Preserve the previous generated config for process restart.
# The live owner service must not run this without owner-approved change control.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/build/sites-enabled"
BUNDLE_FILE="$BUNDLE_DIR/apps.generated.conf"
BACKUP_FILE=""
HAD_BUNDLE=0

mkdir -p "$BUNDLE_DIR"
if [[ -f "$BUNDLE_FILE" ]]; then
  BACKUP_FILE="$(mktemp "$BUNDLE_DIR/.apps.generated.rollback.XXXXXXXX")"
  cp -p "$BUNDLE_FILE" "$BACKUP_FILE"
  HAD_BUNDLE=1
fi

finish() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    if (( HAD_BUNDLE == 1 )) && [[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]]; then
      mv -f "$BACKUP_FILE" "$BUNDLE_FILE" || echo "CRITICAL: unable to restore prior app routes" >&2
    else
      rm -f "$BUNDLE_FILE" || echo "CRITICAL: unable to discard invalid app routes" >&2
    fi
    echo "Route update refused; previous generated config restored when available." >&2
  fi
  if [[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]]; then
    rm -f "$BACKUP_FILE" || true
  fi
  exit "$status"
}
trap finish EXIT

# Previously this script ignored generator errors and invoked Docker anyway.
# Do not grant broad source-tree mounts to a fallback Docker container.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js unavailable; refusing to regenerate nginx app routes." >&2
  exit 1
fi
if ! node "$ROOT_DIR/utils/generateAppsBundle.js"; then
  echo "App route generation failed; nginx was NOT reloaded." >&2
  exit 1
fi

# nginx -t checks the candidate via the existing read-only container bind
# mount. A failed validation must NEVER trigger nginx -s reload.
if ! docker exec dev-proxy nginx -t; then
  echo "nginx -t rejected proposed routes; refusing reload." >&2
  exit 1
fi
if ! docker exec dev-proxy nginx -s reload; then
  echo "nginx reload failed; on-disk prior routes restored, active state requires verification." >&2
  exit 1
fi
echo "nginx reloaded (config test passed)"
