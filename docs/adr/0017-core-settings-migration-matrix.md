# Migrate core settings by ownership, not by legacy schema location

**Status:** accepted

The legacy `core` settings schema is not treated as one global UI authority. System Settings will surface and own only instance identity/branding, domain defaults, language and regional defaults, SEO defaults, and other genuinely cross-cutting behavior. Authentication, messaging, AI, storage/delivery, project source, and Commerce settings move to or remain in their owning Platform Domains, with System Settings limited to status projections and links.

**Consequences**

- The migration must trace each core section to its canonical owner before adding a writable field.
- Duplicate forms and competing persisted values are forbidden.
- Existing `core` records need explicit migration/read compatibility until each owning Domain has adopted its contract, with no silent split-brain source of truth.
