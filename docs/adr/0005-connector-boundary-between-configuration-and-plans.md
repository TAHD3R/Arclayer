# Keep Connector configuration global and Plan references local

**Status:** accepted

Commerce Configuration owns Provider and Connector installation/readiness, credentials, webhook setup, supported capabilities, and missing prerequisites. Plan editing may reference only Connector capabilities that are already registered and ready, using them for Entitlements and provider price mappings; it cannot install, remove, or mutate the Connector itself. This preserves the boundary between instance integration readiness and commercial offer terms.

**Consequences**

- A Plan draft can be blocked from publication when a referenced Connector capability or price mapping is unavailable.
- Configuration must expose readiness and supported capabilities in plain language, with technical diagnostics separated from primary copy.
- Plan editors need a capability-aware picker rather than an arbitrary free-text Connector field.
