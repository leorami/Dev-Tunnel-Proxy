#!/usr/bin/env bash
set -euo pipefail

# Dev Tunnel Proxy: install the macOS notifications engine as a LaunchAgent.
#
# What you get:
# - A background loop that evaluates per-route notification rules
# - Texts are sent via Messages.app (iMessage/SMS relay)
#
# Usage
#   ./macos/install-notifications-engine.sh install
#   ./macos/install-notifications-engine.sh uninstall

CMD="${1:-install}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAPPER_SCRIPT="$ROOT_DIR/macos/dev-tunnel-proxy-notifications"

LABEL="com.leorami.devtunnelproxy.notifications"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ ! -x "$WRAPPER_SCRIPT" ]]; then
  echo "❌ Wrapper script not found or not executable: $WRAPPER_SCRIPT" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

write_plist() {
  cat > "$PLIST_PATH" <<EOF
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

unload_if_loaded() {
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
}

case "$CMD" in
  install)
    write_plist
    unload_if_loaded
    launchctl load "$PLIST_PATH"
    echo "✅ Installed. LaunchAgent loaded: $LABEL"
    echo "   Logs: $ROOT_DIR/.artifacts/notifications-engine.log"
    echo "   Errs: $ROOT_DIR/.artifacts/notifications-engine.err"
    echo ""
    echo "ℹ️  When macOS prompts for automation permission, look for:"
    echo "   'dev-tunnel-proxy-notifications' in System Settings → Privacy & Security → Automation"
    ;;
  uninstall)
    unload_if_loaded
    rm -f "$PLIST_PATH"
    echo "✅ Uninstalled: $LABEL"
    ;;
  *)
    echo "Usage: $0 install|uninstall" >&2
    exit 2
    ;;
esac
