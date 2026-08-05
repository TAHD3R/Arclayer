# Frontend Design Guideline

This guide turns `DESIGN.md` into implementation practice for the Product Application in `apps/app`, the Platform management console in `apps/platform`, and application-facing primitives in `packages/ui`.

`DESIGN.md` is the visual-language source of truth. Implementation contracts, package boundaries, and approved tools remain in `docs/spec/**`.

## 1. Product Boundaries

- `apps/app` is the customer-facing Product Application. Its UI helps people create, edit, publish, share, configure, and recover their work.
- `apps/platform` is the deployment-wide management console. Its UI helps authorized operators investigate, decide, configure, and resolve operational issues.
- `apps/api` is the server. Frontend copy and structure must not expose its internal modules, routes, providers, jobs, or data shapes unless the user is deliberately viewing diagnostics.
- Product Application components must not be described as Admin components. Administration language is reserved for real workspace or platform administration.

## 2. Page Composition

- Give every page one dominant task and one primary reading axis.
- Use the owning application's shared page shell before creating a local shell. Product Application-only shell names do not apply to Platform unless Platform exports the same contract.
- Every data-driven page defines loading, empty, error, and ready states locally.
- Route-level progress preserves stable application chrome but does not replace page-level state handling.
- Skeletons should match the final macro layout and respect reduced motion. Do not claim a shared skeleton implementation unless both applications actually use it.

## 3. Containers and Hierarchy

- Avoid card-in-card by default.
- Group related content with spacing, headings, dividers, rows, or a single shared surface.
- Nest a bordered or elevated surface only when it represents a distinct object or workflow.
- A nested surface stays one visual level below its parent; do not stack equal borders, shadows, background contrast, or padding frames.
- Do not turn every metric, field group, or empty state into a card.

## 4. Overlays and Forms

- Choose dialog, sheet, popover, or inline editing based on task size and risk, not visual novelty.
- Input-capable overlays include a clear title and description.
- Primary actions bind disabled and loading states to real pending state.
- Cancel remains visually secondary; destructive actions state the consequence explicitly.
- Popup content must remain inside the correct overlay root and stay keyboard reachable.
- Prefer inline editing for small settings; use a separate overlay for multi-step, spatially large, or risky work.

## 5. Components and Dense Surfaces

- Reuse `@arclayer/ui` primitives and semantic tokens before creating application-local primitives.
- Keep product-specific compositions in the owning application until another real consumer justifies promotion.
- Tables use server-supported sorting/filtering, localized date and number formatting, explicit empty/error states, and predictable row actions.
- Loading indicators communicate real work. Decorative spinners, repeated shimmer, and competing progress systems are prohibited.
- Tags and badges represent stable status or type semantics; do not use colorful pills as decoration.
- Use semantic radius, typography, color, and elevation tokens from `packages/ui`; do not add page-local visual scales.

## 6. Icons, Emoji, and Motion

- Use an icon only when it communicates a recognized action, state, object/type, or navigation target.
- Omit an icon when the visible label already communicates the same meaning and the icon adds no scanning value.
- Do not use emoji as product UI icons, status markers, section decoration, or substitutes for illustrations.
- Decorative icons use `aria-hidden`; icon-only controls require an accessible name and a tooltip when discoverability matters.
- A status icon must be paired with text or another non-color cue.
- Use `lucide-react` or reviewed shared icons. Charts go through `@arclayer/ui/chart`.
- Motion explains state or spatial change. Avoid stacked icon effects, bounce in routine tasks, and animation that delays completion.

## 7. Product Copy

- Write for the user's task and next action, not for the implementation.
- Use plain language, short sentences, sentence case, and concrete verbs.
- Put the outcome first, then explain the next step. Keep one clear CTA in each decision area.
- Product Application copy speaks in user goals such as create, edit, publish, share, restore, and configure.
- Platform copy may be denser, but it still describes operator outcomes rather than internal services.
- Do not expose README instructions, component/API/route names, provider internals, raw errors, stack traces, logs, JSON, hashes, revisions, job/run ids, or architecture terms in ordinary product UI.
- If technical detail is necessary, place it in an explicit Details or diagnostics surface and pair it with a plain-language summary and next step.
- Empty states explain what the user can do now. Do not describe roadmap or development progress.
- Errors follow: what happened, whether work was saved or changed, and what the user can do next.
- Keep bilingual terminology aligned. Every new product string uses a stable i18n key with both `zh-CN` and `en-US` resources.

Examples:

- Good: `No projects yet. Create your first project.`
- Good: `We couldn't save this project. Check your connection and try again.`
- Bad: `Failed to execute mutation.`
- Bad: `See README or check logs.`

## 8. Accessibility and Responsive Behavior

- Interactive elements remain keyboard reachable with visible focus.
- Labels, descriptions, and ARIA attributes are present when native semantics are insufficient.
- Error, selected, disabled, and destructive states do not rely on color alone.
- Text and controls meet WCAG 2.2 AA contrast requirements.
- Responsive changes preserve task meaning and action access; they do not blindly stack every desktop region.
- Normal task information remains at least 14px. Smaller text is reserved for secondary technical metadata.

## 9. Review Checklist

- [ ] The page belongs to the correct application: Product Application, Platform management console, or server.
- [ ] The page has one dominant task and explicit loading, empty, error, and ready states.
- [ ] The layout avoids card-in-card and decorative containers.
- [ ] Every icon has action, state, object/type, or navigation meaning; no emoji is used as UI chrome.
- [ ] Product copy uses plain language and gives the user a clear next action.
- [ ] Internal implementation and diagnostics are absent from the primary UI.
- [ ] Shared tokens and primitives are used without inventing a competing visual system.
- [ ] Keyboard, focus, contrast, reduced motion, and narrow layouts are covered.
