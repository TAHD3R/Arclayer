# Configuration is the Commerce-owned configuration center

**Status:** accepted

The Commerce Configuration surface will own Provider and Connector readiness/configuration, Provider-aware payment recovery policy, and Commerce catalog rules such as currencies, billing cycles, Credit refresh/grant constraints, Entitlement definitions, and price-mapping validation. It will use real persisted Platform API contracts with revisioning and Audit evidence. Platform Capability Catalog and Workspace Capability Rollout remain owned by their domains and appear only as authorized status projections and links; individual Plan terms remain edited on Plans.

**Consequences**

- Missing catalog-rule configuration contracts must be implemented server-side before their UI is presented as writable.
- Configuration sections must distinguish effective value, source, readiness, affected scope, and last confirmed result.
- Provider secrets remain write-only replacement inputs and connection testing remains a separate operation.
