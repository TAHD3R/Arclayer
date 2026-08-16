# Use Commerce as the commercial operations control plane

Arclayer uses one **Commerce Platform Domain** for cross-Workspace commercial operations: Plan catalog management, Subscription investigation, provider and billing-event operations, configuration readiness, and audited Subscription or Credit corrections. Workspace Administration retains member-facing plan selection, checkout, portal access, Credits, and Usage; tenant directories retain commercial projections and exact deep links only. This avoids both a configuration-only page that cannot resolve commercial incidents and a duplicated Workspace billing center that creates competing workflows.

## Consequences

Commercial configuration leaves the global Settings route, and commercial mutation forms leave tenant-directory surfaces. Commerce emits actionable failures to the Operations Inbox while historical revenue, conversion, cost, and usage analysis remains in Observability.
