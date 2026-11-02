#!/usr/bin/env sh
set -eu

echo "Starting nginx with resilient config..."

# Function to test nginx config with detailed error reporting
test_nginx_config() {
  if nginx -t 2>&1; then
    return 0
  else
    return 1
  fi
}

# First try: validate current config
echo "Validating nginx configuration..."
if test_nginx_config; then
  echo "✓ Configuration valid, starting nginx..."
  exec nginx -g 'daemon off;'
fi

echo "⚠ nginx -t failed; attempting emergency fallback (disabling app bundle)..." >&2

BUNDLE="/etc/nginx/conf.d/sites-enabled/apps.generated.conf"
DISABLED="/etc/nginx/conf.d/sites-enabled/apps.generated.conf.disabled"

# Compose bind-mounts sites-enabled read-only. A failed mv must NOT be ignored
# and must NOT continue into a misleading "apps disabled" retry.
if [ -f "$BUNDLE" ] || [ -L "$BUNDLE" ]; then
  echo "  → Disabling apps.generated.conf..." >&2
  if ! mv "$BUNDLE" "$DISABLED" 2>/dev/null; then
    echo "✗ Cannot disable apps.generated.conf (read-only mount or permission failure)." >&2
    echo "✗ Refusing to start nginx with an invalid configuration." >&2
    exit 1
  fi
else
  echo "✗ No apps.generated.conf present to disable after nginx -t failure." >&2
  echo "✗ Refusing to start nginx with an invalid configuration." >&2
  exit 1
fi

# Retry only after a successful rename that actually removed the bundle.
echo "Retrying nginx validation with apps disabled..."
if test_nginx_config; then
  echo "✓ Configuration valid with apps disabled, starting nginx..." >&2
  echo "⚠ WARNING: App routes are disabled. Check app configs for errors." >&2
  exec nginx -g 'daemon off;'
fi

echo "✗ Fallback still failing; nginx cannot start" >&2
echo "" >&2
echo "Troubleshooting steps:" >&2
echo "  1. Check logs: docker logs dev-proxy" >&2
echo "  2. Validate config: docker exec dev-proxy nginx -t" >&2
echo "  3. Check DNS: docker exec dev-proxy nslookup dev-proxy-config-api" >&2
echo "  4. Review config files in config/ and build/sites-enabled/" >&2
echo "" >&2
exit 1
