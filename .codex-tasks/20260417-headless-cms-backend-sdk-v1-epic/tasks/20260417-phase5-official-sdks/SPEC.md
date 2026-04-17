# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- Build the formal `@arclayer/management-sdk` package on top of the stabilized OpenAPI contract.
- Build the formal `@arclayer/delivery-sdk` package on top of delivery REST and the query-only GraphQL contract.
- Prove both SDKs through typecheckable examples and smoke tests.

## Non-Goals

- Frontend integration work
- GraphQL mutations
- Non-TypeScript SDKs
- Backward-compatibility shims for old SDK paths

## Constraints

- Follow `docs/superpowers/specs/2026-04-17-headless-cms-backend-sdk-v1-spec.md`
- Follow `docs/plans/2026-04-17-headless-cms-backend-sdk-v1/implementation-plan.md`
- Keep SDK contracts aligned with live repo truth
- Keep delivery REST and GraphQL helpers explicit about `published` and `preview`
- Keep error handling explicit and machine-readable

## Deliverables

- `packages/management-sdk/` with typed client factory, errors, auth helpers, pagination helpers, tests, and examples
- `packages/delivery-sdk/` with REST helpers, GraphQL client, typed document helpers, tests, and examples
- Phase 5 task tracking artifacts

## Done-When

- [ ] `@arclayer/management-sdk` typechecks and its smoke tests pass
- [ ] `@arclayer/delivery-sdk` typechecks and its smoke tests pass
- [ ] Management SDK covers content, models, releases, API keys, and site settings
- [ ] Delivery SDK covers `pages.resolve`, GraphQL execution, perspective helpers, and delivery auth helpers
