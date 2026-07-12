# Admin Product UI Toolchain Contracts

This code-spec defines the canonical component, form, icon, chart, loading, motion, and product-copy stack for `apps/admin`.

## Scenario: Building or changing an Admin product surface

### 1. Scope / Trigger

- Trigger: adding or changing an Admin page, dashboard, form, dialog, loading state, chart, icon, animation, or user-visible copy.
- Applies to `apps/admin` and Admin-facing primitives exported by `packages/ui`.
- `DESIGN.md` remains the visual-language source of truth.

### 2. Canonical stack

| Concern | Canonical implementation |
|---|---|
| Product primitives | Existing `@arclayer/ui/*` exports |
| New generic primitives | shadcn Registry, installed with the repository package runner and reviewed before use |
| Admin-only composition | Domain-local components under `apps/admin/src/pages/**` or `apps/admin/src/components/**` |
| Forms | `react-hook-form` + `zod`, composed with `@arclayer/ui/field`, `form`, `input`, `select`, and settings primitives |
| Icons | `lucide-react` or an existing semantic icon exported by `@arclayer/ui/icons/*` |
| Charts | `@arclayer/ui/chart` backed by Recharts |
| Route skeletons | `boneyard-js` at the shared `RouteTransition` boundary |
| Local loading states | `ContentGuard`, `PageSkeleton`, `Skeleton`, `Spinner`, or `Progress` from `@arclayer/ui` |
| Motion | `motion/react` plus CSS transitions that use the durations in `DESIGN.md` |
| Product copy | i18next keys with both `zh-CN` and `en-US` resources |

Do not add a second icon, chart, form, skeleton, or animation framework when the canonical stack can express the requirement.

### 3. Component and Registry contracts

- Search existing `packages/ui/src` exports before creating a component.
- Use shadcn Registry components only when the primitive is absent. Inspect the Registry item and generated source, preserve repository aliases, replace non-canonical icons, and run the Admin gate after installation.
- Shared primitives must not import Admin routes, stores, API clients, or page-local types.
- Product compositions stay in Admin until they have proven cross-app reuse.
- Form layouts use `FieldGroup`, `Field`, labels, descriptions, and explicit validation states. Do not assemble form semantics from unlabelled styled containers.
- Dialog, sheet, and drawer surfaces require an accessible title and description. Form-oriented flows prefer `SettingDialog`.

### 4. Icon and chart contracts

- Use Lucide icons by direct named import. Icons in buttons use the button component's icon slot/data contract and inherit size from the component.
- Do not introduce icon lookup by arbitrary string or create one-off SVG copies of icons already in the canonical set.
- Charts must be composed through `@arclayer/ui/chart`; feature pages must not import Recharts directly.
- Every chart requires a visible title, a textual summary or accessible description, localized units, a defined empty state, and a non-chart representation when exact values matter (for example a table or metric list).
- Chart colors come from semantic CSS tokens. Do not create page-local raw palettes.

### 5. Boneyard route-skeleton contracts

- `RouteTransition` is the global Boneyard boundary for Admin routes. Its skeleton name must derive from the TanStack route id so dynamic entity identifiers resolve to one stable capture.
- The generated registry is discovered from `apps/admin/src/bones/registry.{ts,js}` during bootstrap. Do not hand-edit generated `*.bones.json` files or the generated registry.
- Use `pnpm -C apps/admin skeletons:build` for a one-time capture and `pnpm -C apps/admin skeletons:watch` while developing skeleton-sensitive routes.
- Authenticated capture must reuse an explicitly authenticated CDP browser or environment-supplied headers/cookies. Never store credentials, tokens, or session cookies in `boneyard.config.json` or source control.
- Captures use the canonical breakpoints `375`, `768`, and `1280` and viewport-based selection because the Admin shell narrows the content container.
- A route without generated bones must render the explicit shared `PageSkeleton` fallback. Capture failures must remain visible in Boneyard CLI output; do not silently replace them with a fake success path.
- Page-local async regions still require explicit `ContentGuard` loading, empty, and error semantics. The route boundary does not replace domain loading states.

### 6. Motion contracts

- Motion communicates state change, hierarchy, or spatial continuity; it is not ambient decoration.
- Routine hover and compact state transitions target `70-150ms`; overlays and route transitions target `150-250ms`.
- Use one entrance treatment per surface. Do not stack page, card, icon, and chart entrance animations for the same event.
- Respect `prefers-reduced-motion` through the shared hook or Motion configuration. Loading feedback and task completion cannot depend on animation.

### 7. Product copy and i18n contracts

- Every new user-visible string must use a stable translation key and ship in both `locales/zh-CN` and `locales/en-US`.
- Copy is sentence case, direct, calm, and action-oriented. Lead with the outcome, use consistent nouns, and avoid hype, filler, or implementation jargon.
- Empty copy explains what is absent and the next useful action. Error copy explains what happened and how to recover without exposing internal details.
- Billing and usage copy distinguishes plan, billing period, granted credits, used credits, reserved credits, available credits, renewal, and cancellation; do not collapse these into the ambiguous word “quota”.
- Dates, amounts, percentages, durations, token counts, and credit counts use the shared locale-aware formatting path.

### 8. Validation matrix

| Change | Required evidence |
|---|---|
| New component or form | Accessible component test and `pnpm admin:check` |
| New chart | Empty/loading/error coverage, localized units, and exact-value accessibility |
| Boneyard integration change | Route-name unit test, Admin typecheck, and one capture run when a runtime is available |
| New copy | Both supported locale resources and no raw product string in the changed surface |
| New motion | Reduced-motion behavior and no blocked interaction |
| Shared `packages/ui` change | Package boundary review plus the cross-app gate when consumers span packages |

### 9. Wrong vs correct

#### Wrong

```tsx
import { LineChart } from "recharts";

<div className="animate-pulse bg-slate-200" />
```

#### Correct

```tsx
import { ChartContainer } from "@arclayer/ui/chart";
import { Skeleton } from "@arclayer/ui/skeleton";
```

Feature code consumes the shared visual contract; it does not bypass it with raw framework primitives.
