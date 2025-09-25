#!/bin/bash

# Validate all JavaScript in HTML files across the project

echo "🔍 JavaScript Syntax Validation for Dev Tunnel Proxy"
echo "================================================="

cd "$(dirname "$0")/.."

# Find all HTML files with JavaScript
HTML_FILES=$(find . -name "*.html" -not -path "./node_modules/*" -not -path "./.git/*")

if [ -z "$HTML_FILES" ]; then
    echo "❌ No HTML files found"
    exit 1
fi

TOTAL_FILES=0
VALID_FILES=0
ERROR_FILES=0

for file in $HTML_FILES; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    echo ""
    
    if node utils/test-js-syntax.js "$file"; then
        VALID_FILES=$((VALID_FILES + 1))
    else
        ERROR_FILES=$((ERROR_FILES + 1))
    fi
done

echo ""
echo "📊 Summary:"
echo "   Total files checked: $TOTAL_FILES"
echo "   ✅ Valid files: $VALID_FILES"
echo "   ❌ Files with errors: $ERROR_FILES"

if [ $ERROR_FILES -gt 0 ]; then
    echo ""
    echo "❌ JavaScript syntax errors found! Please fix before deploying."
    exit 1
else
    echo ""
    echo "✅ All JavaScript syntax is valid!"
    exit 0
fi
