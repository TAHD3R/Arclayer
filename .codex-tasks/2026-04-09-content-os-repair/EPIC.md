# Epic: ContentOS Repair And Surface Unification

## Goal

Execute [docs/plans/2026-04-09-content-os-repair-implementation-plan.md](/home/philip/Arclayer/docs/plans/2026-04-09-content-os-repair-implementation-plan.md) as a repo-truth-first repair of ContentOS across `apps/api` and `apps/admin`.

This epic restores canonical typed-content creation, makes Content Library the single continuation workbench, and converts `writing`, `structured`, `canvas`, and recovery flows into user-facing product surfaces.

## Boundary

- In scope:
  - canonical model truth at content-item creation time
  - bootstrap flow alignment with real content models
  - content library contract/copy/action cleanup
  - resolver and continuation surface repair
  - models control-plane and publish truth alignment
- Out of scope:
  - compatibility branches for legacy model-less development data
  - fallback routing to unrelated editors
  - full canvas builder IDE implementation beyond the first shell slice

## Recovery Context

- Source plan: `docs/plans/2026-04-09-content-os-repair-implementation-plan.md`
- Worktree state at recovery:
  - user confirmed the existing content-related dirty files are in-flight task changes and should be continued
  - `.codex-tasks/` did not exist yet, so taskmaster artifacts are being reconstructed from the plan and current diff
- Current active slice:
  - typed draft creation + bootstrap model selection + initial library entry posture cleanup

## Validation Standard

- No subtask becomes `DONE` without explicit validation.
- Prefer narrow checks while iterating; run broader checks when a slice closes.
- Keep failures visible; no fallback handling for invalid development data.
