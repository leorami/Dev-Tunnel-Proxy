# Archive Documentation

⚠️ **DEPRECATION NOTICE**: The documents in this folder may contain outdated information and are kept for historical reference only.

## Current Documentation

For up-to-date documentation, please refer to:

- **[Main README](../../README.md)** - Quick start and overview
- **[User Guide](../USER_GUIDE.md)** - Comprehensive usage guide
- **[API Documentation](../API.md)** - Complete API reference
- **[Configuration Guide](../CONFIGURATION.md)** - Configuration management
- **[Architecture](../ARCHITECTURE.md)** - System architecture
- **[Calliope Assistant](../CALLIOPE_ASSISTANT.md)** - AI assistant features

## Important Changes

### API Base Path

The management API is now namespaced under `/devproxy/api/` (not `/api/`):

- ✅ Correct: `http://localhost:8080/devproxy/api/apps/install`
- ❌ Old: `http://localhost:8080/api/apps/install`

### Authentication Required

Most management endpoints now require authentication via session cookies. See the [API Documentation](../API.md#authentication) for details.

## Archived Documents

The following documents are archived and may contain outdated information:

- `API-ENDPOINTS.md` - See [API.md](../API.md) instead
- `CONFIG-MANAGEMENT-GUIDE.md` - See [CONFIGURATION.md](../CONFIGURATION.md) instead
- `TROUBLESHOOTING.md` - See [USER_GUIDE.md](../USER_GUIDE.md) instead
- `DATA_LIFECYCLE.md` - Historical reference
- `KNOWN_ISSUES.md` - Historical reference
- `RESILIENCE.md` - Historical reference
- `ROADMAP.md` - Historical reference
- `SECURITY.md` - See [TESTING_SECURITY_AND_QUALITY.md](../TESTING_SECURITY_AND_QUALITY.md) instead
- `TESTING.md` - See [TESTING_SECURITY_AND_QUALITY.md](../TESTING_SECURITY_AND_QUALITY.md) instead
