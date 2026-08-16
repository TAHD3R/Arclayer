# Use staged dunning and Payment Restricted access

Arclayer separates Provider Subscription lifecycle from commercial access. A valid `past_due` recovery state enters **Payment Grace** under a configured **Dunning Policy**: new-period Credits are withheld and new metered external-cost effects are blocked, while login, data read, ordinary editing, export, payment recovery, and already-published delivery remain available. Successful recovery restores the same Plan Revision and grants earned period Credits exactly once. Exhausted recovery enters **Payment Restricted** without deleting data, selecting Free, or changing Revision.

## Consequences

The Dunning Policy uses Provider recovery metadata and explicit commercial rules rather than hard-coded grace days. Commerce and Workspace Administration expose lifecycle and access state separately, missing recovery authority remains an explicit operational failure, and effect boundaries must distinguish retained non-metered access from commands that would create new Provider cost.
