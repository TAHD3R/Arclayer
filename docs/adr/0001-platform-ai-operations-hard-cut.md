# Coordinate the Platform AI operations hard cut

Arclayer will replace the current AI task, assistant, Skill, policy, usage, and conversation-recovery surfaces through one coordinated database/API/client/UI rollout rather than maintain parallel legacy contracts. Durable backend messages, immutable Agent/Skill versions, one revisioned Platform AI Policy, server-authoritative recovery actions, and Support Access Grant-protected customer content remain canonical because compatibility facades or browser-owned recovery would preserve the failures this rollout is intended to remove.

## Consequences

- Existing data is migrated and backfilled before the generated clients and frontends switch to the new contract.
- Running and historical tasks remain pinned to their recorded Agent, Skill, and policy revisions.
- Superseded fields, local message-success paths, placeholder controls, and compatibility routes are removed in the same rollout.
- Migration, catalog, policy, or projection failures stop visibly; the system does not silently downgrade to free text, a fallback model, or fabricated success.
