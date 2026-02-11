# Admin UI Design and Behavior Guideline (CelestialCMS)

This document is the primary UI guideline for `apps/web/admin`.

It defines design philosophy, UX behavior, component selection defaults, layout conventions, and implementation guardrails that should prevent style drift.

## 1. Priority Order (Mandatory)

When rules conflict, apply this order:

1. **Design philosophy and personality** (Section 2)
2. **Page behavior contracts** (Section 5)
3. **Component selection matrix** (Section 4)
4. **Visual tokens and implementation details** (Section 6)

The first item always wins.

## 2. Design Philosophy and Personality (Highest Priority)

Admin interfaces must feel:

- **Perspicuous**: clear, direct, low-friction, no decorative noise.
- **Confident**: guide users with clarity, never with ambiguity.
- **Conversational**: concise human language, sentence case by default.
- **Intelligent**: assume users are capable; avoid patronizing copy.
- **Inclusive**: no exclusionary, discriminatory, or culturally insensitive language.

Design intent:

- Help users complete governance and configuration tasks quickly.
- Reduce cognitive load through predictable page structure and interaction patterns.
- Prefer understandable behavior over cleverness.

## 3. Scope and Applicability

### 3.1 In scope

- `apps/web/admin` UI implementation
- Admin route/page layout behavior
- Admin component choice defaults
- Admin UX/copywriting and interaction consistency

### 3.2 Portal relationship

Portal (`apps/web/portal`) uses a theme/runtime mechanism and is not governed by Admin implementation details in this document.

Portal should still inherit:

- The same design philosophy and personality (Section 2)
- Basic readability and UX quality principles

## 4. Component Selection Matrix (Admin Default)

These are **strong defaults**. They are not absolute bans, but any deviation must include rationale in PR description.

### 4.1 Default to Ant Design v6

Use Antd as the first choice for:

- `Button`
- `Input`
- `Select`
- `Dropdown`
- `Tooltip`
- `Card`
- `Descriptions`

### 4.2 Default to first-party / shadcn-based components

Use self-built or shadcn-based components for:

- `Dialog`
- `Sheet`
- `Accordion`
- `Checkbox`
- `Tabs`
- `Loader` / skeleton loaders

### 4.3 Deviation rule

If a page chooses a non-default implementation:

- Explain **why** default does not fit.
- Explain the UX impact and consistency tradeoff.
- Keep API and style aligned with existing patterns.

### 4.4 Avatar shape rule (Admin)

- Admin `Avatar` components must be round by default.
- Prefer omitting `shape` (Antd default) or using `shape="circle"` explicitly when needed.
- Do not use `shape="square"` in Admin UI.
- Any exception must include product/design approval and a clear rationale in the PR.

## 5. Page Behavior Contracts (Admin)

### 5.1 Page shell contract

Business pages should use `DefaultPage` as the default page container.

Expected outcomes:

- Consistent title/description layout
- Stable page width behavior
- Predictable content hierarchy

### 5.2 Loading/empty/error contract

Every data-driven page must define all key states up front:

- Loading state: explicit skeleton or loader strategy
- Empty state: meaningful, actionable message
- Error state: clear error feedback + retry path

Use `PageState` and project-standard skeleton patterns instead of ad-hoc per-page implementations.

### 5.3 Skeleton quality requirements

Skeletons must:

- Match final layout structure closely enough to avoid visual jump
- Preserve readability and spacing rhythm
- Avoid misleading placeholder patterns unrelated to final content

## 6. Settings Page Rules (Merged from legacy settings guideline)

Settings behavior is governed by this document. The old standalone settings pattern file is deprecated and removed.

### 6.1 Settings layout default

Preferred composition:

- `DefaultPage`
- `ChromeTabs` for high-level groups
- `SettingPanel` for grouped sections
- `SettingAccordionItem` for single-setting edit units

### 6.2 Interaction default

Use inline expand/edit by default.

Use `Dialog`/`Sheet` only when necessary:

- Multi-step workflows
- Large grouped forms
- High-risk confirmations

### 6.3 Saving state convention

- Use React Query for server state.
- Use per-action saving keys (not many scattered booleans).
- Ensure save/reset feedback is local, explicit, and non-ambiguous.

## 7. Design System and Token Discipline

### 7.1 Token hierarchy

Use token layers consistently:

1. Primitive tokens (raw values)
2. Semantic tokens (intent-based)
3. Component tokens (component-level behavior)

Do not bypass token hierarchy with one-off hardcoded values unless justified.

### 7.2 Source of truth

- Shared visual tokens and theme adapters belong to `packages/ui-theme`.
- Avoid app-local redefinition of core tokens.

### 7.3 Naming and consistency

- Prefer semantic names over visual names.
- Keep variant naming stable across components (`default`, `secondary`, `destructive`, etc.).

## 8. UX and Content Quality Guardrails

### 8.1 Interaction clarity

- Destructive actions require explicit confirmation.
- Disabled states must communicate why action is unavailable when possible.
- Toast and inline feedback must be specific and actionable.

### 8.2 Accessibility baseline

- All interactive elements require visible focus states.
- Keyboard navigation must remain usable for primary flows.
- Labels and ARIA attributes must be present when semantic HTML is insufficient.
- Maintain readable contrast and avoid relying on color alone to convey critical meaning.

### 8.3 Copywriting rules

- Follow sentence case.
- Prefer short, direct, task-oriented wording.
- Avoid jargon and meta-phrases (for example “Answer: ...”).

## 9. React Performance and Rendering Guardrails (Admin)

These rules keep UX responsive without sacrificing consistency.

- Avoid request waterfalls when data is independent; fetch in parallel.
- Keep route-level code splitting and lazy loading in place.
- Prevent unnecessary re-renders by using stable dependencies and derived state patterns.
- Prefer moving expensive non-urgent updates to transitions when interaction remains responsive.
- Do not over-optimize at the cost of readability or maintainability.

## 10. Admin UI PR Checklist

A UI PR is acceptable only when all relevant items pass:

- [ ] Design philosophy and personality are preserved in UX and copy.
- [ ] Business page uses `DefaultPage` unless justified.
- [ ] Loading/empty/error states are explicitly implemented with standard patterns.
- [ ] Component choices follow the default matrix, or deviations are explained.
- [ ] Avatar usage is round, and `shape="square"` is not introduced in Admin UI.
- [ ] Settings interactions follow the inline-first model unless overlay is justified.
- [ ] Token usage follows `packages/ui-theme` and avoids style drift.
- [ ] Accessibility baseline (focus, keyboard, labels) is satisfied.
- [ ] Changes do not introduce avoidable waterfalls or obvious render regressions.
