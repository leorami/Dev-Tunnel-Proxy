#!/bin/bash
# Rebuild Calliope's knowledge base embeddings
# 
# This script triggers a full reindex of documentation embeddings
# for Calliope's RAG (Retrieval-Augmented Generation) system.
#
# Usage: ./scripts/reindex-calliope.sh

set -e

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load .env file if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  echo "📄 Loading environment from .env file..."
  set -a  # automatically export all variables
  source "$PROJECT_ROOT/.env"
  set +a
  echo ""
fi

echo "🧠 Rebuilding Calliope's Knowledge Base..."
echo ""

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ Error: OPENAI_API_KEY is not set"
  echo ""
  echo "Please either:"
  echo "  1. Add OPENAI_API_KEY to .env file in project root"
  echo "  2. Export it in your shell: export OPENAI_API_KEY='your-key'"
  echo ""
  if [ -f "$PROJECT_ROOT/.env" ]; then
    echo "Note: .env file exists but doesn't contain OPENAI_API_KEY"
  else
    echo "Note: No .env file found at $PROJECT_ROOT/.env"
  fi
  exit 1
fi

# Check if Calliope API is running
if ! curl -s http://localhost:8080/devproxy/api/ai/health > /dev/null 2>&1; then
  echo "❌ Error: Calliope API is not running (check http://localhost:8080/devproxy/api/ai/health)"
  echo "   Start it with: docker-compose up -d dev-calliope-api"
  exit 1
fi

echo "📚 Collecting documentation..."
echo "   - README.md"
echo "   - docs/*.md"
echo "   - examples/*.md"
echo ""

# Trigger reindex via API
RESPONSE=$(curl -s -X POST http://localhost:8080/devproxy/api/ai/reindex)

# Check if reindex was successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
  CHUNKS=$(echo "$RESPONSE" | grep -o '"chunks":[0-9]*' | grep -o '[0-9]*')
  MODEL=$(echo "$RESPONSE" | grep -o '"model":"[^"]*"' | cut -d'"' -f4)
  DIM=$(echo "$RESPONSE" | grep -o '"dim":[0-9]*' | grep -o '[0-9]*')
  
  echo "✅ Reindex complete!"
  echo ""
  echo "📊 Statistics:"
  echo "   Chunks: $CHUNKS"
  echo "   Model: $MODEL"
  echo "   Dimensions: $DIM"
  echo ""
  echo "💾 Index saved to: .artifacts/ai-embeddings.json"
  echo ""
  echo "🎉 Calliope now has access to updated documentation!"
else
  echo "❌ Reindex failed!"
  echo ""
  echo "Response:"
  echo "$RESPONSE"
  exit 1
fi

