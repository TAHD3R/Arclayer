# Admin UI Design and Behavior Guideline (Arclayer)

This document is the primary UI guideline for `apps/admin`.

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

- `apps/admin` UI implementation
- Admin route/page layout behavior
- Admin component choice defaults
- Admin UX/copywriting and interaction consistency

## 4. Component Selection Matrix (Admin Default)

These are **strong defaults** and guardrails. They are not absolute bans, but any deviation must include rationale in PR description.

### 4.1 Deviation rule

If a page chooses a non-default implementation:

- Explain **why** default does not fit.
- Explain the UX impact and consistency tradeoff.
- Keep API and style aligned with existing patterns.

### 4.2 Avatar shape rule (Admin)

- Admin `Avatar` components must be round by default.
- Prefer omitting `shape` (Antd default) or using `shape="circle"` explicitly when needed.
- Do not use `shape="square"` in Admin UI.
- Any exception must include product/design approval and a clear rationale in the PR.

### 4.3 Overlay consistency rules (Admin, mandatory)

To avoid style drift across settings and management flows, use the following overlay rules:

- Replace `Spin` with `LoaderOne` for loading indicators inside Admin overlays and popovers.
- For form-oriented business overlays, default to `SettingDialog` instead of wiring `Dialog`
  primitives directly in feature files.
- Admin must not use `@arclayer/ui/confirm-dialog`. Prefer explicit `AlertDialog` for confirmations
  and keep footer actions owned by the feature (Antd `Button` + loading/disabled semantics).
- All Antd `Button` usages in Admin must set `autoInsertSpace={false}` to avoid CJK spacing drift.
  This is enforced by `apps/admin/test/lib/conventions/admin-ui-conventions.test.ts`.
- `DialogFooter` and `SheetFooter` must provide a `bg-card` background.
- In overlay footers, cancel actions implemented with Antd `Button` must use `type="text"`.
- Overlay content spacing (Admin dialogs/sheets):
  - The dialog body container should be `grid gap-4` (optionally with `py-2` for rhythm).
  - Each field/setting block inside should be a `grid gap-1.5` group (label + help + control).
- Icon usage in overlay actions:
  - Use Antd `Button` `icon={...}` for icon + text buttons.
  - Do not place icon components directly inside `Button` children.
  - Icon elements should be `aria-hidden="true"`. Icon-only buttons must include an `aria-label`.
- Primary action semantics:
  - Primary/confirm actions should bind `loading` to the pending mutation state.
  - When the action is blocking, disable cancel/close to avoid inconsistent intermediate states.
- Any overlay containing input interactions (for example `Input`, `Select`, `Checkbox`,
  `Form`) must provide both `title` and `description`, aligned with the invite-member
  dialog pattern.
- Antd `Input` (and `Input.Password` / `Input.TextArea`) `size` + `variant` must follow:
  `docs/guidelines/antd-input-guideline.md` (primary flows vs toolbars vs dense/technical).
- Radix `Dialog` + Antd popup interop (mandatory for `Select` / `DatePicker` / dropdown-like controls):
  - In dialog contexts, popup containers must use the shared helper
    `getPopupContainerWithinOverlay` and mount under `[data-overlay-root=dialog]`.
  - Do not mount popup containers under `[data-slot=dialog-content]` for form sections;
    this causes clipping by section/dialog overflow containers and breaks dropdown placement.
  - The dialog overlay root must keep pointer interactions enabled (`pointer-events-auto`);
    otherwise modal pointer-event blocking can make popup options non-clickable.
  - Outside interaction filtering for dialog dismissal must allow Antd popup surfaces
    (for example `.ant-select-dropdown`) so selecting an option does not close/break interaction.

### 4.4 Tag usage rules (Admin, mandatory)

Admin uses many tag-like affordances (roles, statuses, counts, asset metadata). To prevent style drift, Tag UI must be implemented through the shared semantic Tag system.

Rules:

- **Do not** hand-roll "Tag" UI using `div`/`span` + Tailwind in feature files.
- **Do not** import/use Antd `Tag` directly in feature code under `apps/admin/src/**` (only the shared Tag system may use Antd `Tag` internally).
- Use semantic Tag components from `apps/admin/src/components/ui/tags` (import from the module `index.ts`).
- When introducing a new tag type, add a new semantic component under `apps/admin/src/components/ui/tags/**` instead of customizing per-call sites.
- Icon alignment: if a tag includes an icon, render the icon inside the tag content (children) rather than using Antd `Tag`'s `icon` prop. Use `lucide-react` icons via the shared helper (`lucideTagIcon(...)`) for consistent sizing and alignment.
- Base visuals (padding/weight/border) must follow `BaseTag` defaults (`!px-2 !py-1 !font-semibold !border-border`). Avoid per-call overrides unless there is a clear UX rationale.
- Exception: "Uploader info capsule" / uploader chips are not Tags; keep the existing dedicated component and do not convert them into semantic Tags.

### 4.5 Animated icon policy (Admin, mandatory)

Admin shell, navigation, switchers, and account menus must use the shared animated icon barrel instead of per-feature icon motion classes.

Rules:

- Import interactive Lucide icons from `@arclayer/ui/icons/lucide-animated`.
- Do not bulk-install the Lucide Animated catalog. Add icons only when a real UI surface needs them.
- The `@lucide-animated` registry is configured in [apps/admin/components.json]. When an upstream animated icon exists, install it on demand from `apps/admin` with:
  `pnpm dlx shadcn@latest add @lucide-animated/<icon-name> --path ../../packages/ui/shadcn/src/icons/registry`
- If an icon is not available upstream, create a local animated icon under `packages/ui/shadcn/src/icons/` and export it through `packages/ui/shadcn/src/icons/lucide-animated.tsx`.
- Feature code must import from the shared barrel. Do not import raw files from `packages/ui/shadcn/src/icons/registry/**` in app code.
- When an icon becomes animated, remove extra per-feature `group-hover:scale-*`, `translate-*`, and `rotate-*` icon motion classes. Keep stateful motion inside the icon component via props such as `isHovered`, `active`, `expanded`, or `loop`.

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

Use `ContentGuard` and project-standard skeleton patterns instead of ad-hoc per-page implementations.

### 5.3 Skeleton quality requirements

Skeletons must:

- Match final layout structure closely enough to avoid visual jump
- Preserve readability and spacing rhythm
- Avoid misleading placeholder patterns unrelated to final content

### 5.4 Data table sorting contract (Admin, mandatory)

For all Admin data tables using the shared TanStack table stack:

- If a column maps to a backend-supported ordering field, it **must** expose sorting via `meta.sortKey`.
- If backend ordering does not support a field, the column **must not** expose sorting UI.
- Action/selection/operation columns (for example `actions`, checkbox selectors) are non-sortable by default.
- Do not rely on ad-hoc per-page sorting state when shared `DataTablePresenter` sorting behavior is applicable.

### 5.5 Data table date/time formatting contract (Admin, mandatory)

- Date/time text rendered inside Admin data tables must use the shared formatter hook and localization chain.
- Do not use local `new Date(...).toLocaleString()` implementations inside table columns.
- Formatting must follow this fallback order:
  1. Workspace localization
  2. Organization localization
  3. User preference and browser defaults

### 5.6 Table sticky layering contract (Admin, mandatory)

- Sticky table header/cell layering must be contained in a local stacking context.
- Prefer `relative isolate` on the table scroll container instead of increasing global z-index.
- Sticky z-index values must stay minimal and only solve intra-table overlap.
- Sticky cells must not overlap app-level overlays (for example workspace/organization switchers).

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

- Shared visual tokens and theme adapters belong to `packages/ui/tokens`.
- Avoid app-local redefinition of core tokens.

### 7.3 Naming and consistency

- Prefer semantic names over visual names.
- Keep variant naming stable across components (`default`, `secondary`, `destructive`, etc.).

### 7.4 Typography system

#### 7.4.1 Token pipeline

The single source of truth for typography values lives in `packages/ui/tokens/src/tokens.css` (`:root` block).
The pipeline is:

```
tokens.css :root variables
  → tokens.css @theme inline (--text-* registration)
    → Tailwind v4 auto-generates text-<name> utilities
```

Do **not** duplicate typography values in `tailwind.config.ts`, `index.css @layer utilities`, or component-level inline styles.

#### 7.4.2 Semantic typography scale

| Class | Size | Line-height | Letter-spacing | Weight | Typical use |
|---|---|---|---|---|---|
| `text-largetitle` | 34 px | 1.25 | −0.015 em | 700 | Hero headings, onboarding titles |
| `text-title` | 28 px | 1.35 | −0.01 em | 600 | Page titles |
| `text-title2` | 22 px | 1.4 | 0 | 500 | Dialog / sheet titles |
| `text-title3` | 20 px | 1.4 | 0 | 500 | Section headings |
| `text-headline` | 16 px | 1.4 | 0 | 600 | Emphasized body, card headers |
| `text-body` | 16 px | 1.5 | 0 | 400 | Default body text |
| `text-callout` | 15 px | 1.45 | 0.01 em | 400 | Supplementary descriptions |
| `text-footnote` | 14 px | 1.45 | 0.02 em | 400 | Secondary labels, table cells |
| `text-caption` | 13 px | 1.45 | 0.02 em | 400 | Timestamps, badges, shortcuts |

Each semantic class automatically applies font-size, line-height, letter-spacing, and font-weight via `@theme inline`.

#### 7.4.3 Text color classes

| Class | Variable | Use |
|---|---|---|
| `text-label-primary` | `--text-primary` | Primary content text |
| `text-label-secondary` | `--text-secondary` | Descriptions, placeholders, secondary info |
| `text-label-tertiary` | `--text-tertiary` | Disabled or de-emphasized text |
| `text-label-quaternary` | `--text-quaternary` | Watermarks, ghost text |

These classes are generated by `@theme inline` in `tokens.css` via `--color-label-*` registration — the same pipeline as the typography scale. Do **not** redefine them in `index.css` or component-level styles.

**Banned**: `text-muted-foreground` — use `text-label-secondary` instead (they resolve to the same CSS variable).

#### 7.4.4 Font-weight override rules

- Semantic classes carry a default font-weight. If you need a different weight, add an explicit `font-*` class.
- If the explicit `font-*` matches the semantic class default, omit it to reduce noise.
- Example: `text-footnote font-bold` is valid (overrides 400 → 700). `text-title font-semibold` is redundant (title default is already 600).

#### 7.4.5 Migration status

All standard Tailwind size classes (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`+) have been fully migrated to semantic classes. The transitional `fontSize` overrides in `tailwind.config.ts` have been removed.

- **New code must use semantic classes** (`text-body`, `text-footnote`, `text-caption`, etc.).
- **Do not use** standard Tailwind size classes — they no longer carry the design system's typography values.
- **Do not use** `text-muted-foreground` — use `text-label-secondary`.

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
- [ ] Overlay loading indicators use `LoaderOne` (no new `Spin` in Admin feature UI).
- [ ] Form-oriented business dialogs use `SettingDialog` unless a justified exception applies.
- [ ] Overlay footer styling is consistent (`bg-card`), and cancel buttons use Antd `type="text"`.
- [ ] Input-capable overlays provide both title and description (no title-only forms).
- [ ] Avatar usage is round, and `shape="square"` is not introduced in Admin UI.
- [ ] Data table columns that map to backend ordering fields define `meta.sortKey` and expose sorting.
- [ ] Data table date/time text uses the shared formatter chain (workspace -> organization -> user/browser).
- [ ] Sticky table layering is isolated and does not overlap app-level overlays.
- [ ] Settings interactions follow the inline-first model unless overlay is justified.
- [ ] Token usage follows `packages/ui/tokens` and avoids style drift.
- [ ] Tag UI uses the semantic Tag system (`apps/admin/src/components/ui/tags`) and does not reintroduce hand-rolled tag pills or direct Antd `Tag` usage in feature files.
- [ ] Typography uses semantic classes (`text-body`, `text-footnote`, `text-caption`, etc.) — standard Tailwind size classes (`text-xs`, `text-sm`, etc.) are banned.
- [ ] Text color uses `text-label-secondary` — no new `text-muted-foreground` usage.
- [ ] Accessibility baseline (focus, keyboard, labels) is satisfied.
- [ ] Changes do not introduce avoidable waterfalls or obvious render regressions.
