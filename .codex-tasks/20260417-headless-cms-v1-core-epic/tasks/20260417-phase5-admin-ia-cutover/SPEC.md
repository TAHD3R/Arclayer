# Phase 5 Spec: Admin IA Cutover

## Goal

Cut the admin content interaction architecture over to the approved `Library-first` model so creation, model governance, and page-building all start from the correct surfaces.

## Scope

- `Content Library` header action opens the official create overlay
- `Models` becomes a protocol-governance surface with canvas-style framing
- `Page` items hand off into `Site Builder`
- `Site Settings` copy and shell stay system-level

## Out Of Scope

- visual builder editing implementation
- new backend content contracts
- custom model creation

## Acceptance Boundary

- `Create` starts from `Content Library` and only exposes the four official protocol types
- `Models` presents protocol governance, locked system contract, extension controls, and impact inspector framing
- `Page` items open the `Site Builder` context instead of a library handoff card
- `Site Settings` copy stays focused on system-level site configuration
