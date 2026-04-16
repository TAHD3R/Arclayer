# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- Introduce the official protocol model registry for `Article / Page / Reusable Section / Category`.
- Establish draft/published model contract revision semantics so draft model changes do not leak into published delivery.

## Non-Goals

- Page version composition snapshot changes
- Route matcher and page resolve redesign
- Admin IA cutover

## Constraints

- Follow `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- Use hard cut semantics for old content-model truth where the new registry becomes authoritative
- Keep failures explicit; do not hide draft/published drift behind fallback logic

## Deliverables

- Official protocol model registry
- Contract-level system/custom field boundary
- Draft/published model contract revision semantics
- Focused backend tests

## Done-When

- [ ] Official model registry is the single source of truth for v1 protocol models
- [ ] Model contract revisions isolate draft vs published reads
- [ ] Focused backend validation passes
