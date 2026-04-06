#!/bin/bash
# Quick verification script to check for common documentation issues

echo "🔍 Verifying documentation accuracy..."
echo ""

# Check for incorrect API paths in main docs (excluding intentional "Before/Incorrect" examples)
echo "1. Checking for incorrect /api/ paths (should be /devproxy/api/)..."
INCORRECT_API=$(grep -B2 "localhost:8080/api/" docs/*.md 2>/dev/null | grep -v "devproxy" | grep -v "archive" | grep -v "Before" | grep -v "Incorrect" | grep "curl" | wc -l | tr -d ' ')
if [ "$INCORRECT_API" -eq "0" ]; then
  echo "   ✅ No incorrect /api/ paths found (excluding intentional 'Before' examples)"
else
  echo "   ❌ Found $INCORRECT_API incorrect /api/ paths"
  grep -B2 "localhost:8080/api/" docs/*.md 2>/dev/null | grep -v "devproxy" | grep -v "archive" | grep -v "Before" | grep -v "Incorrect" | grep "curl"
fi
echo ""

# Check for port 3001 usage in main docs (should use 8080)
echo "2. Checking for port 3001 usage (should use 8080)..."
PORT_3001=$(grep -r "localhost:3001/api/" docs/*.md 2>/dev/null | grep -v "archive" | wc -l | tr -d ' ')
if [ "$PORT_3001" -eq "0" ]; then
  echo "   ✅ No port 3001 references found in main docs"
else
  echo "   ❌ Found $PORT_3001 port 3001 references"
  grep -r "localhost:3001/api/" docs/*.md 2>/dev/null | grep -v "archive"
fi
echo ""

# Check for correct devproxy prefix usage
echo "3. Checking for correct /devproxy/api/ usage..."
CORRECT_API=$(grep -r "/devproxy/api/" docs/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "   ✅ Found $CORRECT_API correct /devproxy/api/ references"
echo ""

# Verify key files exist
echo "4. Verifying key documentation files..."
for file in "README.md" "INTEGRATION_GUIDE.md" "docs/API.md" "docs/USER_GUIDE.md" "docs/CONFIGURATION.md"; do
  if [ -f "$file" ]; then
    echo "   ✅ $file exists"
  else
    echo "   ❌ $file missing"
  fi
done
echo ""

echo "✨ Documentation verification complete!"
