#!/bin/bash

echo "🧪 Simple Real-Time Thoughts Test"
echo "=================================="
echo ""

echo "1. Starting audit in background..."
curl -s -X POST http://localhost:3001/api/ai/audit-and-heal \
  -H "Content-Type: application/json" \
  -d '{"url": "http://dev-proxy/", "route": "/", "maxPasses": 1, "timeout": 5000}' | jq -r '.message'
echo ""

echo "2. Polling for thoughts every 0.5 seconds for 15 seconds..."
echo ""

for i in {1..30}; do
  elapsed=$(echo "scale=1; $i * 0.5" | bc)
  count=$(curl -s http://localhost:3001/api/ai/thoughts | jq '.events | length')
  
  if [ "$count" -gt 0 ]; then
    echo "[${elapsed}s] Found $count thoughts"
    
    # Show first 3 thought messages
    curl -s http://localhost:3001/api/ai/thoughts | jq -r '.events[0:3] | .[] | "  - " + .message'
    echo ""
  else
    echo "[${elapsed}s] No thoughts yet..."
  fi
  
  sleep 0.5
done

echo ""
echo "✅ Test complete"

