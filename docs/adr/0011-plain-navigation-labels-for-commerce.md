# Use plain “Plans & billing” navigation labels

**Status:** accepted

The Platform Console will present the Commerce Platform Domain as “Plans & billing” / “套餐与账单” with child pages Subscriptions, Plans, Payments, and Configuration. The internal term Commerce remains in code, permissions, APIs, and documentation; the existing `/billing/...` route segments remain stable for this redesign, while Credits leaves the top-level navigation.

**Consequences**

- Navigation and page copy avoid exposing internal domain names as unexplained product language.
- Route and navigation registries must remove the standalone Credits destination while preserving the Workspace credit entry.
- Monitoring area labels may continue using the established localized “Plans & subscriptions” wording where the context is historical request classification.
