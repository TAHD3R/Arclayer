# Admin Component Guidelines

This code-spec defines Admin component composition, visual language, accessibility, and shared UI usage.

## Scenario: Operational Admin UI Components

### 1. Scope / Trigger

- Trigger: adding or changing Admin components, page shells, dialogs, tables, forms, tags, buttons, or shared Admin-facing UI.
- Applies to `apps/admin` and Admin surfaces from `packages/ui/*`.

### 2. Signatures

- Default page shell: `DefaultPage`
- Multi-pane shell: `ColumnsPage`
- Data state wrapper: `ContentGuard`
- Form overlay: `SettingDialog`
- Settings vocabulary: `ChromeTabs`, `SettingPanel`, `SettingAccordionItem`
- Semantic tag system: `apps/admin/src/components/ui/tags`
- Shared UI primitives: `@arclayer/ui/*`
- Design source of truth: `DESIGN.md`
- Admin design implementation guide: `docs/guidelines/frontend-design.md`
- Icon source: `lucide-react` or `@arclayer/ui/icons`

### 3. Contracts

- Admin UI must feel operational, calm, and consistent; do not build marketing-style or decorative layouts.
- Business pages should use shared page shells instead of hand-rolled headers.
- Components should be written as narrow, typed rendering units. Put feature orchestration in the page/hook layer and keep reusable components focused on props, interaction callbacks, and accessible rendering.
- Prefer composition over boolean-prop proliferation. When variants start combining unrelated behavior, split semantic components or use compound component slots rather than one component with many control flags.
- Component promotion follows real reuse: page-local component -> domain-local shared -> `apps/admin/src/components` -> `packages/ui`. Do not promote merely because a component is large.
- `packages/ui` is for cross-app primitives, tokens, and foundational interactions. Admin-only product components stay in Admin unless another app needs them.
- Design-sensitive components must use existing tokens, semantic typography, radius, borders, motion, and state vocabulary from `DESIGN.md`; do not introduce one-off color scales, decorative cards, or new visual grammar.
- Data-driven pages must define loading, empty, and error states.
- Form overlays should use `SettingDialog` unless the workflow cannot fit the settings/dialog contract.
- Antd `Button` usage must set `autoInsertSpace={false}`.
- Do not introduce new Antd `Spin` usage in Admin feature UI; use shared `Spinner` or `SpinnerOverlay`.
- Tag-like UI must use the semantic tag system; do not import Antd `Tag` directly in feature code.
- New UI should use semantic typography and color tokens.
- Interactive elements must be keyboard reachable with visible focus states.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| New business page | Use `DefaultPage` or justify another shared shell |
| Persistent side pane/inspector | Use `ColumnsPage` |
| Component has unrelated mode flags | Split semantic components or introduce composition slots |
| Component is reused only within one page domain | Keep it page/domain-local |
| Component is needed by unrelated Admin domains | Promote to `apps/admin/src/components` |
| Component is needed outside Admin | Promote to `packages/ui` with package-level exports and tests |
| Data fetch pending/error/empty states exist | Express them through shared state patterns |
| Form-oriented overlay | Use `SettingDialog` with title and description |
| Antd `Button` added | Include `autoInsertSpace={false}` |
| Tag-like status added | Use or extend semantic tag components |
| New icon added | Prefer `lucide-react` or existing shared icon |
| Styling needs a new token/primitive | Verify against `DESIGN.md` and package token ownership before adding it |

### 5. Good/Base/Bad Cases

- Good: settings page composes `DefaultPage`, `ChromeTabs`, `SettingPanel`, and local form sections.
- Good: table row status uses a semantic tag component with accessible text.
- Good: a product-specific workspace picker remains in Admin, while a generic dropdown primitive lives in `packages/ui`.
- Good: a complex panel exposes typed callbacks such as `onSubmit(values)` and receives loading/error props from its parent hook.
- Base: a compact feature-local component stays under `pages/<domain>/<feature>/components`.
- Bad: a page creates a custom floating card shell and oversized hero copy.
- Bad: a feature imports Antd `Tag` and styles a one-off pill.
- Bad: a shared primitive imports Admin route APIs, Admin stores, or page-local constants.

### 6. Tests Required

- Component tests should assert user-visible states and accessible labels.
- Component reuse or promotion requires tests at the new ownership boundary, not only at the old page.
- Visual or Playwright checks are required for design-sensitive changes when a runtime is available.
- Convention tests should cover enforceable Admin UI bans such as new Antd `Spin` or direct Antd `Tag` usage.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Tag color="blue">Published</Tag>
```

#### Correct

```tsx
<ContentStatusTag status="published" />
```

Status presentation belongs to the semantic tag system, not per-feature styling.
