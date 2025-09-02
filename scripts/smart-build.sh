#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dev-tunnel-proxy}"

ensure_network() {
  if ! docker network ls --format '{{.Name}}' | grep -qx 'devproxy'; then
    docker network create devproxy >/dev/null
    echo "Created docker network: devproxy"
  fi
}

usage() {
  cat <<'USAGE'
smart-build.sh

Commands:
  up                 Start proxy + ngrok (detached)
  down               Stop and remove containers
  restart            Down then up (recreates containers)
  logs [service]     Tail logs (default: all). service=proxy|ngrok
  reload             Hot reload Nginx config
  install-app NAME PATH/TO/snippet.conf
  uninstall-app NAME
  list-apps
  status
USAGE
}

cmd="${1:-}"
case "$cmd" in
  up)
    ensure_network
    # Harden upstreams before starting so reloads won't fail if some services are down
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    (cd "$ROOT_DIR" && $COMPOSE up -d)
    ;;
  down)
    (cd "$ROOT_DIR" && $COMPOSE down)
    ;;
  restart)
    (cd "$ROOT_DIR" && $COMPOSE down --remove-orphans)
    ensure_network
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    (cd "$ROOT_DIR" && $COMPOSE up -d)
    ;;
  logs)
    svc="${2:-}"
    if [ -n "$svc" ]; then (cd "$ROOT_DIR" && $COMPOSE logs -f "$svc"); else (cd "$ROOT_DIR" && $COMPOSE logs -f); fi
    ;;
  reload)
    "$ROOT_DIR/scripts/reload.sh"
    ;;
  install-app)
    name="${2:-}"; src="${3:-}"; [ -n "$name" ] && [ -n "$src" ] || { usage; exit 1; }
    "$ROOT_DIR/scripts/install-app.sh" "$name" "$src"
    # Re-harden after installing new snippet
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    ;;
  uninstall-app)
    name="${2:-}"; [ -n "$name" ] || { usage; exit 1; }
    dest="$ROOT_DIR/apps/${name}.conf"
    if [ -f "$dest" ]; then rm -f "$dest"; echo "Removed $dest"; "$ROOT_DIR/scripts/reload.sh"; else echo "No such snippet: $dest"; fi
    ;;
  list-apps)
    ls -1 "$ROOT_DIR/apps"/*.conf 2>/dev/null || echo "(none)"
    ;;
  status)
    (cd "$ROOT_DIR" && $COMPOSE ps)
    ;;
  ""|"help"|"-h"|"--help")
    usage
    ;;
  *)
    echo "Unknown command: $cmd"; usage; exit 1
    ;;
esac
