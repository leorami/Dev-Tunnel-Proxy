#!/usr/bin/env sh
set -eu

# Start nginx without strict upstream validation
echo "Starting nginx with relaxed upstream validation..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Wait for nginx to start
sleep 2

# Check if nginx is running
if kill -0 $NGINX_PID 2>/dev/null; then
  echo "nginx started successfully (PID: $NGINX_PID)"
  wait $NGINX_PID
else
  echo "nginx failed to start"
  exit 1
fi
