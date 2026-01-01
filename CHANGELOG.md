# Changelog

All notable changes to Dev Tunnel Proxy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-01-01

### Added

#### UI/UX Enhancements
- **Custom Dialog System**: Replaced all native browser dialogs (`alert`, `confirm`, `prompt`) with custom-designed modal dialogs
  - White/light gray backgrounds matching app style
  - Smooth fade-in/fade-out animations
  - Keyboard shortcuts (Escape to close, Enter to confirm)
  - Backdrop click to close
  - Proper focus management and screen reader support
  
- **Toast Notification System**: Non-blocking messages for user feedback
  - Color-coded by type (success, error, warning, info)
  - Auto-dismiss after 3 seconds (configurable)
  - Slide-in/fade-out animations
  - Multiple toasts stack vertically
  
- **Custom Prompt Dialogs**: Styled input dialogs for route renaming and text input
  - Consistent with modal dialog design
  - Pre-filled default values
  - Validation support

#### Route Conflicts Management
- **Redesigned Route Conflicts Card**:
  - Professional icon badge (alert triangle) with orange theme
  - Clear title and subtitle explaining the issue
  - **"Help Me" button** with Calliope's heart stethoscope icon
    - Opens Calliope drawer automatically
    - Pre-populates helpful prompt about the conflicts
    - Auto-clicks "Ask" to get immediate assistance
  - **"Dismiss" button** (renamed from "Acknowledge")
    - Positioned on the right with other action buttons
    - Hides card for 7 days
  - Detailed conflict descriptions with visual badges
  - Winner selection options for each conflict
  - Actionable suggestions with rename buttons
  - AI Auto-Fix option

- **Conflict Detection Chip**: Added to Status Overview
  - Visible "Conflict Detected" chip when conflicts exist
  - Click to scroll to and reveal the Route Conflicts card
  - Proper severity classification in status calculation

#### Consistent Card Design
- All major cards now have unified header structure:
  - **Status Overview**: Blue activity icon badge
  - **Settings**: Orange settings icon badge
  - **Configured Apps**: Green boxes icon badge
  - **Route Conflicts**: Orange alert triangle badge
- Each card has icon, title, and descriptive subtitle
- Consistent spacing and visual hierarchy

#### Icon-Based Navigation
- **Reload Button**: Animated refresh icon (spins on click)
- **View Toggle**: Grid/List icons that change based on current view state
- **Theme Toggle**: Moon/Sun icons that change based on current theme
- All icons using Lucide icon library for consistency

#### Create Route Tool
- **New Route Creator** accessible from:
  - "Create Route" link in main header
  - Plus icon in Configured Apps card header
  - Direct deep-link: `/dashboard/#create-route`
  
- **Modal-Based UI**: Clean, focused workflow without leaving the page

- **Framework Presets**: One-click configurations for:
  - Next.js (with `basePath` support)
  - Vite (with `base` configuration)
  - Rails (subpath mounted)
  - Django (with `SCRIPT_NAME`)
  - Express/Node (manual prefix handling)

- **Auto-Generation with Safety Rails**:
  - Base path normalization (ensures `/myapp/` format)
  - Upstream URL validation and normalization
  - Reserved path checking (blocks `/`, `/status`, `/health`, etc.)
  - Trailing slash redirect generation (recommended)
  - WebSocket header injection for HMR support
  - X-Forwarded-Prefix header for framework compatibility
  - Essential proxy headers (Host, Forwarded-*, etc.)
  - Resilient upstream configuration with DNS resolver

- **Flexible Deployment**:
  - Check "Install to proxy" for immediate deployment
  - Or download `.conf` file for manual installation
  - Preview generated config before installation

#### Calliope Drawer Improvements
- **Completely Hidden When Collapsed**:
  - No visible edges or shadows on the right side
  - Uses `translateX(calc(100% + 50px))` to push completely off-screen
  - `visibility: hidden` with proper transition timing (0.18s delay on close)
  
- **Responsive Positioning**:
  - Top-aligned with Status Overview card at `calc(var(--headerH) + 16px)`
  - Bottom gap matches top gap (16px each side)
  - Height: `calc(100vh - var(--headerH) - 32px)` for perfect viewport fit
  - Always fits within viewport, no scrolling issues
  
- **Smooth Transitions**:
  - Visibility transition delayed on close to complete slide animation first
  - Immediate visibility on open for instant appearance
  - No flickering or visual artifacts

### Changed

#### API Improvements
- **New Endpoint**: `POST /api/apps/create-route`
  - Generates optimal nginx configuration
  - Validates inputs against reserved paths
  - Supports optional immediate installation
  - Returns downloadable config content
  
- **Enhanced Authentication**:
  - Added `/api/ai/ask`, `/api/ai/cancel`, `/api/ai/chat-history` to public endpoints
  - Proper error handling for authentication failures
  - Consistent API responses

#### Status Dashboard
- **Route Health Severity Calculation**: More accurate classification
  - `warn` for 0, 4xx, or non-308 3xx statuses
  - `err` for 5xx statuses
  - `ok` for 2xx and 308 redirects
  - Fixes "Everything's Green" issue where warnings were shown as OK

- **Button Shadow Reduction**: Reduced box-shadow on action buttons
  - From `0 4px 18px rgba(0,0,0,.25)` to `0 2px 8px rgba(0,0,0,.15)`
  - Cleaner, more modern appearance
  - Better visual hierarchy

### Fixed

#### macOS Notifications Bridge
- **Installation Script Fixes**:
  - Corrected unbound variable error (`${LABEL}` → `${ENGINE_LABEL}`)
  - Fixed service load order (bridge before engine)
  - Added 1-second delay between loads for proper initialization
  - No more "Bridge not running" notifications when bridge is actually running

- **Connection Stability**:
  - Uses `localhost` or `127.0.0.1` based on hostname detection
  - Better error handling for bridge unavailability
  - Improved reliability across different macOS configurations

#### Nginx Configuration
- **Calliope AI Endpoint Routing**: Fixed 404 errors
  - Changed `/devproxy/api/ai/` proxy_pass from double-prefixed to single-prefixed
  - Now correctly proxies to `http://$config_api` instead of `http://$config_api/devproxy/api/ai/`
  - Proper routing for `/devproxy/api/ai/ask` and other AI endpoints

#### Status Page Issues
- **Route Severity Classification**: Fixed overly lenient health checks
  - Now properly marks routes as `warn` or `err` based on status codes
  - More accurate overall system health display
  - Prevents false "all green" status

- **Conflict Card Layout**: Fixed button positioning
  - Acknowledge/Dismiss button now properly aligned to the right
  - Consistent with other action button layouts
  - Proper flex layout with `header-actions` class

### Removed

- **Emojis from Non-Calliope UI Elements**:
  - Removed emojis from tool card titles
  - Removed emojis from notification messages
  - Removed emojis from notification controls
  - Removed emojis from reload messages
  - Removed emojis from button labels (except Calliope-related)
  - Kept emojis only for Calliope's personality and communication

- **"Open Route" Action Button**: Removed from individual route cards
  - Streamlined card actions
  - Reduced visual clutter
  - Routes can still be opened via URL or other means

### Documentation

- **Updated User Guide** (`docs/USER_GUIDE.md`):
  - Added "What's New in v1.1" section
  - Documented Route Conflicts Management
  - Documented Create Route Tool
  - Documented custom dialog/toast system
  - Documented Calliope drawer positioning
  - Updated all relevant sections with v1.1 features

- **Updated Configuration Guide** (`docs/CONFIGURATION.md`):
  - Documented `POST /api/apps/create-route` endpoint
  - Added examples of auto-generated configs
  - Explained safety rails and validation
  - Updated version to 1.1

- **Updated Calliope Assistant Guide** (`docs/CALLIOPE_ASSISTANT.md`):
  - Documented improved drawer behavior
  - Added Route Conflicts integration section
  - Updated "How to Use Calliope" with v1.1 features
  - Updated version to 1.1

- **Created CHANGELOG.md**: This file!
  - Comprehensive record of all changes
  - Follows Keep a Changelog format
  - Semantic versioning compliance

## [1.0.0] - 2025-12-01

### Added
- Initial release of Dev Tunnel Proxy
- Nginx-based reverse proxy for development
- ngrok tunnel integration
- Calliope AI assistant with self-healing capabilities
- Status dashboard with route health monitoring
- Configuration API for programmatic management
- Docker Compose orchestration
- macOS notifications bridge
- Comprehensive documentation

[1.1.0]: https://github.com/yourusername/dev-tunnel-proxy/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yourusername/dev-tunnel-proxy/releases/tag/v1.0.0
