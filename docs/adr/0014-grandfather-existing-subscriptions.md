# Grandfather existing Subscriptions

Publishing a new selling **Plan Revision** affects only new checkout and explicit Plan selections. Existing Subscriptions remain bound to their current Revision indefinitely and become **Grandfathered Subscriptions**; neither renewal, Entitlement evaluation, Credit refresh, reconciliation, nor provider-event processing may substitute the latest Revision. A Workspace may explicitly select another Plan, and an authorized Platform Operator may use a preview-driven, idempotent **Subscription Revision Transition** for one Workspace or a defined cohort.

## Consequences

Plan publication cannot silently change existing customer prices, Credits, or Entitlements. Commerce must expose bound Revision and grandfathered state, preserve multiple live Revisions, validate exact Provider Price coverage, and record source, target, actor, reason, timing, customer-notification evidence, per-Subscription result, and audit correlation for every transition. Default timing is governed by ADR-0015.
