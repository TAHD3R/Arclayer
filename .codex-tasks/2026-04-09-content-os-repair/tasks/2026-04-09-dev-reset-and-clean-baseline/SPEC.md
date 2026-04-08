# Subtask Spec

## Goal

Define and verify the destructive development reset path required by the implementation plan so invalid model-less development data no longer constrains ContentOS behavior, and a clean typed-content baseline is executable locally.

## Scope

- Audit current repo support for clearing or reseeding invalid development content.
- Select one concrete documented reset/reseed path instead of adding runtime compatibility logic.
- Record the exact procedure and verify it can establish a clean typed baseline.

## Acceptance

- A development-only reset or reseed path is documented and executable.
- No runtime compatibility branch is added for invalid development-era content.
- Local verification can start from a clean typed-content baseline.

## Validation

- Documentation or seed/reset path exists on disk and is referenced from task progress.
- If an executable command exists, run the narrowest safe verification and record the outcome.
