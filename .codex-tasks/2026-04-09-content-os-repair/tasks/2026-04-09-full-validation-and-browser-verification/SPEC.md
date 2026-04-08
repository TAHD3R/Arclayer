# Subtask Spec

## Goal

Close the implementation plan with the missing full-check and manual browser verification layer after all code-facing slices are done.

## Scope

- Run `pnpm api:check` and `pnpm admin:check` if feasible.
- Perform manual/browser verification for create, library, writing, structured, recovery, and canvas entry flows if the local environment supports it.
- Keep environment blockers visible if services or browser prerequisites are not available.

## Acceptance

- Full checks are run or explicitly blocked with evidence.
- Browser/manual verification is completed or explicitly blocked with evidence.
- The epic can only close after these outcomes are recorded.

## Validation

- `pnpm api:check`
- `pnpm admin:check`
- Browser verification notes or captured blocker evidence in `PROGRESS.md`
