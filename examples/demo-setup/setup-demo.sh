#!/bin/bash

echo "🚀 Setting up Dev Tunnel Proxy conflict management demo..."

# Go to project root
cd "$(dirname "$0")/../.."

# Create demo configs with conflicts
mkdir -p apps

# Demo API conflict
cat > apps/ecommerce-api.conf << 'EOF'
# E-commerce API service
location /api/ {
  proxy_pass http://ecommerce-api:8000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
}

location /shop/ {
  proxy_pass http://ecommerce-frontend:3000;
}
EOF

cat > apps/user-service.conf << 'EOF'
# User management service  
location /api/ {
  proxy_pass http://user-service:9000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
}

location /profile/ {
  proxy_pass http://user-frontend:4000;
}
EOF

# Demo admin conflict
cat > apps/cms.conf << 'EOF'
# Content Management System
location /admin/ {
  proxy_pass http://cms-backend:5000;
}

location /content/ {
  proxy_pass http://cms-frontend:3001;
}
EOF

cat > apps/analytics.conf << 'EOF'
# Analytics Dashboard
location /admin/ {
  proxy_pass http://analytics-backend:6000;
}

location /reports/ {
  proxy_pass http://analytics-frontend:3002;
}
EOF

# Clear any existing resolutions
rm -f .artifacts/route-resolutions.json

echo "✅ Demo configurations created with intentional conflicts:"
echo "   - /api/ conflict: ecommerce-api.conf vs user-service.conf"
echo "   - /admin/ conflict: cms.conf vs analytics.conf"

echo ""
echo "🔍 Scanning for conflicts..."
node test/scanApps.js

echo ""
echo "🌐 Demo setup complete!"
echo ""
echo "Next steps:"
echo "  1. Visit http://localhost:8080/status to see the conflict management UI"
echo "  2. Use the visual interface to resolve conflicts"
echo "  3. Try the auto-fix suggestions"
echo "  4. Experiment with config editing"
echo ""
echo "Live demo available at: https://ramileo.ngrok.app/status"
