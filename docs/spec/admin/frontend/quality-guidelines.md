# Admin Quality Guidelines

This code-spec defines frontend quality gates, forbidden patterns, and review checks for Admin.

## Scenario: Admin Quality Gate

### 1. Scope / Trigger

- Trigger: adding or changing Admin pages, routes, components, hooks, stores, API consumers, styling, or user-facing copy.
- Applies to `apps/admin` and Admin-facing shared UI packages.

### 2. Signatures

- Narrow quality gate: `pnpm admin:check`
- Cross-app quality gate: `pnpm check`
- Shared visual source: `DESIGN.md`
- Admin implementation guide: `docs/guidelines/frontend-design.md`
- Convention tests: `apps/admin/test/lib/conventions/**`
- Route/title convention tests: `apps/admin/test/routes/**`
- Component/hook tests: `apps/admin/test/components/**`, `apps/admin/test/hooks/**`

### 3. Contracts

- UI changes must follow `DESIGN.md` and Admin frontend specs.
- User-facing strings should follow the i18n guideline and avoid hardcoded copy where the surrounding surface is localized.
- Route titles must be backed by `staticData.titleKey` and translation keys, not ad hoc `document.title` writes.
- Design-sensitive changes require Playwright or screenshot verification when a runtime is available.
- Component and hook changes should use Vitest + React Testing Library for user-visible behavior, accessible states, route/search parsing, query invalidation, and store behavior.
- Playwright is for browser integration, responsive layout, visual behavior, and runtime-only failures; it does not replace focused component/hook tests.
- Loading, empty, error, disabled, destructive, and permission states must be explicit.
- Do not add silent fallbacks for API errors or missing data; expose the failure state.
- Keep components cohesive; split only when responsibilities diverge or reuse is real.
- Shared package changes require consumer-aware checks. Use `pnpm admin:check` for Admin-only consumers and `pnpm check` when shared packages or API contracts can affect multiple apps.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| UI changes page hierarchy or shell | Verify against `DESIGN.md` and shared shell specs |
| New API consumer | Typecheck generated contract usage |
| New user-facing copy | Add/update i18n keys where required |
| New route page | Add `staticData.titleKey` and satisfy route convention tests |
| Query/mutation behavior changes | Test key composition, pending/error/success, and invalidation |
| Zustand store shape changes | Test selectors, persistence, and reset/migration behavior |
| Runtime verification unavailable | Report blocker and run narrow static checks |
| New convention violation appears | Add/fix convention test |
| Data-driven screen lacks empty/error/loading | Block completion until states are explicit |

### 5. Good/Base/Bad Cases

- Good: a settings page uses shared shells, semantic tags, generated types, and explicit state handling.
- Good: a Playwright check verifies a responsive UI change when a dev server is available.
- Good: React Testing Library asserts the user-visible error state while a hook test asserts the mutation invalidates the affected query key.
- Base: a pure refactor runs `pnpm admin:check` without visual verification because rendered behavior did not change.
- Bad: a page catches API errors and shows stale data as if the save succeeded.
- Bad: a new screen hardcodes English copy in a localized area.
- Bad: a route sets `document.title` in a component effect instead of route metadata.

### 6. Tests Required

- Run `pnpm admin:check` for Admin-only changes.
- Add component or hook tests for non-trivial state transitions.
- Add route tests for `beforeLoad`, redirects, `validateSearch`, and title metadata when route behavior changes.
- Add API mapper tests when generated data is transformed before rendering.
- Use Playwright for layout-sensitive, responsive, or visual-regression-prone work when runtime is available.
- Add convention tests for repeatable architectural or UI bans.

### 7. Review Checklist

- [ ] Route files stay thin and do not own API/data orchestration.
- [ ] API boundary types come from generated OpenAPI packages.
- [ ] Page shells and overlays use shared Admin vocabulary.
- [ ] Loading, empty, error, disabled, and permission states are explicit.
- [ ] Antd `Button` includes `autoInsertSpace={false}`.
- [ ] No new Antd `Spin` or direct Antd `Tag` feature usage.
- [ ] Semantic typography, colors, and tags follow design-system rules.
- [ ] Tests or verification match the changed behavior.

### 8. Wrong vs Correct

#### Wrong

```tsx
try {
  await saveSettings(values)
  toast.success('Saved')
} catch {
  toast.success('Saved')
}
```

#### Correct

```tsx
const mutation = useMutation({
  mutationFn: saveSettings,
  onSuccess: () => toast.success(t('settings.saved')),
  onError: (error) => showApiError(error),
})
```

Failures must stay visible. UI feedback is tied to real mutation state, not a fake success path.
