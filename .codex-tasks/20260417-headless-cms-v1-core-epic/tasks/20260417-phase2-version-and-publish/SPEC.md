# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- Make `Content Version` and `Page Version` semantics explicit enough for v1 delivery work.
- Lock publish behind a safety gate that rejects broken official-model revisions before they enter the published world.

## Non-Goals

- Route matcher persistence and resolve pipeline redesign
- Preview/public runtime perspective implementation
- Admin IA cutover

## Constraints

- Follow `docs/superpowers/specs/2026-04-17-headless-cms-v1-core-design.md`
- Preserve the current hard cut to official system-managed models
- Keep draft and published semantics explicit; no silent fallback around invalid publish inputs

## Deliverables

- Focused tests for page-version composition snapshot behavior
- Publish safety validation for required system fields and protocol presentation policy
- Explicit publish error contract with machine-readable diagnostics
- Updated Phase 2 task ledger

## Done-When

- [ ] Published versions keep their own page/presentation snapshot after newer drafts are saved
- [ ] Publish rejects invalid official-model revisions with explicit error metadata
- [ ] Focused Phase 2 verification passes
