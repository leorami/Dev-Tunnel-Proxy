#!/usr/bin/env bash
set -euo pipefail

# Project root (this script now lives at the root)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
  setup              Install deps, prepare certs, pre-generate bundle
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
  setup)
    # If project appears already set up, exit early to avoid accidental overwrite
    if [ -f "$ROOT_DIR/.env" ] || [ -d "$ROOT_DIR/node_modules" ] || [ -f "$ROOT_DIR/.certs/dev.crt" ] || [ -f "$ROOT_DIR/.certs/dev.key" ]; then
      echo "Setup markers found (.env or node_modules or .certs/dev.crt|dev.key)." >&2
      echo "Skipping setup. To start services, run: ./scripts/smart-build.sh up" >&2
      exit 0
    fi
    ensure_network
    echo "Installing workspace dependencies..."
    if command -v npm >/dev/null 2>&1; then
      (cd "$ROOT_DIR" && npm install --workspaces)
    else
      echo "npm not found. Please install Node.js/npm and re-run." >&2; exit 1
    fi
    # Create TLS certs if missing
    CERT_DIR="$ROOT_DIR/.certs"
    mkdir -p "$CERT_DIR"
    if [ ! -f "$CERT_DIR/dev.crt" ] || [ ! -f "$CERT_DIR/dev.key" ]; then
      if command -v openssl >/dev/null 2>&1; then
        echo "Generating self-signed TLS certs in .certs (CN=localhost)..."
        openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
          -subj "/CN=localhost" \
          -keyout "$CERT_DIR/dev.key" -out "$CERT_DIR/dev.crt" >/dev/null 2>&1 || true
      else
        echo "openssl not found; skipping cert generation. Place dev.crt/dev.key in .certs/." >&2
      fi
    fi
    # Pre-harden and pre-generate bundle
    if command -v node >/dev/null 2>&1; then
      node "$ROOT_DIR/utils/hardenUpstreams.js" || true
      node "$ROOT_DIR/utils/generateAppsBundle.js" || true
    else
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/generateAppsBundle.js || true
    fi
    echo "Setup complete. You can now run: ./smart-build.sh up"
    ;;
  up)
    ensure_network
    if command -v node >/dev/null 2>&1; then
      node "$ROOT_DIR/utils/hardenUpstreams.js" || true
      node "$ROOT_DIR/utils/generateAppsBundle.js" || true
    else
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/generateAppsBundle.js || true
    fi
    (cd "$ROOT_DIR" && $COMPOSE up -d)
    ;;
  down)
    (cd "$ROOT_DIR" && $COMPOSE down)
    ;;
  restart)
    (cd "$ROOT_DIR" && $COMPOSE down --remove-orphans)
    ensure_network
    if command -v node >/dev/null 2>&1; then
      node "$ROOT_DIR/utils/hardenUpstreams.js" || true
      node "$ROOT_DIR/utils/generateAppsBundle.js" || true
    else
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/generateAppsBundle.js || true
    fi
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
    if command -v node >/dev/null 2>&1; then
      node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    else
      docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
    fi
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


