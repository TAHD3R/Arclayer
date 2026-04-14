# API Guard Rate Limit Unification

## Goal

Remove the custom API limiter implementation, standardize API rate limiting on FastAPI Guard, and audit API endpoints so that sensitive routes get explicit route-specific limits while the rest of the API is protected by a moderate global default.

## Scope

- Remove `apps/api/src/platform/limiter/limiter.py` usage and lifecycle wiring.
- Keep a single rate limit backend: FastAPI Guard.
- Use Guard global rate limiting as a baseline.
- Add Guard route-specific rate limits for sensitive or abuse-prone endpoints.
- Audit `apps/api/src/modules/**/router.py` and decide which routes need explicit overrides instead of relying on the global default.
- Update tests and runtime config defaults as needed.

## Non-Goals

- No compatibility wrapper that preserves the custom limiter API.
- No silent fallback back to the old limiter.
- No blanket per-route decoration for every CRUD endpoint if the global default is sufficient.

## Success Criteria

- No runtime path imports or initializes the custom limiter.
- Sensitive endpoints are explicitly rate-limited through Guard route config.
- Guard receives route decorator metadata at request time.
- API checks/tests covering affected auth/system/guard flows pass.

## Risks

- Guard route decorators require correct app/middleware integration; otherwise route-specific limits would be ignored.
- Overly aggressive defaults could throttle normal admin usage.
- Under-scoped route overrides could leave abuse-prone anonymous endpoints on the global default only.
