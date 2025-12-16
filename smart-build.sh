#!/usr/bin/env bash
set -euo pipefail

# smart-build.sh
# PURPOSE: Dev utility for build/status/test. Root-level, proxy-aware.
# Commands: setup, up, down, restart, logs, reload, status, apply
# Test helpers: test:unit, test:thoughts, test:calliope, test:auditor, test:browser, test:all

# Project root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dev-tunnel-proxy}"
PROXY_API_BASE_PATH="${PROXY_API_BASE_PATH:-/devproxy/api}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

check_and_reindex_calliope() {
  # Check if documentation has changed and reindex Calliope's knowledge base if needed
  local docs_hash_file="$ROOT_DIR/.artifacts/calliope/docs-hash.txt"
  local reindex_script="$ROOT_DIR/scripts/reindex-calliope.sh"
  
  # Skip if reindex script doesn't exist
  if [ ! -f "$reindex_script" ]; then
    return 0
  fi
  
  # Calculate current hash of all documentation
  local current_hash=""
  if command -v shasum >/dev/null 2>&1; then
    # Find all markdown files and hash them
    current_hash=$(find "$ROOT_DIR/docs" "$ROOT_DIR/examples" "$ROOT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | \
      sort | xargs shasum 2>/dev/null | shasum | cut -d' ' -f1)
  elif command -v sha1sum >/dev/null 2>&1; then
    current_hash=$(find "$ROOT_DIR/docs" "$ROOT_DIR/examples" "$ROOT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | \
      sort | xargs sha1sum 2>/dev/null | sha1sum | cut -d' ' -f1)
  else
    # No hash utility available, skip check
    return 0
  fi
  
  # If we couldn't compute hash, skip
  if [ -z "$current_hash" ]; then
    return 0
  fi
  
  # Check if hash file exists and compare
  local needs_reindex=0
  if [ ! -f "$docs_hash_file" ]; then
    needs_reindex=1
    echo "📚 First-time documentation indexing needed"
  else
    local stored_hash
    stored_hash=$(cat "$docs_hash_file" 2>/dev/null || echo "")
    if [ "$current_hash" != "$stored_hash" ]; then
      needs_reindex=1
      echo "📚 Documentation changes detected - Calliope needs reindexing"
    fi
  fi
  
  # Reindex if needed
  if [ $needs_reindex -eq 1 ]; then
    # Check if Calliope API is running
    local api_base="${PROXY_API_BASE_PATH:-/devproxy/api}"
    if curl -s "http://localhost:3001${api_base}/ai/health" > /dev/null 2>&1; then
      echo "🧠 Updating Calliope's knowledge base..."
      if "$reindex_script" 2>&1 | grep -v "^#" | tail -5; then
        # Save new hash
        mkdir -p "$(dirname "$docs_hash_file")"
        echo "$current_hash" > "$docs_hash_file"
        echo "✅ Calliope's knowledge base updated"
      else
        echo "⚠️  Reindex failed, but continuing..."
      fi
    else
      echo "ℹ️  Calliope API not running yet - will reindex when available"
    fi
  fi
}

show_access_info() {
  echo ""
  echo "🌐 ACCESS INFORMATION======================================"
  
  # Get API base path from env or use default
  local api_base="${PROXY_API_BASE_PATH:-/devproxy/api}"
  
  echo "Local:   http://localhost:80"
  echo "API:     http://localhost:80${api_base}"
  
  local ngrok
  ngrok=$(get_ngrok_url)
  
  if [ -n "$ngrok" ]; then
    echo "Proxy:   ${ngrok}"
    echo "API:     ${ngrok}${api_base}"
    echo ""
    
    # Health checks
    local hc sc rc th
    hc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${ngrok}/health.json" 2>/dev/null || echo 000)
    sc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${ngrok}/status.json" 2>/dev/null || echo 000)
    rc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${ngrok}/routes.json" 2>/dev/null || echo 000)
    th=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:3001${api_base}/ai/thoughts" 2>/dev/null || echo 000)
    
    if [ "$hc" = "200" ]; then echo "Health:  ✅ OK (200)"; else echo "Health:  ❌ FAIL (${hc})"; fi
    if [ "$sc" = "200" ]; then echo "Status:  ✅ OK (200)"; else echo "Status:  ❌ FAIL (${sc})"; fi
    if [ "$rc" = "200" ]; then echo "Routes:  ✅ OK (200)"; else echo "Routes:  ❌ FAIL (${rc})"; fi
    if [ "$th" = "200" ]; then echo "Thoughts: ✅ OK (200)"; else echo "Thoughts: ❌ FAIL (${th})"; fi
    
    # Show Calliope status
    if [ "$th" = "200" ]; then
      local event_count
      event_count=$(curl -s "http://localhost:3001${PROXY_API_BASE_PATH}/ai/thoughts" 2>/dev/null | jq -r '.events | length' 2>/dev/null || echo 0)
      if [ "$event_count" -gt 0 ] 2>/dev/null; then
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
  check_and_reindex_calliope
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
  check_and_reindex_calliope
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
  check_and_reindex_calliope
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
  check_and_reindex_calliope
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

cmd_reindex() {
  echo "🧠 Manually triggering Calliope knowledge base reindex..."
  local reindex_script="$ROOT_DIR/scripts/reindex-calliope.sh"
  local api_base="${PROXY_API_BASE_PATH:-/devproxy/api}"
  
  if [ ! -f "$reindex_script" ]; then
    echo "❌ Reindex script not found: $reindex_script"
    exit 1
  fi
  
  if ! curl -s "http://localhost:3001${api_base}/ai/health" > /dev/null 2>&1; then
    echo "❌ Calliope API is not running on port 3001"
    echo "   Start it with: ./smart-build.sh up"
    exit 1
  fi
  
  "$reindex_script"
  
  # Update hash to prevent auto-reindex
  local docs_hash_file="$ROOT_DIR/.artifacts/calliope/docs-hash.txt"
  if command -v shasum >/dev/null 2>&1; then
    local current_hash
    current_hash=$(find "$ROOT_DIR/docs" "$ROOT_DIR/examples" "$ROOT_DIR" -maxdepth 1 -name "*.md" -type f 2>/dev/null | \
      sort | xargs shasum 2>/dev/null | shasum | cut -d' ' -f1)
    if [ -n "$current_hash" ]; then
      mkdir -p "$(dirname "$docs_hash_file")"
      echo "$current_hash" > "$docs_hash_file"
    fi
  fi
}

# -----------------
# Test runner helpers
# -----------------

# Test runner with progress indicator
run_test_with_progress() {
  local test_name="$1"
  local test_cmd="$2"
  local start_time end_time duration
  
  echo -e "\n${BLUE}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}▶ ${test_name}${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
  
  start_time=$(date +%s)
  
  # Run test and capture exit code
  if eval "$test_cmd"; then
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    echo -e "\n${GREEN}✓ ${test_name} passed (${duration}s)${NC}"
    return 0
  else
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    echo -e "\n${RED}✗ ${test_name} FAILED (${duration}s)${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
    return 1
  fi
}

cmd_test_thoughts() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run thought tests"
    return 0
  fi
  
  local test_result=0
  run_test_with_progress "Real-time Thoughts System" \
    "node '$ROOT_DIR/test/calliope-simple-test.js' && bash '$ROOT_DIR/test/test-incremental-thoughts.sh'" || test_result=1
  
  return $test_result
}

cmd_test_calliope() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run Calliope tests"
    return 0
  fi
  
  local test_result=0
  run_test_with_progress "Calliope Core Functionality" \
    "node '$ROOT_DIR/test/calliope-simple-test.js'" || test_result=1
  
  if [ $test_result -eq 0 ]; then
    run_test_with_progress "Calliope Site Auditor" \
      "node '$ROOT_DIR/test/site-auditor-test.js'" || test_result=1
  fi
  
  return $test_result
}

cmd_test_auditor() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run auditor tests"
    return 0
  fi
  
  run_test_with_progress "Site Auditor" \
    "node '$ROOT_DIR/test/site-auditor-test.js'"
}

cmd_test_browser() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run browser tests"
    return 0
  fi
  
  if [ -f "$ROOT_DIR/test/browser-console-test.js" ]; then
    run_test_with_progress "Browser/Console Errors" \
      "node '$ROOT_DIR/test/browser-console-test.js'"
  else
    warn "Browser test not found (test/browser-console-test.js)"
    return 1
  fi
}

cmd_test_mixed_content() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run mixed content test"
    return 0
  fi
  
  if [ -f "$ROOT_DIR/test/mixed-content-test.js" ]; then
    run_test_with_progress "Mixed Content Detection" \
      "node '$ROOT_DIR/test/mixed-content-test.js'"
  else
    warn "Mixed content test not found"
    return 1
  fi
}

cmd_test_unit() {
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run unit tests"
    return 0
  fi
  
  local test_result=0
  run_test_with_progress "Unit Tests (collect-docs)" \
    "node '$ROOT_DIR/test/collect-docs.test.js'" || test_result=1
  
  if [ $test_result -eq 0 ]; then
    run_test_with_progress "Unit Tests (embeddings)" \
      "node '$ROOT_DIR/test/calliope-embeddings-integration.test.js'" || test_result=1
  fi
  
  return $test_result
}

cmd_test_all() {
  local start_time end_time total_duration
  local failed=0
  
  echo -e "\n${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║                  RUNNING FULL TEST SUITE                       ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}\n"
  
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN: would run all tests"
    return 0
  fi
  
  start_time=$(date +%s)
  
  # Run unit tests first (fast)
  cmd_test_unit || failed=1
  
  # Run Calliope tests
  if [ $failed -eq 0 ]; then
    cmd_test_thoughts || failed=1
  fi
  
  if [ $failed -eq 0 ]; then
    cmd_test_calliope || failed=1
  fi
  
  end_time=$(date +%s)
  total_duration=$((end_time - start_time))
  
  if [ $failed -eq 0 ]; then
    echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              ✓ ALL TESTS PASSED (${total_duration}s)                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}\n"
    return 0
  else
    echo -e "\n${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              ✗ TESTS FAILED (${total_duration}s)                       ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}\n"
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
  
  reindex         Manually reindex Calliope's knowledge base
                  (Auto-reindexing happens on up/restart/reload/apply
                   when documentation changes are detected)
  
  # Tests
  test:unit            Run unit tests (collect-docs, embeddings)
  test:thoughts        Test real-time thoughts system
  test:calliope        Test Calliope AI functionality
  test:auditor         Test site auditor (Puppeteer-based)
  test:browser         Test browser/console error detection
  test:mixed-content   Test mixed content detection
  test:all             Run all tests (unit + integration)

Examples:
  ./smart-build.sh setup          # First-time setup
  ./smart-build.sh up             # Start everything (auto-reindexes if docs changed)
  ./smart-build.sh status         # Check status and health
  ./smart-build.sh reindex        # Force reindex Calliope's knowledge
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
    reindex) cmd_reindex;;
    
    # Tests
    test:unit) cmd_test_unit;;
    test:thoughts) cmd_test_thoughts;;
    test:calliope) cmd_test_calliope;;
    test:auditor) cmd_test_auditor;;
    test:browser) cmd_test_browser;;
    test:mixed-content) cmd_test_mixed_content;;
    test:all) cmd_test_all;;
    
    ""|"help"|"-h"|"--help") usage;;
    *) echo "❌ Unknown command: $cmd"; usage; exit 1;;
  esac
}

main "$@"
