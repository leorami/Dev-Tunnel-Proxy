#!/bin/bash

# Comprehensive Calliope Enable/Disable Visual Tests
# Tests both scenarios: with and without OPENAI_API_KEY

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_SCRIPT="$SCRIPT_DIR/calliope-enable-disable-visual-test.js"

# Check if services are running
check_services() {
    echo -e "${BLUE}🔍 Checking if dev-tunnel-proxy services are running...${NC}"
    
    if ! docker ps | grep -q "dev-proxy"; then
        echo -e "${RED}❌ dev-proxy container is not running${NC}"
        echo "Please start the services first: docker-compose up -d"
        exit 1
    fi
    
    if ! docker ps | grep -q "dev-calliope-api"; then
        echo -e "${RED}❌ dev-calliope-api container is not running${NC}"
        echo "Please start the services first: docker-compose up -d"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Services are running${NC}"
}

# Install dependencies if needed
install_deps() {
    echo -e "${BLUE}📦 Checking test dependencies...${NC}"
    
    if [ ! -d "$SCRIPT_DIR/ui/node_modules" ]; then
        echo -e "${YELLOW}⚠️ Installing playwright dependencies...${NC}"
        cd "$SCRIPT_DIR/ui"
        npm install
        cd "$PROJECT_ROOT"
    fi
    
    echo -e "${GREEN}✅ Dependencies ready${NC}"
}

# Test with API key disabled
test_without_api_key() {
    echo -e "${BLUE}🧪 SCENARIO 1: Testing WITHOUT OPENAI_API_KEY${NC}"
    echo -e "${YELLOW}   Restarting calliope-api without API key...${NC}"
    
    # Stop conflict-api
    docker stop dev-calliope-api 2>/dev/null || true
    
    # Start without OPENAI_API_KEY
    docker run -d --rm --name dev-calliope-api \
        --network dev-tunnel-proxy_devproxy \
        -v "$PROJECT_ROOT:/app" \
        -w /app \
        -e NODE_ENV=development \
        node:18-alpine \
        node utils/conflictAPI.js
    
    # Wait for service to be ready
    sleep 3
    
    # Run the test
    echo -e "${YELLOW}   Running visual test...${NC}"
    cd "$SCRIPT_DIR/ui"
    PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npx playwright install chromium --with-deps 2>/dev/null || true
    cd "$PROJECT_ROOT"
    node "$TEST_SCRIPT" 2>&1 | sed 's/^/   /'
    
    echo -e "${GREEN}✅ Scenario 1 complete${NC}"
}

# Test with API key enabled  
test_with_api_key() {
    echo -e "${BLUE}🧪 SCENARIO 2: Testing WITH OPENAI_API_KEY${NC}"
    
    # Check if API key is available in environment or ask user
    if [ -z "$OPENAI_API_KEY" ]; then
        echo -e "${YELLOW}⚠️ OPENAI_API_KEY not found in environment${NC}"
        echo -e "${YELLOW}   You can either:${NC}"
        echo -e "${YELLOW}   1. Set OPENAI_API_KEY environment variable${NC}"
        echo -e "${YELLOW}   2. Skip this test (enter 's')${NC}"
        echo -e "${YELLOW}   3. Enter a test key for this session${NC}"
        echo -n "Enter choice (1/2/3): "
        read choice
        
        case $choice in
            s|S|2)
                echo -e "${YELLOW}⏭️ Skipping API key enabled test${NC}"
                return 0
                ;;
            3)
                echo -n "Enter OPENAI_API_KEY: "
                read -s api_key
                echo
                export OPENAI_API_KEY="$api_key"
                ;;
            *)
                echo -e "${RED}❌ API key required for this test${NC}"
                return 1
                ;;
        esac
    fi
    
    echo -e "${YELLOW}   Restarting calliope-api with API key...${NC}"
    
    # Stop conflict-api
    docker stop dev-calliope-api 2>/dev/null || true
    
    # Start with OPENAI_API_KEY
    docker run -d --rm --name dev-calliope-api \
        --network dev-tunnel-proxy_devproxy \
        -v "$PROJECT_ROOT:/app" \
        -w /app \
        -e NODE_ENV=development \
        -e OPENAI_API_KEY="$OPENAI_API_KEY" \
        -e OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}" \
        node:18-alpine \
        node utils/conflictAPI.js
    
    # Wait for service to be ready
    sleep 3
    
    # Run the test
    echo -e "${YELLOW}   Running visual test...${NC}"
    cd "$SCRIPT_DIR/ui"
    PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npx playwright install chromium --with-deps 2>/dev/null || true
    cd "$PROJECT_ROOT"
    node "$TEST_SCRIPT" 2>&1 | sed 's/^/   /'
    
    echo -e "${GREEN}✅ Scenario 2 complete${NC}"
}

# Restore original services
restore_services() {
    echo -e "${BLUE}🔄 Restoring original services...${NC}"
    
    # Stop our test container
    docker stop dev-calliope-api 2>/dev/null || true
    
    # Restart with docker-compose (will use original environment)
    cd "$PROJECT_ROOT"
    docker-compose up -d conflict-api
    
    echo -e "${GREEN}✅ Services restored${NC}"
}

# Main execution
main() {
    echo -e "${GREEN}🚀 Calliope Enable/Disable Visual Test Suite${NC}"
    echo -e "${GREEN}============================================${NC}"
    
    check_services
    install_deps
    
    # Create results directory
    mkdir -p "$SCRIPT_DIR/screenshots/calliope-states"
    
    echo -e "\n${BLUE}📋 Test Plan:${NC}"
    echo -e "   1. Test UI behavior WITHOUT OPENAI_API_KEY (Calliope disabled)"
    echo -e "   2. Test UI behavior WITH OPENAI_API_KEY (Calliope enabled)"
    echo -e "   3. Validate that UI changes appropriately between states"
    echo ""
    
    # Run tests
    test_without_api_key
    echo ""
    test_with_api_key
    
    echo -e "\n${GREEN}🎉 All tests completed!${NC}"
    echo -e "${BLUE}📸 Screenshots and results saved to:${NC}"
    echo -e "   $SCRIPT_DIR/screenshots/calliope-states/"
    
    # Show summary
    echo -e "\n${BLUE}📊 Results Summary:${NC}"
    ls -la "$SCRIPT_DIR/screenshots/calliope-states/" | grep -E '\.(png|json)$' | sed 's/^/   /'
}

# Cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    restore_services
}
trap cleanup EXIT

# Run main function
main "$@"
