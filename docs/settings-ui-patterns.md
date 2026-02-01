# Settings UI Patterns (Admin)

This document defines the canonical UI patterns for the admin Settings area. The goal is to keep
Settings pages consistent, readable, and easy to extend without accumulating ad-hoc UI flows.

## Goals

- Consistent interaction model across settings pages.
- Clear separation between "display current state" and "edit a single setting".
- Low coupling: each setting item should patch only its own field group.
- Easy to add new setting items without creating a new modal/sheet by default.

## Default Page Layout

- `DefaultPage` for title/description and consistent page width.
- `ChromeTabs` for high-level grouping (e.g. Basics / Policies / Integrations).
- Within each tab, use one or more `SettingPanel` blocks.
- Within a panel, settings should be rendered as a list of items:
  - Use `Accordion` + `SettingAccordionItem` for inline expand/edit.
  - Prefer `SettingAccordionItem` `variant="action"` to match row-style items.

## Canonical Interaction Pattern

### Inline expand/edit (default)

Use inline expand/edit for most settings:

- Each row is clickable and expands in-place.
- The expanded content contains the form inputs for that single setting.
- Each setting item has its own Save/Reset controls.

This matches the pattern used by `SiteSettingsTab.tsx` and the updated
`WorkspaceSettingsView.tsx`.

### Overlay (Sheet/Dialog) (exception)

Use a Sheet/Dialog only when **necessary**:

- Many related fields must be edited together (complex forms).
- Multi-step setup / wizard-like experience.
- High-risk actions requiring a strong confirmation flow.

Implementation rule:

- Prefer **first-party** overlay components in Settings pages.
- Use Ant Design Modal/Drawer only when explicitly requested.

## Saving & Loading Conventions

- Use React Query for server state (`useQuery` / `useMutation`).
- Keep a `savingKey` string state at the page/tab level to:
  - Show per-item loading state.
  - Avoid duplicated boolean flags.
- Use a helper like `withSavingKey(key, fn)` to ensure loading resets even on errors.

## Typography & Sizing Rules (Admin)

- Baseline font size is 16px.
- Avoid `text-xs` / `text-sm` unless justified (density constraints, secondary metadata).
- Avoid `size="small"` for Ant Design components unless justified.

## Copywriting (Voice & Tone)

Follow `docs/design-guideline.md` "Design Philosophy & Personality":

- Confident, conversational, concise.
- Prefer sentence-case.
- Avoid "Answer: ..." or meta-explanations; describe the action directly.
