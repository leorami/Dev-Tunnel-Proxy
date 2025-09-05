#!/bin/bash

echo "🧹 Cleaning up conflict management demo..."

# Go to project root  
cd "$(dirname "$0")/../.."

# Remove demo configs
rm -f apps/ecommerce-api.conf
rm -f apps/user-service.conf
rm -f apps/cms.conf
rm -f apps/analytics.conf

# Clear conflict resolutions
rm -f .artifacts/route-resolutions.json

echo "✅ Demo cleanup complete!"
echo ""
echo "Original proxy configuration restored."
