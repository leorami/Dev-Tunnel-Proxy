#!/usr/bin/env bash
# Switch the dev-tunnel-proxy back to development mode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔧 Switching to development mode..."
echo ""

# Check if containers are running
if docker ps --filter name=dev-proxy --format '{{.Names}}' | grep -q dev-proxy; then
    echo "📦 Stopping current containers..."
    docker-compose down
    echo ""
fi

# Find the most recent backup before production switch
LATEST_BACKUP=$(ls -t config/default.conf.backup.* 2>/dev/null | head -1 || echo "")

if [ -n "$LATEST_BACKUP" ]; then
    echo "⚙️  Restoring development configuration from backup..."
    cp "$LATEST_BACKUP" config/default.conf
    echo "   Restored from: $LATEST_BACKUP"
else
    echo "⚠️  No backup found, keeping current configuration"
fi

# Remove production docker-compose override
if [ -f "docker-compose.override.yml" ]; then
    echo "⚙️  Removing production docker-compose override..."
    rm docker-compose.override.yml
fi
echo ""

# Start with development settings
echo "🔄 Starting containers in development mode..."
docker-compose up -d

echo ""
echo "✅ Development mode activated!"
echo ""
echo "Development features:"
echo "  • Auto-scanning enabled (15s interval)"
echo "  • NODE_ENV=development"
echo "  • Detailed logging"
echo "  • Hot module reloading support"
echo ""
