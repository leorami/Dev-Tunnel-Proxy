#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: $0 <app-name> <path-to-conf>"
  exit 1
fi

APP_NAME="$1"
CONF_SRC="$2"

if [ ! -f "$CONF_SRC" ]; then
  echo "Error: snippet not found at $CONF_SRC"
  exit 1
fi

DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps"
install -m 0644 "$CONF_SRC" "$DEST_DIR/${APP_NAME}.conf"
echo "Installed $CONF_SRC -> apps/${APP_NAME}.conf"

if docker ps --format '{{.Names}}' | grep -q '^dev-proxy$'; then
  docker exec -it dev-proxy nginx -t
  docker exec -it dev-proxy nginx -s reload
  echo "Reloaded dev-proxy."
else
  echo "dev-proxy is not running; start it with: docker compose up -d"
fi
