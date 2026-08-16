# Enable only validated language bundles

**Status:** accepted

System Settings may enable only locales present in a server-validated language catalog with complete resource-bundle checks, placeholder/format validation, and explicit flag metadata. Operators cannot publish arbitrary locale codes; adding a new language requires its bundle to pass validation before it becomes selectable.

**Consequences**

- Language Catalog forms use a curated picker and show bundle/readiness status.
- The runtime can distinguish unavailable, disabled, and missing-resource states without pretending an unsupported locale is valid.
- `flag-icons` country/region symbols remain presentation metadata and never define language identity.
