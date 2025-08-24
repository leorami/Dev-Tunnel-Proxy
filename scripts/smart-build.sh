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
smart-build.sh — convenience wrapper

Commands:
  up                 Start proxy + ngrok (detached)
  down               Stop and remove containers
  restart            Restart both services
  logs [service]     Tail logs (default: all). service=proxy|ngrok
  reload             Hot reload Nginx config
  install-app NAME PATH/TO/snippet.conf  Install a per-app snippet
  uninstall-app NAME                      Remove apps/NAME.conf and reload
  list-apps                                 List installed app snippets
  status                                    Show container status

Env:
  NGROK_AUTHTOKEN   ngrok token (or set in .env)
  NGROK_DOMAIN      reserved domain (optional)
USAGE
}

cmd="${1:-}"
case "$cmd" in
  up)
    ensure_network
    (cd "$ROOT_DIR" && $COMPOSE up -d)
    ;;
  down)
    (cd "$ROOT_DIR" && $COMPOSE down)
    ;;
  restart)
    (cd "$ROOT_DIR" && $COMPOSE down)
    ensure_network
    (cd "$ROOT_DIR" && $COMPOSE up -d)
    ;;
  logs)
    svc="${2:-}"
    if [ -n "$svc" ]; then
      (cd "$ROOT_DIR" && $COMPOSE logs -f "$svc")
    else
      (cd "$ROOT_DIR" && $COMPOSE logs -f)
    fi
    ;;
  reload)
    "$ROOT_DIR/scripts/reload.sh"
    ;;
  install-app)
    name="${2:-}"; src="${3:-}"
    if [ -z "${name}" ] || [ -z "${src}" ]; then usage; exit 1; fi
    "$ROOT_DIR/scripts/install-app.sh" "$name" "$src"
    ;;
  uninstall-app)
    name="${2:-}"
    if [ -z "${name}" ]; then usage; exit 1; fi
    dest="$ROOT_DIR/apps/${name}.conf"
    if [ -f "$dest" ]; then
      rm -f "$dest"
      echo "Removed $dest"
      "$ROOT_DIR/scripts/reload.sh"
    else
      echo "No such snippet: $dest"
    fi
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
    echo "Unknown command: $cmd"
    usage
    exit 1
    ;;
esac
