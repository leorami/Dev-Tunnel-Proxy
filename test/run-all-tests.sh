#!/bin/bash
# Run all tests for dev-tunnel-proxy
# Tests cover issues uncovered and fixed during development

# Don't exit on first error - we want to run all tests
set +e

echo "🧪 Running Dev Tunnel Proxy Test Suite"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0
PASSED=0

# Function to run a test
run_test() {
  local test_file=$1
  local test_name=$2
  
  echo -e "${YELLOW}Running: ${test_name}${NC}"
  
  if node "$test_file"; then
    echo -e "${GREEN}✅ PASSED: ${test_name}${NC}"
    echo ""
    ((PASSED++))
  else
    echo -e "${RED}❌ FAILED: ${test_name}${NC}"
    echo ""
    ((FAILED++))
  fi
}

# Unit Tests
echo "📦 Unit Tests"
echo "-------------"
run_test "test/unit/route-promotion-filtering.test.js" "Route Promotion Child Filtering"

# Integration Tests
echo "🔗 Integration Tests"
echo "--------------------"
run_test "test/integration/api-reindex.test.js" "API Reindex Endpoint"
run_test "test/integration/api-apps-install.test.js" "API Apps Install Endpoint"

# E2E Tests
echo "🌐 E2E Tests"
echo "------------"
run_test "test/e2e/nginx-proxy-pass.test.js" "Nginx Proxy Pass Configuration"

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
