#!/usr/bin/env bash
set -euo pipefail

# Dev Tunnel Proxy: install the macOS notifications system as LaunchAgents.
#
# What you get:
# - Notifications Engine: A background loop that evaluates per-route notification rules
# - Notifications Bridge: HTTP server for UI integration and sending messages
# - Texts are sent via Messages.app (iMessage/SMS relay)
#
# Usage
#   ./macos/install-notifications-engine.sh install
#   ./macos/install-notifications-engine.sh uninstall

CMD="${1:-install}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAPPER_SCRIPT="$ROOT_DIR/macos/dev-tunnel-proxy-notifications"
BRIDGE_SCRIPT="$ROOT_DIR/macos/notifications-bridge.js"

# Engine LaunchAgent
ENGINE_LABEL="com.leorami.devtunnelproxy.notifications"
ENGINE_PLIST="$HOME/Library/LaunchAgents/${ENGINE_LABEL}.plist"

# Bridge LaunchAgent
BRIDGE_LABEL="com.leorami.devtunnelproxy.notifications.bridge"
BRIDGE_PLIST="$HOME/Library/LaunchAgents/${BRIDGE_LABEL}.plist"

if [[ ! -x "$WRAPPER_SCRIPT" ]]; then
  echo "❌ Wrapper script not found or not executable: $WRAPPER_SCRIPT" >&2
  exit 1
fi

if [[ ! -f "$BRIDGE_SCRIPT" ]]; then
  echo "❌ Bridge script not found: $BRIDGE_SCRIPT" >&2
  exit 1
fi

# Find node executable
NODE_PATH=$(command -v node || true)
if [[ -z "$NODE_PATH" ]]; then
  # Check common locations
  for p in /usr/local/bin/node /opt/homebrew/bin/node ~/.nvm/versions/node/*/bin/node; do
    if [[ -x "$p" ]]; then
      NODE_PATH="$p"
      break
    fi
  done
fi

if [[ -z "$NODE_PATH" ]]; then
  echo "❌ node not found in PATH" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$ROOT_DIR/.artifacts"

write_engine_plist() {
  cat > "$ENGINE_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${WRAPPER_SCRIPT}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>NOTIF_POLL_INTERVAL_SEC</key>
      <string>10</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${ROOT_DIR}/.artifacts/notifications-engine.log</string>
    <key>StandardErrorPath</key>
    <string>${ROOT_DIR}/.artifacts/notifications-engine.err</string>
  </dict>
</plist>
EOF
}

write_bridge_plist() {
  cat > "$BRIDGE_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${BRIDGE_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
      <string>${NODE_PATH}</string>
      <string>${BRIDGE_SCRIPT}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${ROOT_DIR}/.artifacts/notifications-bridge.log</string>
    <key>StandardErrorPath</key>
    <string>${ROOT_DIR}/.artifacts/notifications-bridge.err</string>
  </dict>
</plist>
EOF
}

unload_if_loaded() {
  launchctl unload "$ENGINE_PLIST" 2>/dev/null || true
  launchctl unload "$BRIDGE_PLIST" 2>/dev/null || true
}

case "$CMD" in
  install)
    echo "📦 Installing notifications system..."
    
    # Install bridge first (engine depends on it)
    write_bridge_plist
    launchctl load "$BRIDGE_PLIST" 2>/dev/null || true
    echo "✅ Bridge installed: $BRIDGE_LABEL"
    echo "   Logs: $ROOT_DIR/.artifacts/notifications-bridge.log"
    
    # Wait a moment for bridge to start
    sleep 1
    
    # Install engine
    write_engine_plist
    unload_if_loaded
    launchctl load "$ENGINE_PLIST"
    echo "✅ Engine installed: $ENGINE_LABEL"
    echo "   Logs: $ROOT_DIR/.artifacts/notifications-engine.log"
    echo "   Errs: $ROOT_DIR/.artifacts/notifications-engine.err"
    echo ""
    echo "ℹ️  When macOS prompts for automation permission, look for:"
    echo "   'dev-tunnel-proxy-notifications' in System Settings → Privacy & Security → Automation"
    ;;
  uninstall)
    echo "🗑️  Uninstalling notifications system..."
    unload_if_loaded
    rm -f "$ENGINE_PLIST"
    rm -f "$BRIDGE_PLIST"
    echo "✅ Uninstalled: $ENGINE_LABEL"
    echo "✅ Uninstalled: $BRIDGE_LABEL"
    ;;
  *)
    echo "Usage: $0 install|uninstall" >&2
    exit 2
    ;;
esac
