# Child Task: Core Schema Cleanup for Editable Slices

## Goal

Expose only the real editable operator slices needed by the phase-2 system settings UI and remove the stale storage operator IA from the schema surface.

## Scope

- Add `notifications`, `auth`, `oauth_google`, `oauth_github`, and `oauth_provisioning`
- Narrow `storage` to provider + connection fields
- Keep existing runtime consumers stable
