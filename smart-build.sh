#!/usr/bin/env bash
set -euo pipefail

# smart-build.sh
# PURPOSE: Dev utility for build/status/test. Root-level, proxy-aware.
# Commands: setup, up, down, restart, logs, reload, status, apply
# Test helpers: test:thoughts, test:calliope, test:browser, test:all

# Project root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dev-tunnel-proxy}"

get_ngrok_url() {
  # Env overrides
  if [ -n "${NGROK_STATIC_DOMAIN:-}" ]; then echo "https://${NGROK_STATIC_DOMAIN}"; return; fi
  if [ -n "${NGROK_DOMAIN:-}" ]; then echo "https://${NGROK_DOMAIN}"; return; fi
  
  # Local API (if ngrok running on host)
  for _ in 1 2 3; do
    url=$(curl -s --max-time 2 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https:[^"]*"' | head -n1 | sed -E 's/.*"public_url":"([^"]*)".*/\1/')
    [ -n "$url" ] && { echo "$url"; return; }
    sleep 0.5
  done
  
  # Check dev-ngrok container logs
  if docker ps --filter "name=dev-ngrok" --filter "status=running" | grep -q "dev-ngrok"; then
    url=$(docker logs dev-ngrok --tail 300 2>/dev/null | sed -n "s/.*using static domain '\([^']*\)'.*/https:\/\/\1/p" | head -n1)
    [ -n "$url" ] && { echo "$url"; return; }
    url=$(docker exec dev-ngrok curl -s --max-time 2 http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https:[^"]*"' | head -n1 | sed -E 's/.*"public_url":"([^"]*)".*/\1/')
    [ -n "$url" ] && { echo "$url"; return; }
  fi
  
  echo ""
}

show_access_info() {
  echo ""
  echo "🌐 ACCESS INFORMATION======================================"
  echo "Local:   http://localhost:80"
  
  local ngrok
  ngrok=$(get_ngrok_url)
  
  if [ -n "$ngrok" ]; then
    echo "Proxy:   ${ngrok}"
    echo ""
    
    # Health checks
    local hc sc rc th
    hc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${ngrok}/health.json" 2>/dev/null || echo 000)
    sc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${ngrok}/status.json" 2>/dev/null || echo 000)
    rc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${ngrok}/routes.json" 2>/dev/null || echo 000)
    th=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:3001/api/ai/thoughts" 2>/dev/null || echo 000)
    
    if [ "$hc" = "200" ]; then echo "Health:  ✅ OK (200)"; else echo "Health:  ❌ FAIL (${hc})"; fi
    if [ "$sc" = "200" ]; then echo "Status:  ✅ OK (200)"; else echo "Status:  ❌ FAIL (${sc})"; fi
    if [ "$rc" = "200" ]; then echo "Routes:  ✅ OK (200)"; else echo "Routes:  ❌ FAIL (${rc})"; fi
    if [ "$th" = "200" ]; then echo "Thoughts: ✅ OK (200)"; else echo "Thoughts: ❌ FAIL (${th})"; fi
    
    # Show Calliope status
    if [ "$th" = "200" ]; then
      local count
      count=$(curl -s "http://localhost:3001/api/ai/thoughts" 2>/dev/null | grep -o '"events":\[' | wc -l || echo 0)
      if [ "$count" -gt 0 ]; then
        local event_count
        event_count=$(curl -s "http://localhost:3001/api/ai/thoughts" 2>/dev/null | grep -o '"id":' | wc -l || echo 0)
        echo "         (Calliope has ${event_count} thoughts in queue)"
      fi
    fi
  else
    echo "Proxy:   ❌ (Not configured or dev-ngrok not running)"
  fi
  echo "=========================================================="
  echo ""
}

ensure_network() {
  if ! docker network ls --format '{{.Name}}' | grep -qx 'devproxy'; then
    docker network create devproxy >/dev/null
    echo "✅ Created docker network: devproxy"
  fi
}

cmd_setup() {
  # If project appears already set up, exit early
  if [ -f "$ROOT_DIR/.env" ] || [ -d "$ROOT_DIR/node_modules" ] || [ -f "$ROOT_DIR/.certs/dev.crt" ]; then
    echo "⚠️  Setup markers found (.env or node_modules or .certs/dev.crt)."
    echo "Skipping setup. To start services, run: ./smart-build.sh up"
    return 0
  fi
  
  ensure_network
  echo "==> Installing workspace dependencies..."
  if command -v npm >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && npm install --workspaces)
  else
    echo "❌ npm not found. Please install Node.js/npm and re-run."
    exit 1
  fi
  
  # Create TLS certs if missing
  CERT_DIR="$ROOT_DIR/.certs"
  mkdir -p "$CERT_DIR"
  if [ ! -f "$CERT_DIR/dev.crt" ] || [ ! -f "$CERT_DIR/dev.key" ]; then
    if command -v openssl >/dev/null 2>&1; then
      echo "==> Generating self-signed TLS certs in .certs..."
      openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -subj "/CN=localhost" \
        -keyout "$CERT_DIR/dev.key" -out "$CERT_DIR/dev.crt" >/dev/null 2>&1 || true
    else
      echo "⚠️  openssl not found; skipping cert generation."
    fi
  fi
  
  # Pre-generate bundle
  if command -v node >/dev/null 2>&1; then
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    node "$ROOT_DIR/utils/generateAppsBundle.js" || true
  else
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/generateAppsBundle.js || true
  fi
  
  echo "✅ Setup complete. Run: ./smart-build.sh up"
}

cmd_up() {
  ensure_network
  echo "==> Regenerating app bundle..."
  if command -v node >/dev/null 2>&1; then
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    node "$ROOT_DIR/utils/generateAppsBundle.js" || true
  else
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/generateAppsBundle.js || true
  fi
  echo "==> Starting containers..."
  (cd "$ROOT_DIR" && $COMPOSE up -d)
  sleep 2
  show_access_info
}

cmd_down() {
  echo "==> Stopping containers..."
  (cd "$ROOT_DIR" && $COMPOSE down)
}

cmd_restart() {
  echo "==> Restarting containers..."
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
  sleep 2
  show_access_info
}

cmd_logs() {
  local svc="${1:-}"
  if [ -n "$svc" ]; then
    (cd "$ROOT_DIR" && $COMPOSE logs -f "$svc")
  else
    (cd "$ROOT_DIR" && $COMPOSE logs -f)
  fi
}

cmd_reload() {
  echo "==> Hot-reloading Nginx config..."
  "$ROOT_DIR/scripts/reload.sh"
}

cmd_status() {
  echo "==> Dev containers"
  (cd "$ROOT_DIR" && $COMPOSE ps) | cat
  echo ""
  echo "==> Networks"
  docker network ls | grep -E 'devproxy|NETWORK' || true
  show_access_info
}

cmd_apply() {
  echo "==> Re-applying dev containers..."
  ensure_network
  if command -v node >/dev/null 2>&1; then
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
    node "$ROOT_DIR/utils/generateAppsBundle.js" || true
  else
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/generateAppsBundle.js || true
  fi
  (cd "$ROOT_DIR" && $COMPOSE up -d --force-recreate)
  sleep 2
  show_access_info
}

cmd_install_app() {
  local name="${1:-}"
  local src="${2:-}"
  if [ -z "$name" ] || [ -z "$src" ]; then
    echo "Usage: ./smart-build.sh install-app NAME PATH/TO/snippet.conf"
    exit 1
  fi
  "$ROOT_DIR/scripts/install-app.sh" "$name" "$src"
  if command -v node >/dev/null 2>&1; then
    node "$ROOT_DIR/utils/hardenUpstreams.js" || true
  else
    docker run --rm -v "$ROOT_DIR":/app -w /app node:18-alpine node utils/hardenUpstreams.js || true
  fi
  cmd_reload
}

cmd_uninstall_app() {
  local name="${1:-}"
  if [ -z "$name" ]; then
    echo "Usage: ./smart-build.sh uninstall-app NAME"
    exit 1
  fi
  dest="$ROOT_DIR/apps/${name}.conf"
  if [ -f "$dest" ]; then
    rm -f "$dest"
    echo "✅ Removed $dest"
    cmd_reload
  else
    echo "❌ No such snippet: $dest"
  fi
}

cmd_list_apps() {
  echo "==> Installed apps:"
  ls -1 "$ROOT_DIR/apps"/*.conf 2>/dev/null | xargs -n1 basename | sed 's/.conf$//' || echo "(none)"
}

# -----------------
# Test runner helpers
# -----------------

cmd_test_thoughts() {
  echo "🧪 Testing real-time thoughts system..."
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run thought tests"
    return 0
  fi
  
  echo ""
  echo "1. Simple thoughts test..."
  node "$ROOT_DIR/test/calliope-simple-test.js" || echo "⚠️  Simple test failed"
  
  echo ""
  echo "2. Verifying thoughts are pushed..."
  bash "$ROOT_DIR/test/test-incremental-thoughts.sh" || echo "⚠️  Incremental test failed"
  
  echo ""
  echo "✅ Thoughts tests complete"
}

cmd_test_calliope() {
  echo "🧪 Testing Calliope AI functionality..."
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run Calliope tests"
    return 0
  fi
  
  echo ""
  echo "1. Core functionality..."
  node "$ROOT_DIR/test/calliope-simple-test.js" || { echo "❌ Calliope tests failed"; return 1; }
  
  echo ""
  echo "✅ Calliope tests complete"
}

cmd_test_browser() {
  echo "🧪 Testing browser/console errors..."
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run browser tests"
    return 0
  fi
  
  if [ -f "$ROOT_DIR/test/browser-console-test.js" ]; then
    echo ""
    node "$ROOT_DIR/test/browser-console-test.js" || echo "⚠️  Browser test failed"
  else
    echo "⚠️  Browser test not found (test/browser-console-test.js)"
  fi
  
  echo ""
  echo "✅ Browser tests complete"
}

cmd_test_mixed_content() {
  echo "🧪 Testing mixed content detection..."
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run mixed content test"
    return 0
  fi
  
  if [ -f "$ROOT_DIR/test/mixed-content-test.js" ]; then
    echo ""
    node "$ROOT_DIR/test/mixed-content-test.js" || echo "⚠️  Mixed content test failed"
  else
    echo "⚠️  Mixed content test not found"
  fi
  
  echo ""
  echo "✅ Mixed content tests complete"
}

cmd_test_all() {
  echo "🧪 Running all tests..."
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run all tests"
    return 0
  fi
  
  local failed=0
  
  cmd_test_thoughts || failed=1
  cmd_test_calliope || failed=1
  
  if [ $failed -eq 0 ]; then
    echo ""
    echo "✅ ALL TESTS PASSED"
    return 0
  else
    echo ""
    echo "❌ SOME TESTS FAILED"
    return 1
  fi
}

usage() {
  cat <<'USAGE'
smart-build.sh - Dev utility for dev-tunnel-proxy

Commands:
  setup           Install deps, prepare certs, pre-generate bundle
  up              Start proxy + ngrok (detached)
  down            Stop and remove containers
  restart         Down then up (recreates containers)
  logs [service]  Tail logs (default: all). service=proxy|ngrok|config-api
  reload          Hot reload Nginx config
  status          Show container status, access URLs, and health checks
  apply           Re-apply containers (force recreate)
  
  install-app NAME PATH/TO/snippet.conf    Install app config
  uninstall-app NAME                       Remove app config
  list-apps                                List installed apps
  
  # Tests
  test:thoughts        Test real-time thoughts system
  test:calliope        Test Calliope AI functionality
  test:browser         Test browser/console error detection
  test:mixed-content   Test mixed content detection
  test:all             Run all tests

Examples:
  ./smart-build.sh setup          # First-time setup
  ./smart-build.sh up             # Start everything
  ./smart-build.sh status         # Check status and health
  ./smart-build.sh test:all       # Run all tests
  ./smart-build.sh logs proxy     # Watch proxy logs
  ./smart-build.sh reload         # Reload nginx after config change
USAGE
}

main() {
  local cmd="${1:-status}"
  shift || true
  
  case "$cmd" in
    setup) cmd_setup;;
    up) cmd_up;;
    down) cmd_down;;
    restart) cmd_restart;;
    logs) cmd_logs "$@";;
    reload) cmd_reload;;
    status) cmd_status;;
    apply) cmd_apply;;
    install-app) cmd_install_app "$@";;
    uninstall-app) cmd_uninstall_app "$@";;
    list-apps) cmd_list_apps;;
    
    # Tests
    test:thoughts) cmd_test_thoughts;;
    test:calliope) cmd_test_calliope;;
    test:browser) cmd_test_browser;;
    test:mixed-content) cmd_test_mixed_content;;
    test:all) cmd_test_all;;
    
    ""|"help"|"-h"|"--help") usage;;
    *) echo "❌ Unknown command: $cmd"; usage; exit 1;;
  esac
}

main "$@"
