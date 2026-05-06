# Project Guidance Index

This directory stores **non-spec** project guidance.

Implementation contracts are not maintained here.
Canonical implementation contracts live in `docs/spec/**` and mirror into `.trellis/spec/**`.

## Active Non-Spec Guides

- `agents-guide.md`: long-lived agent behavior and communication norms.
- `code-review-engine.md`: Code Review Engine tool guide and rule catalog.
- `frontend-design.md`: Admin implementation-facing design guide (visual language source remains `DESIGN.md`).

## Pending Domain-Specific Migration Material

These files remain temporarily while their domain contracts are being migrated into `docs/spec/**`:

- `images-api.md`
- `search-integration.md`

## Maintenance Rules

- Add or update implementation contracts in `docs/spec/**`.
- After changing `docs/spec/**`, run:
  - `pnpm spec:sync`
  - `pnpm spec:check`
- Keep `.trellis/spec/**` generated-only; do not edit it manually.
