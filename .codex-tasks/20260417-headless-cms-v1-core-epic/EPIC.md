# Epic Specification

## Goal

- Deliver the approved Headless CMS v1 core so Arclayer has stable official protocol models, strict page-route-binding-delivery contracts, and a Library-first admin flow.

## Non-Goals

- AI site generation or draft-session architecture
- Fully custom user-defined models
- Dynamic pages backed by list queries or aggregation contexts
- Expression-template binding engines
- Compatibility bridges that preserve the old content-system truth alongside the new core

## Constraints

- Follow `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- Use `docs/plans/2026-04-17-headless-cms-v1-core-implementation-plan.md` as the execution plan
- Execute with hard cut semantics: old entry points, old narratives, and old contracts are removed when the new path is ready
- Keep failures explicit; no silent fallback to legacy content heuristics
- Stop after each major phase and report completed work plus validation evidence

## Risk Assessment

- Model-contract revision semantics can drift from content-version semantics if introduced through page/item code paths instead of a dedicated contract layer
- Route resolve can keep reading legacy path/binding truth if the new matcher and source resolver are not wired at the actual runtime entry
- Admin IA can regress into menu sprawl if `Create`, `Models`, and `Site Builder` are implemented as parallel top-level worlds
- Hard cut execution can expose missing coverage immediately, so focused validation must be added with each phase

## Child Deliverables

- Phase 1: Official model foundations
- Phase 2: Content version and publish semantics
- Phase 3: Route and delivery core
- Phase 4: Perspective and dependency rules
- Phase 5: Admin IA cutover
- Phase 6: Validation and closeout

## Dependency Notes

- Child 2 depends on child 1
- Child 3 depends on child 1;2
- Child 4 depends on child 3
- Child 5 depends on child 1;2;3;4
- Child 6 depends on child 1;2;3;4;5

## Child Task Types

- `single-full`

## Done-When

- [ ] Every row in `SUBTASKS.csv` is `DONE`
- [ ] Focused backend/admin validation passes for the final implemented scope
- [ ] The repo has one content-system truth for the approved v1 core; legacy parallel paths are removed or no longer authoritative
