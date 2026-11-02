#!/usr/bin/env bash
# Switch the dev-tunnel-proxy to production mode for better performance

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 Switching to production mode..."
echo ""

# Check if containers are running
if docker ps --filter name=dev-proxy --format '{{.Names}}' | grep -q dev-proxy; then
    echo "📦 Stopping current containers..."
    docker-compose down
    echo ""
fi

# Backup current configuration
echo "💾 Backing up current configuration..."
TIMESTAMP=$(date +%s)
if [ -f "config/default.conf" ]; then
    cp config/default.conf "config/default.conf.backup.$TIMESTAMP"
fi
echo ""

# Switch to production configuration
echo "⚙️  Switching to production configuration..."
cp config/default.production.conf config/default.conf

# Also update docker-compose to use production nginx.conf
echo "⚙️  Updating docker-compose to use production nginx configuration..."
if [ -f "docker-compose.override.yml" ]; then
    cp docker-compose.override.yml "docker-compose.override.yml.backup.$TIMESTAMP"
fi

cat > docker-compose.override.yml <<'EOF'
services:
  proxy:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./config/nginx.production.conf:/etc/nginx/nginx.conf:ro
      - ./config/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./build/sites-enabled:/etc/nginx/conf.d/sites-enabled:ro
      - ./scripts/nginx-entrypoint.sh:/entrypoint.sh:ro
      - ./.artifacts:/usr/share/nginx/html/.artifacts
      - ./.certs:/etc/nginx/certs:ro
      - ./status:/usr/share/nginx/html/status:ro
      - ./dashboard/public:/usr/share/nginx/html/dashboard:ro
      - nginx_cache:/var/cache/nginx

  proxy-config-api:
    environment:
      - NODE_ENV=production
      - AUTO_SCAN_ENABLED=0
      - AUTO_SCAN_INTERVAL_SECONDS=300

volumes:
  nginx_cache:
    driver: local
EOF

echo ""

# Start with production settings
echo "🔄 Starting containers in production mode..."
# An explicit -f suppresses implicit override loading. Include both manifests
# so the production nginx.conf, custom Dockerfile, and production API settings
# are truly applied. This script is a LIVE mode-switch; never run in tests.
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

echo ""
echo "✅ Production mode activated!"
echo ""
echo "Performance improvements:"
echo "  • Gzip compression enabled"
echo "  • Proxy caching configured"
echo "  • Worker connections increased to 4096"
echo "  • DNS caching enabled (30s TTL)"
echo "  • Auto-scanning disabled by default"
echo "  • NODE_ENV=production"
echo ""
echo "To revert to development mode, run:"
echo "  docker-compose down"
echo "  cp config/default.conf.backup.<timestamp> config/default.conf"
echo "  docker-compose up -d"
echo ""
