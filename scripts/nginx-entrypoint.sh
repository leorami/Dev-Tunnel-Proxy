#!/usr/bin/env sh
set -eu

echo "Starting nginx with resilient config..."

# First try: validate current config
if nginx -t; then
  exec nginx -g 'daemon off;'
fi

echo "nginx -t failed; attempting emergency fallback (disabling app bundle)..." >&2

# Emergency fallback: disable generated app bundle if present to keep core UI/API alive
if [ -f "/etc/nginx/conf.d/sites-enabled/apps.generated.conf" ]; then
  mv /etc/nginx/conf.d/sites-enabled/apps.generated.conf /etc/nginx/conf.d/sites-enabled/apps.generated.conf.disabled 2>/dev/null || true
fi

# Retry with bundle disabled
if nginx -t; then
  exec nginx -g 'daemon off;'
fi

echo "Fallback still failing; nginx cannot start" >&2
echo "Check logs with: docker logs dev-proxy" >&2
exit 1
