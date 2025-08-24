#!/usr/bin/env bash
set -euo pipefail

# Helper to install an MXTK snippet into the dev-tunnel-proxy
# Usage:
#   setup-mxtk-site.sh [--container mxtk-site-dev] [--port 2000] [--prefix /mxtk]
#
# This generates a per-app Nginx snippet and installs it via scripts/install-app.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="mxtk"
CONTAINER="mxtk-site-dev"
PORT="2000"
PREFIX="/mxtk"

while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  endesac
done

# normalize prefix to start with '/' and end with '/'
case "$PREFIX" in
  "") PREFIX="/mxtk" ;; # default
esac
case "$PREFIX" in
  /*) ;;
  *) PREFIX="/$PREFIX" ;;
esac
case "$PREFIX" in
  */) ;;
  *) PREFIX="${PREFIX}/" ;;
esac

TMP="$(mktemp)"
cat > "$TMP" <<EOF
# ========= MXTK (isolated) =========
# IMPORTANT: keep prefix (no trailing slash on proxy_pass) so Next with basePath sees '\${PREFIX}...'
location ${PREFIX} {
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Forwarded-Proto \$scheme;

  # WebSocket/HMR
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection "upgrade";

  proxy_pass http://${CONTAINER}:${PORT};
  proxy_read_timeout 300;
  proxy_send_timeout 300;
}
EOF

echo "Generated snippet:"
echo "-----------------"
cat "$TMP"
echo "-----------------"

"$ROOT_DIR/scripts/install-app.sh" "${APP_NAME}" "$TMP"
rm -f "$TMP"

cat <<'NEXT_HINT'

Reminder for your MXTK Next.js app:
  - Set MXTK_BEHIND_PROXY=1 when tunneling through this proxy (to enable basePath '/mxtk').
  - Keep it unset locally to run at root '/'.
  - Healthcheck: local '/api/health', tunnel '${PREFIX}api/health'

NEXT_HINT
