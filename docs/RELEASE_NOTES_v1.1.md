# Dev Tunnel Proxy v1.1 Release Notes

**Release Date**: January 1, 2026  
**Version**: 1.1.0

## Overview

Version 1.1 represents a major UI/UX overhaul focused on improving the developer experience with modern, polished interfaces, better conflict management, and streamlined route creation. This release emphasizes consistency, accessibility, and ease of use while maintaining all the powerful features of v1.0.

---

## 🎨 Major UI/UX Improvements

### Custom Dialog & Toast System

We've completely replaced native browser dialogs with a custom-designed system that matches the app's visual style:

- **Modal Dialogs**: Beautiful, branded confirmation and alert dialogs
- **Toast Notifications**: Non-blocking messages that auto-dismiss
- **Custom Prompts**: Styled input dialogs for route operations
- **Keyboard Support**: Escape to close, Enter to confirm
- **Accessibility**: Proper ARIA labels and focus management

### Enhanced Route Conflicts Management

Route conflicts are now presented in a professional, actionable way:

- **Visual Design**: Icon badge, clear title, and explanatory subtitle
- **Help Me Button**: Opens Calliope with conflict details pre-populated
- **Dismiss Button**: Hide conflicts for 7 days if not relevant
- **Detailed Descriptions**: Clear explanations of what's wrong
- **Actionable Suggestions**: Rename buttons and resolution options
- **Conflict Detection Chip**: Quick access from Status Overview

### Unified Card Design

All major cards now share a consistent, professional appearance:

- **Icon Badges**: Color-coded visual identifiers
  - Blue for Status Overview (activity icon)
  - Orange for Settings (settings icon)
  - Green for Configured Apps (boxes icon)
  - Orange for Route Conflicts (alert triangle)
- **Titles & Subtitles**: Clear hierarchy and information
- **Consistent Spacing**: Unified gaps and padding

### Icon-Based Navigation

The header now uses intuitive icons instead of text:

- **Reload**: Animated refresh icon
- **View Toggle**: Grid/List icons that change with state
- **Theme Toggle**: Moon/Sun icons that change with theme
- **All Lucide Icons**: Consistent, high-quality icon library

---

## 🚀 New Features

### Create Route Tool

A powerful new tool for generating optimal nginx configurations:

**Access Points**:
- "Create Route" link in main header
- Plus icon in Configured Apps card
- Direct URL: `/dashboard/#create-route`

**Framework Presets**:
- Next.js (with basePath)
- Vite (with base)
- Rails (subpath mounted)
- Django (SCRIPT_NAME)
- Express/Node (manual prefix)

**Auto-Generation with Safety Rails**:
- Base path normalization (`/myapp/`)
- Upstream URL validation
- Reserved path checking
- Trailing slash redirects
- WebSocket support headers
- X-Forwarded-Prefix header
- Essential proxy headers
- Resilient upstream config

**Flexible Deployment**:
- Install directly to proxy
- Download `.conf` file
- Preview before installation

### Improved Calliope Drawer

The AI assistant drawer has been completely reworked:

**Visual Improvements**:
- **Completely Hidden**: No visible edges when collapsed
- **Perfect Alignment**: Top-aligned with content cards
- **Responsive Height**: Always fits within viewport
- **Smooth Transitions**: Properly timed visibility animations

**Technical Details**:
- Uses `translateX(calc(100% + 50px))` for complete hide
- `visibility: hidden` with 0.18s delay on close
- Height: `calc(100vh - var(--headerH) - 32px)`
- 16px gaps top and bottom

---

## 🐛 Bug Fixes

### macOS Notifications Bridge

Fixed persistent "Bridge not running" notifications:

- Corrected unbound variable in installation script
- Fixed service load order (bridge before engine)
- Added proper initialization delay
- Improved connection stability

### Nginx Configuration Routing

Fixed 404 errors on Calliope AI endpoints:

- Corrected double-prefix issue in `/devproxy/api/ai/` routing
- Proper proxy_pass configuration
- All AI endpoints now work correctly

### Status Page Accuracy

Fixed "Everything's Green" issue:

- More accurate severity classification
- Proper handling of 4xx, 5xx status codes
- Correct conflict counting
- Better overall health calculation

### Button Layout & Shadow

- Reduced excessive box-shadows on action buttons
- Fixed Acknowledge/Dismiss button alignment
- Proper flex layout for header actions

---

## 🔧 API Enhancements

### New Endpoint: Create Route

`POST /api/apps/create-route`

Automatically generates optimal nginx configuration with validation:

```json
{
  "name": "myapp",
  "basePath": "/myapp",
  "upstream": "http://myapp-container:3000",
  "options": {
    "redirect": true,
    "websockets": true,
    "forwardedPrefix": true
  },
  "install": true
}
```

Features:
- Input validation against reserved paths
- Automatic normalization
- Safety rail enforcement
- Optional immediate installation
- Downloadable config files

### Enhanced Authentication

- Added public endpoints for Calliope chat
- Proper error handling
- Consistent API responses

---

## 📚 Documentation Updates

All documentation has been updated to v1.1:

### User Guide (`docs/USER_GUIDE.md`)
- Added "What's New in v1.1" section
- Documented Route Conflicts Management
- Documented Create Route Tool
- Documented custom dialog/toast system
- Updated all relevant sections

### Configuration Guide (`docs/CONFIGURATION.md`)
- Documented new `create-route` endpoint
- Added examples and usage patterns
- Explained safety rails and validation

### Calliope Assistant Guide (`docs/CALLIOPE_ASSISTANT.md`)
- Documented improved drawer behavior
- Added Route Conflicts integration
- Updated usage instructions

### New: CHANGELOG.md
- Comprehensive change tracking
- Semantic versioning compliance
- Clear categorization of changes

---

## 🎯 Breaking Changes

**None**. Version 1.1 is fully backward compatible with 1.0.

All existing configurations, APIs, and workflows continue to work as expected.

---

## 🚀 Migration Guide

### From v1.0 to v1.1

**No migration required!** Simply update to v1.1:

```bash
git pull origin main
./smart-build.sh down
./smart-build.sh up
```

All existing configurations will work without modification.

### Optional: Update macOS Notifications

If you're using the macOS notifications bridge:

```bash
cd macos
./install-notifications-engine.sh
```

This will update the bridge with the latest fixes.

---

## 🙏 Acknowledgments

This release was driven by real user feedback and usage patterns. Special thanks to:

- Early adopters who identified UI inconsistencies
- Testers who helped reproduce the notifications bridge issue
- The community for suggesting the Create Route tool

---

## 📊 Statistics

- **Lines Changed**: ~1,200 across status pages and dashboard
- **New CSS**: Custom dialog and toast system (~300 lines)
- **API Additions**: 1 new endpoint with ~150 lines
- **Documentation**: 4 files updated, 1 file added
- **Bug Fixes**: 5 major issues resolved

---

## 🔮 What's Next

Looking ahead to v1.2:

- **Enhanced Healing Patterns**: More automated fixes for common issues
- **Multi-Container Routing**: Better support for microservices
- **Performance Monitoring**: Real-time metrics and charts
- **Configuration Templates**: More framework presets
- **Improved Logging**: Better debugging and troubleshooting

---

## 💬 Feedback

We'd love to hear from you!

- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Ask questions or share tips
- **Pull Requests**: Contribute improvements

---

**Happy developing!** 🎉

The Dev Tunnel Proxy Team
