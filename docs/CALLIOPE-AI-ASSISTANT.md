# Calliope – Your Dev Tunnel Proxy Assistant

Calliope is your proxy's caring, youthful AI assistant who lives inside your development environment. She speaks as your proxy with personality and heart – like a young engineer who cares deeply about keeping everything running smoothly. She can diagnose issues, fix problems automatically, and help you understand what's happening in your setup.

## Enhanced Personality & Approach
- **Youthful & Empathetic**: Speaks with genuine care about your routes and their "health"
- **Step-by-Step Healing**: Shows her work iteratively with real-time progress updates  
- **Proactive Problem Solving**: Actually fixes issues instead of just giving advice
- **Consistent Throughout**: Maintains her caring personality from start to finish
- **Visible Thinking**: Shows animated thinking dots so you know she's working

## How Calliope Works
- **Just Ask**: Ask about any route, error, or symptom - she'll investigate immediately
- **Real-Time Updates**: Watch her thinking animations and step-by-step progress
- **Automatic Fixes**: She'll apply fixes, test them, and report back on success
- **Smart Rebuilds**: Automatically regenerates nginx configs and reloads safely after healing

## Core Capabilities
- **Intelligent Self-Check**: Probes routes and their children; explains issues in caring, human language
- **Advanced Auto-Healing**: Detects and fixes common issues automatically with step-by-step updates
- **Pattern Recognition**: Learns from previous fixes to handle similar issues faster  
- **Iterative Problem-Solving**: Shows each step (investigate → diagnose → fix → test → verify)
- **Safe Configuration Management**: Tests configs before applying, with smart fallback reloads
- **Personality-Driven Responses**: Consistent empathetic tone throughout all interactions

## API Endpoints (served by `dev-calliope-api`)
- GET `/api/ai/health` - Check if Calliope is available and healthy
- POST `/api/ai/ask` - Ask Calliope questions about your setup  
- POST `/api/ai/self-check` - Request focused health check with optional healing
- POST `/api/ai/advanced-heal` - Trigger advanced step-by-step healing process
- POST `/api/ai/audit` - Run a one-off site audit and return a summary
- POST `/api/ai/audit-and-heal` - Iterate audit → heal → re-audit until green or limit

## Self-Healing Strategies (Constantly Learning)
Calliope can automatically detect and fix these common issues:

### **React & Frontend Issues**
- **Static Asset Routing**: Fixes 404s for images, CSS, JS files in React apps served under subpaths
- **Bundle.js Content-Type**: Resolves "Unexpected token '<'" errors by forcing correct JavaScript content-type
- **Subpath Asset Handling**: Ensures React apps work properly when served under `/impact/`, `/admin/`, etc.

### **Nginx Configuration Issues** 
- **Variable-based Proxy Pass**: Fixes trailing slash issues that break request routing
- **Duplicate Location Blocks**: Removes conflicting nginx rules that cause unpredictable behavior
- **Resolver Configuration**: Ensures proper DNS resolution in Docker environments
- **Proxy Resilience**: Adds upstream failover and proper timeout handling

### **Infrastructure & Connectivity**
- **Proxy Discovery**: Forces detection and updates of ngrok tunnel URLs
- **Symlink Recreation**: Rebuilds broken symlinks to latest health reports  
- **Container Health Checks**: Verifies and restarts services that have failed

### **Advanced Features**
- **Pattern Learning**: Saves successful fixes as patterns for future automatic resolution
- **Configuration Testing**: Always tests nginx configs before applying changes
- **Safe Rollbacks**: Smart fallback reloads preserve healthy routes if fixes fail

## How to Interact with Calliope

### **Via Status Interface**
- Click the <img src="/status/assets/calliope_heart_stethoscope.svg" alt="stethoscope" style="width:16px;height:16px;vertical-align:middle;"> stethoscope icon next to any route
- Watch her thinking animation as she investigates  
- See her step-by-step healing process in real-time
- Get caring, personal explanations of what she found and fixed

### **Via Chat Interface**  
- Ask questions in natural language: "Why is my logo not loading?"
- Request healing: "Can you fix the /impact route?"
- Get help understanding errors: "What does this 404 mean?"

### **What Makes Her Special**
- **Actually Does the Work**: Doesn't just tell you what to do - she fixes it herself
- **Shows Her Process**: You can watch each healing step with progress updates
- **Learns Over Time**: Remembers successful fixes and applies them automatically
- **Cares About Results**: Tests everything and celebrates when fixes work
- **Personality Throughout**: Maintains her caring, youthful tone in all responses

## Technical Implementation
- **Health Monitoring**: Uses `/health.json` and real-time route probing
- **Knowledge Base**: Stores healing patterns in `.artifacts/calliope/healing-kb.json`
- **Safe Operations**: All configuration changes are tested before applying
- **Automatic Rebuilds**: Regenerates nginx bundles and reloads safely after fixes
- **Storybook + Vite**: Enforces static root `/@id` and `/@vite` pass-throughs, canonical `/sdk` handler, and can run `scripts/test_storybook_proxy.sh` as a regression check
