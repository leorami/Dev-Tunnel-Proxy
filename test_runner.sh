#!/usr/bin/env bash
# Dev Tunnel Proxy – Connectivity Test Runner (v2025-09-01)
# - Runs generic connectivity tests for localhost and ngrok
# - Integrates with smart-build to prepare/repair env with minimal disruption
# - Writes reports to .artifacts/reports and repo root

set -eo pipefail

ok()   { printf "✅ %s\n" "$*"; }
warn() { printf "⚠️  %s\n" "$*"; }
err()  { printf "❌ %s\n" "$*" >&2; }
info() { printf "ℹ️  %s\n" "$*"; }

trap 'echo "🧹 Exiting test runner…"' EXIT
trap 'err "Interrupted"; exit 1' INT TERM

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMART_BUILD_SCRIPT="$ROOT_DIR/scripts/smart-build.sh"

show_help() {
  cat << 'EOF'
Dev Tunnel Proxy – Connectivity Test Runner

Usage: ./test_runner.sh [OPTIONS] [TEST_TYPE]

OPTIONS:
  -v, --verbose    Verbose output
  --build          Force rebuild/restart before running tests
  -h, --help       Show help

TEST_TYPES:
  connectivity     Run localhost + ngrok checks (default)
  ngrok            Run ngrok-only checks (still uses generic runner)
  all              Alias for connectivity

EXAMPLES:
  ./test_runner.sh                  # Run connectivity tests
  ./test_runner.sh --build          # Recreate env, then test
  ./test_runner.sh ngrok            # Emphasize ngrok checks (same runner)
EOF
}

VERBOSE=""
FORCE_BUILD=0
TEST_TYPE="connectivity"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    -v|--verbose) VERBOSE=1; shift ;;
    --build) FORCE_BUILD=1; shift ;;
    connectivity|ngrok|all) TEST_TYPE="$1"; shift ;;
    *) err "Unknown argument: $1"; show_help; exit 1 ;;
  esac
done

ensure_env() {
  info "Preparing environment (minimal disruption)…"
  if [[ ! -x "$SMART_BUILD_SCRIPT" ]]; then
    warn "smart-build.sh not found; attempting direct docker-compose up"
    (cd "$ROOT_DIR" && docker compose up -d) || true
    return
  fi

  if [[ $FORCE_BUILD -eq 1 ]]; then
    info "Force rebuild requested; restarting containers…"
    "$SMART_BUILD_SCRIPT" restart || warn "Restart failed, continuing"
    return
  fi

  # If proxy not running, bring up; if unhealthy, attempt hot reload
  local state
  state=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep -E '^dev-proxy\t' || true)
  if [[ -z "$state" ]]; then
    info "Proxy not running; bringing up stack…"
    "$SMART_BUILD_SCRIPT" up || warn "Bring-up failed"
  else
    if echo "$state" | grep -qi 'unhealthy'; then
      info "Proxy unhealthy; hot reloading…"
      "$SMART_BUILD_SCRIPT" reload || warn "Reload failed"
    else
      ok "Proxy running"
    fi
  fi
}

run_tests() {
  info "Running ${TEST_TYPE} tests…"
  if [[ ! -f "$ROOT_DIR/test/run.js" ]]; then
    err "Missing $ROOT_DIR/test/run.js"
    exit 1
  fi
  node "$ROOT_DIR/test/run.js" || true
  ok "Connectivity checks completed"
  echo
  echo "📄 Reports:" 
  echo " - $ROOT_DIR/dev-proxy-report.md"
  echo " - $ROOT_DIR/dev-proxy-report.json"
}

ensure_env
run_tests
ok "Done"




