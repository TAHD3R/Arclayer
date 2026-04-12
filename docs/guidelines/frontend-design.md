# Frontend Design Guideline (Arclayer Admin)

This document defines the live UI and interaction rules for `apps/admin`.
It is the source of truth for page shells, overlay behavior, component defaults, and anti-drift rules.

## 1. Scope

This guideline applies to:

- `apps/admin`
- shared Admin-facing UI surfaces from `packages/ui/*`

It does not define Portal or Studio visual rules.

## 2. Product Personality

Admin UI should feel:

- Clear: users should understand what a screen is for within a few seconds.
- Operational: actions should read like tools, not marketing copy.
- Calm: dense when necessary, but never noisy or decorative for its own sake.
- Consistent: the same action category should look and behave the same across surfaces.

Default writing style:

- sentence case
- short labels
- direct action verbs
- no filler copy

## 3. Page Shell Rules

### 3.1 Default business pages

- Use `DefaultPage` as the default shell for single-surface business pages.
- Keep title, description, header actions, and main content in the standard page hierarchy.
- Do not hand-roll page headers unless the feature genuinely cannot fit the shared shell.

### 3.2 Multi-pane management surfaces

- Use `ColumnsPage` when the page has a persistent side rail, preview pane, or management inspector.
- Keep the side pane meaningful on desktop and reachable through the built-in mobile sheet behavior.
- Do not recreate one-off two-column page shells in feature files.

### 3.3 Loading, empty, and error states

- Every data-driven page must define explicit loading, empty, and error behavior.
- Use `ContentGuard` and shared page-shell patterns instead of bespoke state wrappers.
- Skeletons should resemble the eventual layout closely enough to avoid misleading jumps.

## 4. Overlay and Form Rules

### 4.1 Overlay selection

- Prefer `SettingDialog` for form-oriented overlays and edit flows.
- Use lower-level dialog primitives only when the interaction truly falls outside the shared settings/dialog contract.
- Confirmation flows should stay explicit; do not reintroduce `@arclayer/ui/confirm-dialog` in Admin feature code.

### 4.2 Overlay behavior

- Input-capable overlays must include both `title` and `description`.
- Footer surfaces should keep the shared `bg-card` treatment.
- Cancel actions should stay visually secondary and non-destructive.
- Primary actions must bind `loading` and `disabled` to the real pending state.

### 4.3 Popup interoperability

For Antd popups rendered inside dialog-like overlays:

- Mount popup containers through the shared overlay-aware helpers.
- Keep popup surfaces within the dialog overlay root rather than clipping them inside nested sections.
- Do not break option selection by disabling pointer interaction on the overlay root.

## 5. Component Defaults

### 5.1 Buttons and inputs

- All Antd `Button` usage in Admin must set `autoInsertSpace={false}`.
- Default form controls should optimize for readability first; dense controls belong in toolbars, filters, and technical side panels.
- Avoid inventing one-off input density rules per page. Match the surrounding feature surface.

### 5.2 Loading indicators

- Do not introduce new Antd `Spin` usage in Admin feature UI.
- Use shared `Spinner` or `SpinnerOverlay` for blocking and refresh states.
- Decorative loaders are not a substitute for explicit pending semantics.

### 5.3 Avatars

- Admin avatars are round by default.
- Do not introduce square avatars unless there is explicit product approval for the surface.

### 5.4 Tags

- Tag-like UI must use the shared semantic tag system under `apps/admin/src/components/ui/tags`.
- Do not hand-roll tag pills with local `div` or `span` styling in feature files.
- Do not import Antd `Tag` directly inside Admin feature code.
- If a new tag meaning is needed, add a semantic tag component instead of styling ad hoc at call sites.

## 6. Icons and Motion

- Default to stable `lucide-react` icons or existing shared icons from `@arclayer/ui/icons`.
- Do not import or reference the removed `@arclayer/ui/icons/lucide-animated` barrel.
- Keep motion restrained and state-driven. Small hover or open-state feedback is enough.
- Avoid layering multiple icon motion effects in feature code when the component already communicates state.

## 7. Data Table and Dense Surface Rules

- Shared data-table behavior belongs in the shared table stack, not in page-local reinventions.
- If a backend-supported field is orderable, the corresponding Admin column should expose sorting through shared conventions.
- Sticky table layering must stay locally isolated and must not overlap higher-level app overlays.
- Date and time rendering inside tables should use the shared localization and formatting path.

## 8. Settings Surface Rules

- Settings pages should compose from the shared settings vocabulary: `DefaultPage`, `ChromeTabs`, `SettingPanel`, and `SettingAccordionItem` where appropriate.
- Inline expansion/editing is the default for settings. Use dialogs or sheets only when the workflow is multi-step, spatially large, or risky enough to justify separation.
- Save/reset feedback must be local, explicit, and tied to the action the user just triggered.

## 9. Typography and Token Discipline

- Shared visual tokens belong to `packages/ui/tokens`.
- New authored UI should use semantic typography classes such as `text-body`, `text-footnote`, and `text-caption`.
- Prefer semantic text colors such as `text-label-secondary`; do not add new `text-muted-foreground` usage.
- Do not bypass the token system with app-local one-off typography or color scales unless the deviation is intentional and justified.

## 10. Accessibility and UX Baseline

- Interactive elements must remain keyboard reachable.
- Focus states must stay visible.
- Labels, descriptions, and ARIA attributes must be present when semantics are not obvious from native HTML.
- Error, disabled, and destructive states must communicate intent clearly instead of relying on color alone.

## 11. PR Checklist

- [ ] The page uses the shared page-shell primitives instead of a custom shell without justification.
- [ ] Loading, empty, and error states are explicit.
- [ ] Overlay forms use `SettingDialog` or a justified alternative.
- [ ] Antd `Button` usage keeps `autoInsertSpace={false}`.
- [ ] No new Antd `Spin` usage was introduced in Admin feature UI.
- [ ] Tag-like UI uses the semantic tag system.
- [ ] New icons do not depend on the removed `lucide-animated` barrel.
- [ ] Typography and color usage follow shared semantic tokens.
- [ ] Accessibility basics remain intact for focus, keyboard flow, labels, and destructive confirmations.
