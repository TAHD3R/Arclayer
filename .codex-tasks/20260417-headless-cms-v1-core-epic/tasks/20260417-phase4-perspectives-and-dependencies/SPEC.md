# Phase 4 Spec: Perspectives And Dependencies

## Goal

Bring `public / preview` perspective rules and dependency availability rules into `pages.resolve` so route resolution follows the published-world boundary, preview fallbacks stay explicit, and missing dependencies surface through formal error contracts.

## Scope

- dynamic route primary record perspective rules
- preview fallback from draft to published
- `content_ref` dependency availability validation in route resolve
- structured warnings for preview fallbacks
- formal API errors for public/preview unavailable dependencies

## Out Of Scope

- Admin IA changes
- model-governance UI
- visual builder editing flows

## Acceptance Boundary

- `public` never reads draft-only primary records or draft-only dependencies
- `preview` prefers draft, falls back to published with diagnostics when fallback happens
- required dependencies with no readable revision fail loudly with the Phase 4 error contracts
