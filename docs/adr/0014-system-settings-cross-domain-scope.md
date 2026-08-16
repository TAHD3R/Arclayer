# System Settings owns only cross-domain deployment configuration

**Status:** accepted

The new System Settings Platform Domain will manage only deployment-wide configuration without another owning domain, including the Language Catalog, regional/display defaults, instance identity/branding, and other explicitly cross-cutting platform behavior. Commerce, Access & Security, AI services, Site delivery, Messages & feedback, Extensions, Platform Capability Catalog, and Workspace Capability Rollout retain their own configuration and mutation authority; System Settings may link to or project their status but will not duplicate their forms.

**Consequences**

- The System Settings page is a new authenticated Platform surface, distinct from unauthenticated `/setup` and operator account preferences.
- Every setting needs an explicit owner, permission, revision, effective state, and Audit result before it appears as writable.
- Navigation and copy must avoid turning “System Settings” into a catch-all for unrelated domain configuration.
