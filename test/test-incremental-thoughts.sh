#!/bin/bash

echo "🧪 Testing Incremental Thoughts with 'since' Parameter"
echo "======================================================="
echo ""

echo "1. Starting audit..."
curl -s -X POST http://localhost:3001/api/ai/audit-and-heal \
  -H "Content-Type: application/json" \
  -d '{"url": "http://dev-proxy/", "route": "/", "maxPasses": 1, "timeout": 5000}' > /dev/null

sleep 0.5

echo "2. First poll (get all thoughts)..."
response1=$(curl -s "http://localhost:3001/api/ai/thoughts")
count1=$(echo "$response1" | jq '.events | length')
latest1=$(echo "$response1" | jq -r '.latestTimestamp')
echo "   Found: $count1 thoughts, latest timestamp: $latest1"
echo "$response1" | jq -r '.events[0:3] | .[] | "   - " + .message'
echo ""

sleep 2

echo "3. Second poll (using since=$latest1 to get only NEW thoughts)..."
response2=$(curl -s "http://localhost:3001/api/ai/thoughts?since=$latest1")
count2=$(echo "$response2" | jq '.events | length')
latest2=$(echo "$response2" | jq -r '.latestTimestamp')
echo "   Found: $count2 NEW thoughts, latest timestamp: $latest2"
if [ "$count2" -gt 0 ]; then
  echo "$response2" | jq -r '.events[] | "   - " + .message'
else
  echo "   (No new thoughts since last poll)"
fi
echo ""

sleep 2

echo "4. Third poll (using since=$latest2)..."
response3=$(curl -s "http://localhost:3001/api/ai/thoughts?since=$latest2")
count3=$(echo "$response3" | jq '.events | length')
latest3=$(echo "$response3" | jq -r '.latestTimestamp')
echo "   Found: $count3 NEW thoughts, latest timestamp: $latest3"
if [ "$count3" -gt 0 ]; then
  echo "$response3" | jq -r '.events[] | "   - " + .message'
else
  echo "   (No new thoughts since last poll)"
fi
echo ""

echo "✅ Test complete"
echo ""
echo "Summary:"
echo "  - This demonstrates incremental polling for real-time UI updates"
echo "  - Each poll uses 'since' to get only NEW thoughts"
echo "  - UI can display thoughts progressively as they arrive"

