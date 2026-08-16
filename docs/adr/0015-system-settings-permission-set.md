# System Settings uses an explicit delegated permission set

**Status:** accepted

System Settings will introduce dedicated `platform:system-settings:read` and `platform:system-settings:manage` permissions. The Instance Owner has both by default; Platform Operators receive them only through Platform Roles. High-impact global changes such as Language Catalog publication, default-locale changes, maintenance mode, or registration policy changes use revision-bound impact review, reason, idempotency, Audit, and action-bound Step-up Verification when required.

**Consequences**

- System settings do not inherit authority from Commerce, Access, or another domain.
- Unauthorized settings remain undiscoverable in navigation, command search, and field projections.
- Permission removal must immediately block new saves while preserving already accepted operations and evidence.
