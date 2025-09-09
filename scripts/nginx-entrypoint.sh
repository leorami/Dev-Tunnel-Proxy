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

echo "Fallback still failing; writing minimal safe server to default-fallback.conf" >&2
cat >/etc/nginx/conf.d/default-fallback.conf <<'EOF'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;

  location = /health.json { add_header Content-Type application/json always; return 200 '{"status":"degraded","service":"dev-tunnel-proxy"}'; }
  location = / { return 302 /status; }
  location = /status { try_files /status/status.html =404; }
  location ^~ /status/ { try_files $uri /status/status.html =404; }
  location = /status.json { types { application/json json; } try_files /.artifacts/reports/health-latest.json =404; }
  location = /routes.json { types { application/json json; } try_files /.artifacts/reports/scan-apps-latest.json =404; }
  # Keep Calliope reachable for diagnostics
  location ^~ /api/ai/ { proxy_pass http://host.docker.internal:3001; proxy_http_version 1.1; proxy_set_header Host $host; }
  location ^~ /api/config/ { proxy_pass http://host.docker.internal:3001; proxy_http_version 1.1; proxy_set_header Host $host; }
}
EOF

# Final attempt
exec nginx -g 'daemon off;'
