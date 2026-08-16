# Separate the Platform Console frontend

Arclayer implements the **Platform Console** as an independent frontend application with its own build artifact and host. The **Product Application** does not contain Platform Console routes, navigation, or page code; shared visual primitives may still be consumed from the repository's canonical UI package. This keeps customer product navigation and bundles free of cross-tenant operations while allowing the Platform Console to adopt an operations-focused application shell without changing the Product Application.
