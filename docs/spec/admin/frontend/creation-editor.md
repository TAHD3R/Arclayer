# Admin Creation Editor Contracts

**Status:** Approved target code-spec; implementation activates only through the rollout gates in the shared platform contract.

**Applies to:** `apps/admin`, Admin-facing primitives in `packages/ui`, generated Admin API clients, editor route tests, visual fixtures, and Boneyard capture fixtures.

**Canonical sources:**

- `docs/spec/shared/ai-website-builder-platform.md` owns the cross-layer aggregate, persistence, Agent, publishing, migration, and rollout contracts.
- `DESIGN.md` owns the visual language, typography, color, elevation, motion, responsive, and accessibility principles.
- `docs/spec/admin/frontend/product-ui-toolchain.md` owns the Admin component, form, icon, motion, i18n, and Boneyard stack.

This document specializes those sources for the full-screen creation editor. It must not redefine backend ownership. If a frontend behavior depends on a backend contract that has not passed its rollout gate, the UI exposes that capability as unavailable; it never invents data, a revision, a completed Agent result, or a successful mutation.

## Scenario: Full-screen AI creation editor

### 1. Scope / Trigger

- Trigger: adding, replacing, or changing `/projects/{projectId}/editor`, its scene routing, any of its four creation stages, its canvas, its Agent panel, or an editor-specific loading/error/interaction state.
- The canonical route is `/projects/{projectId}/editor`, with an optional trailing slash and typed query state defined in section 6.
- Other `/projects/{projectId}/**` routes remain project-management surfaces in the Admin shell.
- The editor is an authoring tool for `builder_managed` projects and a truthful compatibility/migration surface for `source_managed` or `migration_required` projects.
- Wave 0 may add contracts, protocol spikes, and regression fixtures. The production route hard cut occurs in Wave 2 only after the Builder, revision, ChangeSet, permission, and durable-job contracts are available. Wireframe, Style Guide, and Design mutations activate with Wave 3.

The target outcome is a single, version-aware creation workspace in which a user can move from Sitemap through Wireframe, Style Guide, and Design, collaborate with Agents, review typed changes, preview, and publish through canonical services.

The editor is not:

- a read-only dashboard, source-file browser, or iframe around the current project runtime;
- a second CMS, page hierarchy, release service, or design-token truth;
- a chat demo that treats generated text as an applied change;
- a source editor for `builder_managed` projects;
- an export-only design handoff;
- a desktop-only surface that hides authoring capability at narrow widths.

### 2. Route, scene, and access contract

#### 2.1 Dedicated scene ownership

The route owns an independent scene named `creation-editor`.

```ts
type SceneKey = "auth" | "invite" | "global" | "creation-editor" | "admin";
```

The scene registry must resolve `creation-editor` before the `admin` fallback. Its predicate matches exactly three non-empty path segments—`projects`, a project identifier, and `editor`—after removing one optional trailing slash. It must not use an unanchored substring or prefix check.

| Path | Expected scene |
|---|---|
| `/projects/project-id/editor` | `creation-editor` |
| `/projects/project-id/editor/` | `creation-editor` |
| `/projects/project-id` | `admin` |
| `/projects/project-id/content/library` | `admin` |
| `/projects/project-id/editorial` | `admin` |
| `/projects/project-id/editor/history` | not matched unless a child route is explicitly specified later |
| `/projects//editor` | not matched |
| `/projects/project-id/editor-other` | not matched |

The scene renders a minimal `CreationEditorSceneLayout` and the route outlet. It must not render `AdminLayout`, the Admin sidebar, the Admin topbar, `DefaultPage`, or a nested management-page header. Authentication, global error handling, theme, locale, notifications, and other application-wide providers remain available without reintroducing Admin chrome.

The route module at `apps/admin/src/routes/projects/$projectId/editor/index.lazy.tsx` loads the new creation editor entry. A route-level loader may prefetch access and lightweight Builder bootstrap data, but it must not make the root route wait for the full canvas graph, Agent history, preview artifact, or every inspector dependency.

#### 2.2 Access and capability resolution

Before mounting editable controls, the route resolves a real backend bootstrap response containing, at minimum:

- project/site identity and current user permissions;
- `ProjectAuthoringMode` and migration readiness;
- the current `SiteRevisionManifest` reference, manifest ETag, and `SiteRevisionStatus` projection when a baseline exists;
- stage availability/readiness and active durable jobs;
- preview, share, and publish capabilities;
- Agent/thread/runtime capability and reconnect metadata;
- locale and assigned Design System references required for the first stage render.

The frontend does not infer authoring mode from the presence of source files, content records, routes, or an old editor response. An ambiguous project renders the server-owned `migration_required` state and a management/migration action. It must not create a client-only baseline revision.

Access outcomes are distinct:

| Outcome | Required UI |
|---|---|
| Unauthenticated | Existing authentication redirect contract with a safe return target. |
| Project not found or not visible | Existing not-found contract; do not reveal whether another tenant owns the identifier. |
| View-only access | Canvas and history remain readable; all write controls explain the missing permission. |
| `builder_managed` and ready | Enable only the stages/actions supported by the bootstrap capabilities. |
| `source_managed` | Show the compatibility report and approval-gated migration entry; do not claim visual round-trip editing. |
| `migration_required` | Show the recorded decision requirement and block authoring; do not guess a mode. |
| Tenant migration not ready | Show explicit service-unavailable state with correlation ID; do not fall back to the legacy editor. |

### 3. Editor shell and visual hierarchy

#### 3.1 Stable shell anatomy

`CreationEditorShell` owns the following landmarks. Stable shell regions remain mounted while stage data changes.

| Region | Landmark and responsibility |
|---|---|
| Top editor bar | `header`; back to project management, project identity, revision/sync state, stage navigation, preview, share, and publish/readiness action. |
| Stage switcher | labelled `nav`; Sitemap, Wireframe, Style Guide, and Design in workflow order with status text that is not color-only. |
| Tool rail | labelled `nav` or toolbar; brief/generate, add, history, comments, and stage-specific tools. |
| Canvas work region | `main`; infinite viewport plus the active stage scene and its accessible non-spatial representation. |
| Inspector | labelled `aside`; selection properties, bindings, validation, responsive controls, and contextual actions. |
| Agent panel | labelled complementary region; assistant-ui thread, run state, Tool UI, approvals, and composer. |
| Bottom controls | toolbar; breadcrumb/minimap, viewport/device mode where relevant, zoom, fit, undo/redo, and revision indicator. |

The shell uses the actual tool layout rather than wrapping every region in a rounded card. Structural borders separate major regions; floating elevation is reserved for menus, popovers, sheets, and transient command UI. The canvas is white in light mode and true black/charcoal in dark mode. Action Blue is reserved for actions, focus, selection, progress, and links—not ambient panel tinting.

Poppins is limited to project/stage hierarchy and substantial empty/error state headings. Figtree owns controls, menus, canvas metadata, inspector fields, Agent messages, and dense work. Selection remains precise and legible in both themes and never relies on a large translucent blue wash.

#### 3.2 First paint and information priority

The first usable paint exposes:

- project identity and a working back action;
- active stage and available stage navigation;
- revision/sync or migration state;
- a stable canvas work region;
- the primary create/generate/edit entry permitted for the current state;
- preview and publish readiness truth.

Page tree, inspector, Agent history, comments, diagnostics, and advanced component metadata may progressively load. Their absence must not shift the stable shell or block basic navigation.

#### 3.3 Panel behavior

- Inspector and Agent panel are independently collapsible on desktop but do not overlap the active canvas unless deliberately floated by the user.
- Opening one panel preserves canvas selection and viewport.
- The Agent panel may be docked, collapsed, or opened as a sheet. Dock preference is transient user preference, not revision data.
- A panel resize uses a bounded, keyboard-accessible separator and stores only a local preference. It must not change canonical layout data.
- The editor restores focus to the invoking control when a panel, sheet, popover, or dialog closes.

### 4. Four-stage scene ownership

The stages are projections of one revision aggregate. They do not keep four independent copies of pages, sections, content, tokens, or bindings.

| Stage | Canonical projection | Primary canvas object | Mutations |
|---|---|---|---|
| Sitemap | `ContentStructureRevision` plus immutable Builder brief/section-intent documents referenced by `SiteRevisionManifest` | Site, group, page, navigation relationship, section intent | Typed route/hierarchy/planning commands and candidate `ChangeSet`s |
| Wireframe | `ContentPresentationKind.WIREFRAME` tied to exact content versions | Page frame, section intent, component instance, slot, global-section reference | Typed presentation/content-version commands and candidate `ChangeSet`s |
| Style Guide | Pinned immutable `DesignSystemVersion` | Concept, token role, typography role, color scheme, component recipe, motion token, asset direction | Compare/accept/fork/supersede commands that create immutable versions |
| Design | Existing `VISUAL_BLUEPRINT`, component bindings, slot mappings, SEO, responsive and interaction rules tied to exact content versions | Rendered page/section/component/state/binding | Typed presentation, binding, content-version, preview, readiness, and release commands |

#### 4.1 Sitemap scene

Sitemap owns site intent and structure planning. It provides:

- brief, audience, goals, locale, page-count intent, import intent, selected Knowledge, and selected Design System context;
- page groups, pages, global sections, navigation relationships, paths, page purpose, ordered section intents, and section prompts;
- compareable AI alternatives represented as server-authored candidate `ChangeSet`s;
- manual add, rename, move, duplicate, group, and delete commands;
- route uniqueness, reserved-path, locale, hierarchy, and downstream-impact validation;
- a synchronized accessible tree/list view that can perform the same core operations as spatial nodes.

Move and delete previews enumerate affected Wireframes, content bindings, global references, SEO, and published routes. The scene never removes downstream data from a local graph and later reports success.

#### 4.2 Wireframe scene

Wireframe owns structural composition before visual styling. It provides:

- one-to-one traceability from every visible section to its section intent and component instance;
- component variant replacement while preserving compatible copy and bindings;
- reorder, duplicate, global-section reference, inline content draft, and AI rewrite operations;
- desktop, tablet, and mobile structural views with viewport-scoped comments and findings;
- explicit missing-content, media, and binding placeholders that cannot be mistaken for publishable content;
- validation for missing required slots, incompatible variants, invalid bindings, and global-reference cycles.

Changing a Sitemap section or Wireframe component dispatches a command against the same base revision. The frontend must not synchronize two client-authored documents after the fact.

#### 4.3 Style Guide scene

Style Guide owns a candidate or accepted immutable `DesignSystemVersion`. It provides:

- visual concepts derived from the site brief and assigned Workspace Design System;
- primitive, semantic, and component token layers;
- typography roles, color schemes, spacing, radius, border, elevation, imagery, recipes, and motion tokens;
- real light/dark theme coverage status; an inversion preview is not labelled as a completed dark theme;
- section-scheme assignment with contrast findings;
- generated-asset provenance, rights/source metadata, focal point, crop, and alt-text review;
- compare, accept, fork, and supersede actions with version provenance.

Editing a workspace-owned version from a project always creates a project-owned fork. The UI never mutates the workspace version in place.

#### 4.4 Design scene

Design resolves the publishable page experience. It provides:

- component properties, layout constraints, variants, content/model bindings, and localization previews;
- responsive and breakpoint-specific behavior;
- image generate/replace, crop/focal point, provenance, and alt text;
- SEO, Open Graph, and structured-data review;
- semantics, focus order, contrast, reduced-motion, overflow, and automated accessibility findings;
- default, hover, focus, active, loading, empty, error, and content-overflow state previews;
- preview build, visual diff, readiness findings, release creation, and rollback entry points.

A Design canvas preview is not proof of publishability. Preview and publish controls reflect actual build/readiness/release results and retain the active last-known-good release on candidate failure.

### 5. Server, route, and transient state ownership

#### 5.1 Ownership matrix

| State | Owner | Persistence rule |
|---|---|---|
| `SiteRevisionManifest`, manifest ETag, `SiteRevisionStatus` | Backend | Read through generated clients; never copied into a writable client document store. |
| Content, structure, presentation, bindings, Design System versions | Canonical backend domains | Mutated only through typed commands/`ChangeSet`s. |
| ChangeSet, command outcome, generation/build/publish job, Agent run | Backend | Durable and recoverable after refresh; terminal status comes from the server. |
| Active release and published relationship | Canonical release service | Never derived from a local “published” flag. |
| Viewport transform, hover, marquee, drag preview, open panels | Editor transient store | In-memory; optionally local preference only where stated. |
| Current committed selection | Editor transient store plus optional safe URL projection | IDs only; reconciled against the active revision. |
| Unsent Agent composer/form draft | Browser draft storage | May survive refresh/offline; contains no secret or server success state. |
| Stage and safe shareable selection | Typed URL search state | Validated and normalized; invalid values fall back visibly to a valid stage, not to a mutation. |
| Panel width, dock/collapse, last device preview | Local user preference | Namespaced by user and surface; never stored in the revision. |

The transient editor store must not contain a mutable clone of the full page graph. Server-query caches store server snapshots; the editor store stores interaction state and stable references into those snapshots.

#### 5.2 Typed state model

The frontend state has discriminated identities rather than arbitrary JSON:

```ts
type EditorStage = "sitemap" | "wireframe" | "style-guide" | "design";

type EditorSelection =
  | { readonly kind: "site"; readonly id: string }
  | { readonly kind: "page-group"; readonly id: string }
  | { readonly kind: "page"; readonly id: string }
  | { readonly kind: "section-intent"; readonly id: string; readonly pageId: string }
  | { readonly kind: "component-instance"; readonly id: string; readonly pageId: string }
  | { readonly kind: "design-token"; readonly id: string; readonly versionId: string }
  | { readonly kind: "binding"; readonly id: string; readonly componentId: string };

type EditorViewport = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;
```

The exact identifier types come from generated domain clients when available; the example above documents the required discriminants, not permission to replace branded public-ID types with unvalidated strings.

Selection rules:

- a selection belongs to one project, revision projection, and stage;
- multi-selection contains compatible selectable objects only and has a deterministic anchor;
- switching stage maps a selection only when the server projection exposes a stable relationship; otherwise the target scene opens at its stage root and announces the change;
- refreshing with a stale or deleted selection keeps the stage and shows a localized “selection is no longer available” status;
- server refresh preserves selection and viewport when referenced objects still exist;
- a pending write does not make a temporary client identifier shareable.

#### 5.3 URL state

The route search schema may contain:

- `stage`: one of the four `EditorStage` values;
- `revision`: a readable revision reference when the user has permission;
- `selectionKind` and `selectionId`: only for stable, non-sensitive, shareable objects;
- `viewport` or device preview only when a product decision explicitly makes it shareable and the value is bounded/validated.

Prompts, generated copy, Tool arguments, approval tokens, preview tokens, private asset URLs, Agent messages, and unsaved form values never enter the URL. Opening a shared revision does not silently switch the current editable revision or apply a command.

### 6. Canvas, selection, and command contract

#### 6.1 Canvas viewport

- Pan and zoom operate on compositor-friendly transforms. They must not animate `width`, `height`, `top`, or `left` across the graph.
- Off-viewport spatial nodes and expensive previews are culled or virtualized while their accessible tree/list representation remains coherent.
- Pointer movement is coalesced to an animation frame. A network request is never sent for each pointer event.
- Drag, resize, reorder, and marquee interactions render a transient preview and commit one typed command at the interaction boundary.
- Zoom controls expose current percentage, Fit, and reset behavior. Canvas zoom never disables or intercepts browser page zoom shortcuts.
- The viewport preserves the logical focus/selection after server reconciliation and announces if a command removes the selected object.
- Automatic graph layout and heavy validation move off the main interaction path only when measurement demonstrates benefit. A worker is not added speculatively.

#### 6.2 Command envelope

Every server mutation originates from a typed generated-client command or a typed `ChangeSet` application. The UI command dispatcher carries the shared contract fields:

```ts
type EditorCommandContext = Readonly<{
  projectId: string;
  siteRevisionId: string;
  baseRevisionId: string;
  baseEtag: string;
  idempotencyKey: string;
  stage: EditorStage;
  selection: readonly EditorSelection[];
}>;
```

This type is a frontend context shape, not a substitute for backend request schemas. Tool-generated and human-generated writes use the same command services.

Command lifecycle:

1. Validate the current capability, permission, base revision, and form/interaction input.
2. For impact-bearing operations, request a server preview and display affected objects, warnings, blockers, approvals, and signed `previewToken`.
3. Send one command with a fresh idempotency key and exact base revision/ETag.
4. Keep a visible pending state scoped to the affected object without blocking unrelated reading/navigation.
5. Reconcile from the canonical command outcome/new revision; do not manufacture the resulting graph in the browser.
6. On conflict, retain the user's intent and require explicit re-preview against the new base or deliberate discard.

Optimistic presentation is allowed only for reversible, low-risk interaction feedback such as a drag preview, expanded tree row, or selection. A new page, deleted object, accepted AI change, published release, or completed job is never declared successful before the server result.

#### 6.3 Undo and redo

- Undo/redo acts on the server-recognized editable command history for the current draft revision and on local uncommitted interaction state where applicable.
- It never rewinds the active published release, bypasses an approval, mutates a superseded revision, or applies an inverse against a stale base.
- The controls show the localized next operation when known and explain why an operation is unavailable.
- A command created by an Agent retains Agent/run/Tool provenance when undone or redone.
- When history becomes stale because another actor advances the revision, undo/redo enters the same explicit conflict/re-preview path as any other write.

#### 6.4 Conflict and collaboration

The conflict surface shows:

- the base revision used by the pending command;
- the current revision and actor/provenance summary;
- the affected objects and whether the user's intent can be previewed again;
- actions for re-preview, inspect current, copy safe draft text where applicable, or discard.

The browser does not silently rebase, last-write-wins, replay offline writes, or merge opaque JSON. Presence indicators and remote selections are optional collaboration projections; they do not replace concurrency control.

### 7. Agent panel and assistant-ui runtime adapter

#### 7.1 Responsibility boundary

The editor mounts its Agent experience inside `AssistantRuntimeProvider` and composes assistant-ui Thread, Message, Composer, Action, Tool, approval, and nested-message primitives. assistant-ui is the UI/runtime adapter. The backend owns Agent selection validation, orchestration, delegation, Tool permissions, approvals, persistence, recovery, usage, and terminal outcomes.

The browser must not:

- call multiple mentioned Agents independently;
- treat an `@Agent` text span as authorization;
- apply model output directly to the canvas;
- persist the authoritative message history in Zustand/local storage;
- invent a custom approval message-part type;
- surface delegated specialists as duplicate top-level threads;
- infer successful completion from a closed stream.

#### 7.2 Runtime adapter boundary

The Admin implementation isolates protocol and assistant-ui APIs behind an Arclayer adapter with responsibilities equivalent to:

```ts
interface CreationEditorAgentAdapter {
  readonly runtime: AssistantRuntime;
  initializeThread(input: InitializeEditorThreadInput): Promise<ThreadIdentity>;
  send(input: EditorRunEnvelope): Promise<void>;
  cancel(runId: string): Promise<void>;
  reconnect(input: RunReconnectCursor): Promise<void>;
  respondToApproval(input: ApprovalResponse): Promise<void>;
}
```

Concrete wire types come from the selected Wave 0 protocol spike and generated clients. Backend domain packages must not import React or assistant-ui types. New Tool renderers use the current Toolkit API (`defineToolkit`, render-only external Tools, and the current `Tools` equivalent); deprecated `makeAssistantTool*` and `useAssistantTool*` APIs are not target architecture.

The thread list, when exposed from the panel, uses the backend-owned remote thread-list adapter for initialize, list, pagination, rename, archive, unarchive, delete, and metadata. Failed pagination or reconnect remains an explicit error; stale cached results are not presented as a successful refresh.

#### 7.3 Editor context snapshot

Each send envelope carries stable IDs and an immutable context snapshot request containing:

- workspace, project, and site revision IDs;
- active stage and current stable selection IDs;
- active viewport/device intent where relevant, without raw canvas pixels;
- lead Agent ID, structured mentioned Agent IDs, and `ExecutionMode` (`plan | build`);
- explicit referenced Knowledge, Skill, asset, content, or design-system IDs;
- thread ID and idempotency key.

The server validates and persists the resolved Agent/Skill versions, permissions, grants, selected objects, revision, and other run context. A later selection change does not retroactively change an in-flight run.

Agent identity is independent of execution mode. The UI renders one Plan/Build control and one lead-Agent identity. It does not reintroduce an `agent` third mode or the ambiguous “smart project assistant” mode.

#### 7.4 Mentions, launch, and delegation

- The Agent launcher shows assigned, available Agents with avatar, name, role summary, capability summary, and availability; avatar-only controls have accessible names.
- `@Agent` suggestions are keyboard navigable, filtered by real assignments, and implemented behind an Arclayer mention adapter because upstream mention APIs may be unstable.
- The visible mention token maps to a deterministic Agent ID in the send envelope. The server decides direct routing or orchestration.
- Specialist progress and messages render read-only inside the parent delegation Tool call through nested `messages`.
- Public trace displays declared task, Tool calls, evidence, output, approval, progress, and terminal error—not hidden chain-of-thought.

#### 7.5 Tool, approval, and ChangeSet UI

Tool renderers cover `running`, `requires-action`, `complete`, and `incomplete/error` states. A write-capable result links to or renders the server `ChangeSet` preview; it never modifies editor state from arbitrary Tool output.

Approval is metadata on the Tool call and includes action, scope, affected count/objects, side-effect class, data-egress disclosure where relevant, preview/diff, expiry, and available decisions. “Always allow” is shown only when the backend returns an eligible scoped policy choice; the frontend does not persist authority in assistant-ui state.

Plan mode cannot expose apply, publish, destructive, install, or external-write success actions. Build mode still respects Tool grants, user permissions, workspace policy, entitlement, Connector state, and server approval.

#### 7.6 Run lifecycle and unavailable capability

The panel supports:

- thread initialization before the first message;
- queued, running, waiting-for-tool, waiting-for-approval, reconnecting, cancelled, failed, and completed run states;
- explicit Stop while the server accepts cancellation;
- durable refresh/reconnect using the selected cursor/replay contract;
- terminal error with correlation ID and recoverable actions;
- partial outputs that remain visibly partial and never become a completed assistant message by inference.

If the backend protocol, Agent assignment, Tool renderer, reconnect contract, or required capability is unavailable, the composer/action is disabled with a localized reason and management link where appropriate. Development fixtures may simulate events only inside tests and Boneyard capture. Production code must not return templated generation, `(mock) ok`, a fake canvas node, or a fake successful Tool result.

### 8. Responsive and navigation contract

All core editor functions remain reachable at repository breakpoints.

| Viewport intent | Required composition |
|---|---|
| Desktop / wide desktop | Top bar, compact tool rail, canvas, optional inspector, dockable Agent panel, and bottom controls. Width is used for hierarchy, not decorative whitespace. |
| Tablet | Stable top bar and canvas, compact rail or bottom tool access, with either inspector or Agent/page-tree sheet open at a time. |
| Mobile | Canvas remains selectable/editable. Stage switcher, tools, page tree, inspector, and Agent panel are reachable through labelled controls and one modal sheet at a time. |

Narrow-screen rules:

- The back action, project identity, sync state, stage navigation, preview/readiness, and a single overflow entry remain visible or directly reachable.
- The stage switcher may scroll horizontally or use an accessible picker; it must not disappear behind `hidden lg:flex` with no replacement.
- Sheets have accessible title/description, focus trap, close action, focus restoration, and safe-area padding.
- Opening a sheet preserves canvas transform, selection, unsent Agent draft, and pending server state.
- Touch targets are at least `44px` in both dimensions where the control is touch-operated. Composer/form inputs render at `16px` or larger to avoid mobile browser zoom.
- The shell respects dynamic viewport units and safe-area insets. Browser chrome or the on-screen keyboard must not permanently cover Composer, publish confirmation, or bottom controls.
- No accidental page-level horizontal scrolling is permitted. Horizontal movement within the canvas and stage switcher is deliberate and locally contained.
- Orientation change recomputes available workspace without resetting the active stage or server command.

### 9. Keyboard and accessibility contract

#### 9.1 Navigation and focus

- Provide “Skip to canvas” and “Skip to Agent panel” links when those regions are available.
- Every icon-only action has an accessible name and, where ambiguity remains, a tooltip that is not the sole label.
- Canvas objects expose keyboard focus through a synchronized tree/list or a documented composite-widget pattern. A pointer-only SVG/canvas hit target is insufficient.
- `Tab` moves through shell landmarks and active controls; arrow keys move within tree, listbox, tab, toolbar, or canvas composites according to their ARIA pattern.
- `Enter`/`Space` activates the focused object or action. Delete/Backspace opens the appropriate impact/approval flow and never performs an unannounced destructive mutation.
- `Escape` first cancels an active drag/resize or closes the deepest transient overlay, then restores focus. It does not discard a committed selection, unsent draft, or accepted command.
- Focus remains visible on white, black, selected, and disabled-adjacent surfaces using the shared focus-ring tokens.
- Selection uses outline/shape/icon/text in addition to Action Blue.
- Dialogs and sheets restore focus to the invoker. A route-level fatal error moves focus to its error heading.

#### 9.2 Shortcut policy

The editor publishes a localized shortcut reference. Shortcuts execute only when their region owns focus and do not override text editing, IME composition, screen-reader commands, or browser zoom/navigation.

| Intent | Default behavior |
|---|---|
| Undo/redo | `Mod+Z` / `Mod+Shift+Z` when focus is not in an editable control; dispatch server-aware history actions. |
| Pan | Space plus pointer while the canvas owns focus; Space alone still activates focused buttons/tree items. |
| Canvas zoom | Unmodified `+`/`-` or explicit controls while canvas owns focus; never intercept `Mod++`, `Mod+-`, or browser page zoom. |
| Fit/reset view | Discoverable shortcut plus visible toolbar action; the visible action is required. |
| Cancel transient action | `Escape` following the focus-layer rule above. |
| Open shortcut help | A visible help/menu entry and a non-conflicting shortcut such as `?`. |

#### 9.3 Announcements and alternatives

- A polite live region announces selection changes, command completion, durable job phase/progress, connection loss/recovery, and non-blocking validation changes.
- An assertive alert is reserved for a blocking conflict, lost permission, failed destructive/publish action, or route-fatal error.
- Sitemap always has an accessible tree/list alternative. Wireframe and Design expose semantic page/section/component outlines and inspector forms for operations that cannot be meaningfully manipulated spatially.
- Minimap, color swatches, charts, and spatial relationships include text equivalents. Exact values remain available without interpreting graphics.
- Automated accessibility findings identify the affected object, rule, severity, evidence, and repair action; severity is not color-only.
- Reduced-motion mode preserves all information through immediate state/opacity replacement and solid loading bones.

### 10. Product state matrix

Every state below is implemented and tested independently of the route skeleton.

| State | Required behavior |
|---|---|
| Initial loading | Stable editor chrome remains real. The named canvas/work boundary mirrors only macro layout after the anti-flash delay. |
| First run / blank | Product brief form, import option, useful example intent, Knowledge/Design System selection, and one clear create action. No generic empty card grid. |
| Generation queued | Durable job identity, queue state, cancel request, and permission to leave/reconnect. |
| Generation running | Page/section phase progress, progressively materialized real nodes, cancel action, and explicit run/job provenance. |
| Partial result | Successful pages/sections remain usable; each failure has scoped evidence and retry/re-preview where supported. |
| Cancel requested/cancelled | Distinguish accepted request from terminal cancellation and retain completed partial work according to the job contract. |
| Change review | Human-readable summary, visual/text diff, affected objects, warnings, blockers, approval requirement, and base revision. |
| Conflict | Base/current revision and actor summary, retained user intent, re-preview/inspect/discard actions; no silent rebase. |
| Offline | Stop server-owned mutations and runs, preserve only unsent Composer/form drafts, show reconnect state, and do not replay queued writes. |
| Permission lost | Freeze new writes, preserve safe drafts, explain the changed access, and provide a management/back action. |
| Source-managed | Compatibility report and approval-gated migration entry; no editable builder canvas or round-trip claim. |
| Migration required | Recorded decision requirement and explicit blocker; no inferred authoring mode or synthetic baseline. |
| Capability unavailable | Explain the missing backend/Connector/Agent/stage capability; disable the action without fake success. |
| Readiness blocked | Findings grouped by affected object/domain with navigation to repair; publish remains disabled by server truth. |
| Ready | Preview and publish/release action reflect current server readiness and exact revision. |
| Published plus newer draft | Show active release/revision relationship separately from the newer editable draft. |
| Scoped error | Preserve unaffected canvas objects and expose retry/support details at the failed page/section/panel. |
| Fatal route error | Replace the work region with a focused error state, correlation ID, retry, and back-to-management action; never show a fake canvas. |

Empty/error copy leads with the user outcome and next useful action. Internal exception text, provider payloads, database identifiers, and raw stack traces are not product copy.

### 11. Motion and interaction contract

Motion follows `DESIGN.md` and the shared platform contract:

- color/opacity feedback: `70-120ms`;
- high-frequency hover/list navigation: no movement or at most `100-150ms`;
- menu/tooltip: `120-180ms`;
- inspector/panel/sheet: `180-250ms`, with exit faster than enter;
- stage/canvas focus continuity: `220-320ms` only when it explains spatial change.

Implementation rules:

- Use `motion/react` for coordinated state/space transitions and shared CSS transitions for simple token changes.
- Do not use `transition-all`, routine bounce, ambient floating, decorative infinite motion, or stacked page/card/icon entrances.
- Default shell chrome has no first-paint entrance animation.
- Dragging, panning, zooming, typing, stopping a run, and task completion are never blocked by an animation.
- A ChangeSet acceptance may animate affected nodes from preview to committed position while revision/provenance/undo stays visible. This is the editor signature transition, not a generic celebration.
- Exit motion is interruptible. A second command or navigation input wins immediately.
- `prefers-reduced-motion` replaces spatial interpolation and shimmer with near-instant state/opacity changes; no feature or progress meaning disappears.

### 12. Performance contract

- Pan/zoom and high-frequency selection feedback stay on compositor-friendly transforms and avoid full-graph React reconciliation per frame.
- Spatial scenes use stable keys, viewport culling/virtualization, memoized projections, and coarse server-query subscriptions. A pointer move must not invalidate the entire shell or Agent thread.
- Canvas rendering, inspector data, Agent history, comments, and preview artifacts load as independent resources where their backend contracts permit.
- Expensive graph layout, schema validation, visual diff, build, and publish work use durable backend jobs or measured worker paths; they do not block the browser main thread under a fake spinner.
- Binary assets and large Tool outputs stream references/thumbnails/summaries. They are not embedded into Zustand, URL state, or assistant message JSON as full binaries.
- Performance acceptance uses a representative large-site fixture and a recorded browser trace for pan, zoom, multi-select, stage switch, inspector open, and streamed Agent output. Budgets and regression thresholds are recorded with the fixture from measured baseline evidence rather than introduced as arbitrary global caps.
- Any optimization that changes correctness, culling, focus order, or accessibility must retain deterministic non-spatial access and explicit tests.

### 13. Boneyard boundary contract

The creation editor uses a dedicated named Boneyard boundary around asynchronous work, not around the full scene.

Stable real regions outside the boundary:

- editor top bar and back action;
- stage navigation;
- persistent rail and bottom control shells;
- Agent panel shell when already mounted;
- route-level access/error state container.

Captured asynchronous regions may include:

- initial Sitemap macro nodes/tree rows;
- initial Wireframe page-frame/section blocks;
- Style Guide concept/token macro groups;
- Design page-frame macro layout;
- inspector fields only when their resource is independently loading.

Rules:

- Use one stable route/stage-derived production skeleton name per intentionally captured work boundary. Dynamic project/revision identifiers never create skeleton names.
- Capture at `375`, `768`, and `1280`, with the boundary's actual `select="container"` or `select="viewport"` behavior.
- Configure `excludeSelectors`, `excludeTags`, and `leafTags` to reduce the capture to meaningful macro anatomy. Exclusion does not keep a real element visible while its ancestor boundary is loading.
- Use neutral surface/loading tokens. Action Blue may show real job progress but is not the ambient bone color.
- Delay transient skeleton display approximately `180-200ms`; once shown, retain it for approximately `180ms` to prevent a one-frame flash.
- Generation does not replace the canvas with shimmer. It shows durable progress and progressively materialized real pages/nodes.
- Reduced motion renders solid bones without shimmer/pulse.
- Authenticated deterministic capture may use build-time fixtures or an explicit authenticated session. A fixture is never a production data fallback.
- Generated `.bones.json` and registry artifacts are created by repository scripts and never hand-edited.
- Missing named production bones are a development/CI error. The editor does not silently substitute `PageSkeleton` and report capture success.
- Route-level bones do not replace blank, partial, conflict, offline, permission, migration, or fatal domain states.

### 14. Product copy and i18n contract

Every visible string uses a stable i18next key and ships in both `locales/zh-CN` and `locales/en-US`. This includes canvas object menus, tooltips, shortcuts, Agent/Tool states, accessibility announcements, job phases, conflicts, readiness findings, errors, and destructive impact previews.

Use one stable namespace/prefix for the surface, for example:

```text
editor:STAGE_SITEMAP
editor:STAGE_WIREFRAME
editor:STAGE_STYLE_GUIDE
editor:STAGE_DESIGN
editor:SYNC_SAVED
editor:SYNC_CONFLICT
editor:AGENT_UNAVAILABLE_TITLE
editor:OFFLINE_TITLE
editor:OFFLINE_DESCRIPTION
editor:CHANGESET_REVIEW_TITLE
editor:READINESS_BLOCKED_TITLE
editor:MIGRATION_REQUIRED_TITLE
```

Key spelling follows the repository locale conventions at implementation time; the requirement is stable semantic keys, not the literal sample casing above.

Copy rules:

- Use “Sitemap”, “Wireframe”, “Style Guide”, and “Design” consistently in English and intentional localized product terms in Chinese.
- Use “Plan” and “Build” only for execution mode. Agent names remain identities.
- Distinguish draft saved, syncing, queued, running, cancel requested, cancelled, partial, ready, and published.
- Never say “Saved”, “Applied”, “Published”, or “Completed” until the corresponding server outcome is durable.
- Error copy explains what happened and what the user can do next, with a separate correlation/support ID.
- Dynamic values use interpolation and locale-aware number/date/duration formatting; do not concatenate translated fragments.
- Screen-reader announcements use concise dedicated keys instead of reusing long visual descriptions.

### 15. Component and module boundaries

The target composition stays cohesive under `apps/admin/src/pages/projects/editor/**`. Names below define responsibilities; implementations may colocate tightly coupled local types/helpers when that is easier to understand.

| Component/module | Responsibility |
|---|---|
| `CreationEditorPage` | Route bootstrap, access/capability gate, and shell entry. |
| `CreationEditorShell` | Stable landmarks, responsive region composition, focus routes, and panel ownership. |
| `CreationEditorTopbar` | Back/project/revision state, stage navigation, preview/share/readiness actions. |
| `EditorStageSwitcher` | Four-stage navigation, availability, readiness, and keyboard semantics. |
| `EditorCanvasViewport` | Viewport transform, culling host, spatial focus, selection overlay, and stage scene outlet. |
| `SitemapScene` / `WireframeScene` / `StyleGuideScene` / `DesignScene` | Stage-specific projections and typed command entry points. |
| `EditorToolRail` | Global and stage-specific tools without owning their domain state. |
| `EditorInspector` | Selection-derived forms, validation, bindings, and responsive properties. |
| `EditorAgentPanel` | assistant-ui composition over the Arclayer runtime adapter. |
| Builder query/controller | Generated-client reads, resource invalidation, capability mapping, and server snapshot projection. |
| Editor transient store | Viewport, selection, hover, interaction preview, and panel preference only. |
| Command dispatcher | Typed command/ChangeSet lifecycle, idempotency, pending state, result reconciliation, and conflict routing. |
| Agent context adapter | Stable selection/stage/revision snapshot and structured Agent IDs for each run. |

Boundary rules:

- Server-query code does not import stage visual components.
- Stage components do not call raw `fetch`, construct endpoint URLs, or write query caches as canonical outcomes.
- The transient store does not own message history, content documents, revisions, releases, jobs, or permissions.
- Agent Tool renderers emit user decisions or typed command intents; they do not import and mutate the canvas store as proof of success.
- Canvas engine/domain composition remains Admin-local. Only proven generic primitives without Admin routes, clients, stores, or domain types move to `packages/ui`.
- Reuse `@arclayer/ui/*` first. Add a missing generic primitive through the configured shadcn Registry. Use Lucide icons and the canonical form/motion/loading stack.
- Avoid mechanical one-component-per-file fragmentation for one-use stage markup. Split when responsibility, reuse, test boundary, or change cadence is genuinely different.

### 16. Error and validation routing

| Failure source | Owning surface | Required recovery |
|---|---|---|
| Route bootstrap/access | `CreationEditorPage` | Retry, authenticate, or back to management. |
| Stage query | Active stage work region | Retry the resource without remounting stable shell/panels. |
| Inspector query | Inspector | Retry/close inspector; preserve canvas. |
| Form/schema input | Field/inspector | Inline accessible error; focus first invalid field on submit. |
| Command conflict | Change review/conflict surface | Re-preview against current base, inspect current, or discard. |
| Durable generation/build job | Job/progress surface | Retry allowed scope or inspect evidence; retain successful partial results. |
| Agent stream/reconnect | Agent panel | Reconnect/resume, retry a new run when safe, or expose terminal error. |
| Tool renderer absent | Tool-call fallback renderer | Show validated Tool name/status/summary and explicit unsupported-renderer error; never execute or claim success. |
| Preview/publish failure | Readiness/release surface | Preserve last-known-good/prelaunch truth and show failed candidate evidence. |
| Offline | Shell connection state plus affected actions | Preserve unsent drafts, reconnect, then refresh server truth; no offline mutation replay. |

Errors are matched through generated, stable backend discriminants once those contracts exist. UI code must not parse exception prose to decide conflict, permission, approval, or retry behavior.

### 17. Hard cut and migration contract

When Wave 2 switches the production route:

1. Replace the old lazy route import with `CreationEditorPage` and register the exact `creation-editor` scene.
2. Remove the current read-only `apps/admin/src/pages/projects/editor/page.tsx` implementation, its dashboard/source-viewer presentation, and obsolete editor-only helpers that have no new owner.
3. Migrate reusable query knowledge into the Builder query/controller only when it matches the new backend ownership. Do not retain the old page as a facade or hidden compatibility route.
4. Remove iframe/source-viewer behavior as the editor's primary experience.
5. Reverse the current `apps/admin/test/routes/editor-layout-routing.test.ts` assertions that prohibit a dedicated editor scene. Replace them with positive exact-route and chrome-exclusion assertions.
6. Keep other project routes in `AdminLayout` and verify that the scene predicate cannot capture `editorial`, nested management routes, empty IDs, or unsupported child paths.
7. Do not switch an existing project until Wave 0 migration evidence supplies an explicit `ProjectAuthoringMode`, eligible baseline `ContentStructureRevision`/`SiteRevisionManifest`, tenant readiness, and permissions.
8. Route `source_managed` and `migration_required` projects to explicit compatibility/migration states. Never backfill fictitious historical revisions or infer mode in the browser.
9. Remove old editor copy keys, snapshots, mocks, and Boneyard names that no production route consumes. Generated artifacts are regenerated through scripts, not edited manually.

There is one production editor after the hard cut. A query flag, local-storage switch, hidden route, or permanent dual-render path must not preserve the obsolete surface.

### 18. Required regression fixtures

The fixture set includes:

- exact editor scene matching with and without trailing slash;
- negative route cases for project management, `editorial`, missing project ID, extra path segments, auth, global, and system routes;
- editor scene without Admin sidebar, Admin topbar, `DefaultPage`, or old editor dashboard;
- authenticated owner, editor, viewer, removed-permission, not-found, and cross-tenant-safe access outcomes;
- `builder_managed`, `source_managed`, `migration_required`, tenant-not-ready, no-baseline, and baseline-revision projects;
- each stage with empty, representative, large, validation-error, and partial-generation data;
- stale ChangeSet/base ETag conflict and explicit re-preview;
- offline with an unsent draft and no mutation replay;
- queued/running/cancel-requested/cancelled/partial/failed/completed durable jobs;
- Agent runtime available, unavailable, reconnecting, approval required, nested specialist messages, terminal error, and unsupported Tool renderer;
- Agent unavailable/failed states proving there is no fake assistant result or fake canvas mutation;
- selection survival across query refresh, stale/deleted selection, stage mapping, and multi-selection compatibility;
- keyboard-only Sitemap editing, canvas alternative navigation, focus restoration, announcements, and destructive impact flow;
- desktop, tablet, mobile, on-screen-keyboard, safe-area, and orientation-change layouts;
- light, dark, high contrast where supported, and reduced-motion behavior;
- named Boneyard resolution and authenticated deterministic captures at `375`, `768`, and `1280`;
- `zh-CN` and `en-US` product copy, plural/count/date formatting, and no raw new product strings;
- static hard-cut assertions that old component imports, old third Agent mode, old editor route facade, and old dashboard/source viewer do not remain.

Test fixtures may return deterministic backend events only inside test/capture harnesses. They must be impossible to import into production runtime code.

### 19. Automated verification matrix

| Change | Required evidence |
|---|---|
| Scene/route shell | Unit tests for the exact predicate and scene precedence; integration assertion that Admin chrome is absent and management chrome remains elsewhere. |
| Canvas/selection | Component tests for pointer and keyboard selection, viewport preservation, culling boundaries, stale selection, and accessible tree/outline parity. |
| Typed command | Tests for idempotency propagation, pending state, server reconciliation, conflict/re-preview, explicit error, and no premature success. |
| Agent runtime | Adapter contract tests for initialization-before-send, structured mentions, Plan/Build, Tool states, approval, nested messages, stop, reconnect, and terminal failure. |
| Responsive shell | Component/visual tests at `375`, `768`, and `1280`, including sheet navigation, safe areas, focus restoration, and no accidental page overflow. |
| Motion | Reduced-motion tests, interruptible transitions, and no interaction gated on animation. |
| Boneyard | Skeleton-name unit test, resolution test for every production name, authenticated capture, and review of macro anatomy. |
| i18n/copy | Both locale resources, accessible announcement keys, and raw-string regression check for changed product UI. |
| Performance-sensitive canvas | Representative large-site trace and recorded comparison for pan, zoom, selection, stage change, inspector, and streaming. |
| Hard cut | Source/route regression tests proving the old editor and no-dedicated-layout assertions are removed. |

Implementation waves run `pnpm admin:check`. Cross-app or API-client changes run the matching broader gate from the shared platform contract. Design-sensitive waves include canonical light/dark visual regression and the repository changed-scope review gate.

### 20. Acceptance scenarios

#### Good

A `builder_managed` project opens directly into the dedicated Sitemap scene. The shell appears immediately, only the canvas macro region uses neutral bones, and a durable generation job progressively adds real page nodes. The user selects a page by keyboard, asks the Site Architect in Plan mode for alternatives, reviews the nested specialist evidence and candidate ChangeSet, switches to Build, accepts a typed reversible draft command, and sees the new server revision with provenance and undo. A later conflicting edit requires explicit re-preview. Refresh restores the Agent run and canvas revision without restoring a fake local graph.

#### Base

A viewer opens an existing Design revision on mobile. The canvas, stage picker, page outline, inspector, and Agent thread are all reachable through one sheet at a time. Write actions explain view-only permission. Browser zoom still works, focus returns after closing sheets, and the active published release is visually distinct from a newer draft.

#### Bad

The route renders inside `AdminLayout`, loads the old read-only dashboard, clones a page graph into Zustand, calls several Agents from the browser for one multi-mention, turns streamed Markdown into canvas nodes, displays “Saved” before the command returns, silently rebases a stale write, replays it after reconnect, and covers the entire editor with blue shimmer. This violates the route, ownership, Agent, conflict, offline, copy, and Boneyard contracts.

### 21. Wrong vs correct

#### Wrong: production fake success

```ts
try {
  return await agentClient.generate(input);
} catch {
  return { status: "completed", pages: buildTemplatePages(input) };
}
```

#### Correct: capability and failure stay explicit

```ts
const result = await agentClient.generate(input);

if (result.status === "failed") {
  throw toEditorRunError(result);
}

return result;
```

The explicit error is rendered by the Agent/job state contract. A test fixture may supply deterministic events through the test adapter; production does not synthesize success.

#### Wrong: canonical document in interaction state

```ts
editorStore.setState({ pages: applyModelPatch(editorStore.pages, modelOutput) });
```

#### Correct: typed intent and canonical reconciliation

```ts
await commandDispatcher.applyChangeSet({
  changeSetId,
  baseRevisionId,
  baseEtag,
  idempotencyKey,
});
```

The dispatcher reconciles from the server command outcome and new immutable revision; arbitrary model output never becomes authoring truth.

### 22. Definition of done

The creation editor is complete only when:

- the dedicated scene and exact route own the full-screen shell without Admin chrome;
- all four stages project one canonical versioned site aggregate and use typed command/ChangeSet writes;
- server, URL, and transient canvas state are demonstrably separated;
- the assistant-ui adapter supports structured Agent identity, Plan/Build, Tool/approval/nested messages, cancellation, durable reconnect, and explicit failure without frontend orchestration;
- desktop, tablet, and mobile preserve the complete creation workflow with keyboard and screen-reader alternatives;
- loading, blank, generation, partial, conflict, offline, permission, migration, readiness, published-draft, and fatal states are productized and tested;
- motion, canvas performance, and Boneyard boundaries meet this contract in both normal and reduced-motion modes;
- every new string ships in `zh-CN` and `en-US`;
- the old read-only editor, source-viewer primary experience, no-dedicated-scene assertions, and compatibility facades are removed in the same hard cut;
- migration and regression fixtures prove that no project, Agent run, revision, release, or mutation success was invented to bridge an unavailable backend contract.

### 23. Wave 2D Sitemap implementation evidence (2026-07-21)

The first production creation scene is now active at `/projects/{projectId}/editor`:

- the route resolves to a dedicated `creation` scene and `CreationLayout`; the Project parent route still establishes authorized workspace/project context, while Admin sidebar, Admin topbar, `DefaultPage`, old iframe preview, source tree, source viewer, and source/config dashboard are removed in the same hard cut.
- the full-screen shell provides the Sitemap/Wireframe/Style Guide/Design stage model, but only Sitemap is active. Later stages, undo/redo, preview, and publish are disabled with product reasons rather than fake local behavior.
- Sitemap renders exact revision-pinned page summaries on a pan/zoom/fit infinite canvas with parent connectors, selected-node state, page/route inspector, empty-site onboarding, macro loading skeleton, migration/initialization/error boundaries, and permission-aware write controls.
- manual page creation uses a product dialog with explicit title/path/parent inputs, server ChangeSet preview, visible impact evidence, and a separate apply action. Editing inputs invalidates the previous preview; no local page is inserted before server reconciliation.
- the AI inspector selects an eligible Agent by avatar, accepts a product objective, creates a revision-bound Agent Run, starts and cancels the durable generation, renders queued/running/partial/failed/cancelled/succeeded state, reviews typed candidate operations/issues, and applies only the selected candidate with required approval evidence.
- all new product copy ships in `zh-CN` and `en-US`; icon-only actions are labelled, disabled actions explain their reason, interactive controls remain keyboard reachable, and motion uses narrow properties with reduced-motion handling for loading/spinner states.
- data/command orchestration is isolated in `useProjectEditorController`; canvas controls, candidate review, loading boundaries, page inspector, and add-page command flow have distinct cohesive responsibilities.

Automated evidence:

- creation editor and scene routing: 8 focused tests passed. They cover immutable page/route projection, old iframe absence, explicit initialization boundary, revision-bound Thread/Run/generation ordering, manual ChangeSet preview-before-apply, exact candidate approval evidence, and route-level creation scene ownership.
- `pnpm admin:check`: 317 test files and 1409 tests passed; lint reported 0 warnings/0 errors; all 4 Turbo tasks passed.
- `pnpm api:check`: 2172 passed, 435 skipped, 26 warnings; all 4 Turbo tasks passed.
- `pnpm check`: all 8 cross-app Turbo tasks passed.
- changed-scope review reports `status=ok`, zero enforcement-blocking findings, and the same 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); no new creation-editor or revision-reader file is reported.
- Chrome DevTools confirmed that the route renders outside Admin chrome and that the explicit fatal boundary remains usable. The current environment returned 502 for every API request, including unrelated workspace/project endpoints, so a successful real-data canvas screenshot is not claimed.

This is a truthful Wave 2 Sitemap vertical, not the section 22 final definition of done. Responsive sheet parity, keyboard outline parity for very large graphs, undo/redo, stage projections, renderer preview, Boneyard capture, and successful light/dark real-data visual regression remain required before the creation editor as a whole is complete.

### 24. Wave 3A Wireframe inspection scene evidence (2026-07-21)

The Wireframe stage is now reachable from the full-screen creation shell and renders only server-verified revision data:

- the stage reads `BuilderRevisionPageOut.wireframe`; it never derives a Wireframe from Sitemap nodes, `VISUAL_BLUEPRINT`, or browser interaction state.
- a persistent page rail shows Wireframe section counts and preserves the page identity shared with Sitemap. The canvas provides desktop/tablet/mobile structural view widths, ordered section intent/component/variant frames, explicit content/media/binding placeholders, and a selected-section inspector for Design System/catalog pins, bindings, responsive rules, and interactions.
- the signature visual is an intent spine connecting ordered section frames. It communicates traceability rather than decorating the canvas; surfaces remain neutral and Action Blue is reserved for selection/focus.
- pages with no Wireframe and documents with no sections have distinct product states. Both explain the retained server truth and avoid offering a fake save or generation action.
- the scene is deliberately read-only until typed Wireframe ChangeSet commands exist. Style Guide and Design remain disabled; Sitemap Agent generation remains scoped to Sitemap.
- every new string ships in `zh-CN` and `en-US`. Controls use native buttons, labelled viewport actions, visible focus, 44px page targets, semantic tag components, narrow transition properties, and reduced-motion handling.

Focused Admin evidence: the creation editor and scene routing suite passes 9 tests, including stage availability, exact Wireframe rendering, visible missing-media evidence in both canvas and inspector, responsive controls, explicit no-Wireframe state, Sitemap commands, Agent generation, and dedicated scene ownership. Admin TypeScript and lint pass.

The final cross-app gate passes all 8 Turbo tasks from cache misses: Admin has 317 files and 1410 tests passed with zero lint findings; API has 2175 passed, 435 integration-disabled skips, and 26 existing warnings.

Still gated: Wireframe editing/reorder/duplicate/variant/binding commands, AI Wireframe generation, narrow-layout sheets, comments, renderer preview, visual diff, and real-data browser success-state capture.

### 25. Wave 3B Wireframe candidate editing evidence (2026-07-21)

The Wireframe scene now edits through the typed server ChangeSet boundary:

- the selected-section inspector exposes accessible controls for component/variant replacement, section reorder/duplicate/remove, binding set/clear, responsive rule set/clear, and interaction replacement. A page with no Wireframe can submit an explicit initialization candidate using a declared catalog-version identity; it does not invent a placeholder document or claim catalog compatibility before the later readiness gate exists.
- every action sends the exact page Content Version number plus typed operation IDs against the current Site Revision ID/ETag. Inputs remain local drafts only. They never mutate the canonical canvas or claim success.
- a successful preview supplies the exact server `wireframeCandidate`. The canvas then renders that candidate on the existing intent spine, labels it as a server candidate, disables further drafting, and exposes one fixed review surface with operation/page counts, approval class, Apply, and Discard.
- Apply sends the retained signed preview token and exact approval evidence where required. Success clears the candidate and invalidates the Builder aggregate so the editor reconciles from the next immutable Site Revision.
- Wireframe writes require both Builder-write and Content-item-write permission. Pending, permission, conflict, and apply errors remain visible beside the affected editing surface. Button controls use native semantics, visible labels or accessible names, 44px targets, Action Blue only for selection/action, and restrained state-driven motion.

The focused editor/route suite now passes 10 tests, including exact immutable rendering, no-Wireframe truth, Sitemap/Agent regressions, and the full component/variant preview → server candidate → explicit apply path. Admin TypeScript and generated OpenAPI typecheck pass.

Final cross-app verification runs from cache misses and passes all 8 Turbo tasks: Admin has 317 files and 1411 tests passed with zero lint findings; API has 2183 passed, 435 integration-disabled skips, and 26 existing warnings. Changed-scope review is `status=ok` with zero enforcement-blocking findings and the existing 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); no new Wireframe ChangeSet/transaction/editor file is reported. `git diff --check` passes.

Still gated: arbitrary section creation UI and drag gestures (typed backend operations exist), registered component-catalog browsing/compatibility, Agent Wireframe generation, narrow-layout inspector sheets, comments/history, visual diff, renderer preview, server undo/redo, and successful real-data browser light/dark/reduced-motion capture. Arrow-based reorder remains the accessible command path and does not pretend that an uncommitted drag was saved.

### 26. Component-catalog-backed section composition evidence (2026-07-21)

The Wireframe inspector now authors against the exact catalog pinned by the current Site Revision:

- the controller loads `GET /projects/{projectId}/builder/component-catalog`; loading, failure, permission, or missing exact catalog evidence disables composition editing with a visible product reason;
- component and variant choices come only from the registered catalog. Every declared slot shows localized label/description, stable slot key, value kind, required/optional status, and supported field/literal binding choices;
- changing a component creates a transient local composition draft that retains only canonical bindings compatible with the new declared slots. Required slots must be completed before Preview; structured literals are strictly parsed as JSON and invalid input remains local with an inline `role=alert`, `aria-invalid`, and focus on the affected field;
- one Preview submits `wireframe.section.configure` with component, variant, the complete parsed binding set, and the current complete responsive/interaction sets. The browser draft never replaces the canvas document. Only the returned server candidate becomes the review overlay, and blocker candidates cannot be applied;
- Workspace Design System version authoring also uses the registered catalog endpoint and requires an exact catalog selection before version creation.

All new product copy exists in `zh-CN` and `en-US`. The form uses the existing Arclayer semantic tokens, single-column grouping, native fieldsets/labels, keyboard-reachable shared controls, 44px action targets, and explicit error semantics without adding a parallel visual system.

Focused Admin evidence passes 4 files / 16 tests, including complete atomic configuration, invalid structured content staying local, exact server candidate/apply, existing missing-binding truth, and Design System catalog selection. Admin typecheck and lint pass.

Final cross-app `pnpm check` passes all 8 tasks from cache misses: Admin has 317 files and 1413 tests passed; API has 2191 passed, 435 integration-disabled skips, and 26 existing warnings.

Still gated: a real catalog-backed rendered preview, Agent Wireframe generation, full local atomic responsive/interaction composition UX for cross-component incompatibilities, narrow-layout inspector sheets, comments/history, server undo/redo, and successful real-data light/dark/reduced-motion browser capture.

### 27. Style Guide backend-readiness boundary (2026-07-21)

Project-owned Design System versions can be read, created immutably, and foundation-validated through project-scoped APIs. The full-screen editor now composes that authority into an editable Style Guide stage without introducing a browser-owned Style Guide document.

The user flow forks a Workspace version when required, authors an immutable project version, validates the server candidate, assigns the accepted exact version, then Preview/Applies an explicit Design System refresh ChangeSet against the current Site Revision. Assignment never changes the canvas token source immediately, because the retained Site Revision remains pinned to its previous exact version/checksum.

Any local token/form draft is transient input only. Accepted Style Guide truth comes from the immutable server version; canvas truth comes from the refreshed server Site Revision. Version history, full comparison, supersede, renderer, Asset/font-rights, section-scheme preview, Design stage, compile, and publish actions remain unavailable until their backend capability gates pass.

### 28. Style Guide refresh backend-readiness evidence (2026-07-21)

The server path needed by the future Style Guide scene is now complete through revision refresh:

- the browser submits one exact `design-system.refresh` operation with assignment revision, Design System/version, manifest checksum, and validation finding hash;
- Preview returns a server-owned review checkpoint, one Design System affected target, and public-ID before/after summary. Missing approval or any assignment/version drift remains an explicit error;
- approved Apply creates the next Site Revision while reusing the prior Content Structure and page/presentation pins. Assignment alone still does not change canvas truth;
- the generated TypeScript client contains the discriminated operation, so the Admin must use the generated contract rather than a parallel local payload type.

The Admin now productizes fork → immutable version → validate → assign → refresh Preview/Apply. It distinguishes the immutable server candidate from the revision-bound canvas pin, preserves explicit errors, and updates canvas truth only after the applied Builder aggregate reconciles. Full semantic comparison remains separate work. This milestone does not ungate renderer preview, Asset/font rights, section-scheme visualization, Design writes, compile, or publish.

### 29. Style Guide server-candidate review evidence (2026-07-21)

The Style Guide stage is now active while Design remains capability-gated:

- the controller reads the exact project assignment and resolves its immutable source version from the correct Workspace-owned or Project-owned API. A Workspace source exposes an explicit product dialog that runs fork and assignment as two replay-safe server commands; it never edits the Workspace lineage in place;
- project authoring reuses the registered component catalog and existing Design System version dialog. The browser form is transient input; a successful create response becomes the visible immutable server candidate;
- validator v2 findings are rendered with their server message and affected token path. An invalid candidate cannot be accepted or treated as refresh-ready;
- accepting a valid candidate changes only the Project assignment. The version track continues to show the older revision-bound canvas pin until an exact `design-system.refresh` Preview is reviewed and applied;
- all six mutation boundaries use stable operation-derived idempotency keys. Offline, read-only, missing assignment, query failure, command failure, invalid validation, assignment drift, pending approval, and applied reconciliation are explicit states;
- the signature version track becomes a bounded bottom track on narrow layouts and a 22rem side track on wide layouts, preserving the candidate and approval path without horizontal overflow.

Focused evidence passes the typed Admin API seam and full Editor DOM seam with 2 files / 12 tests. The DOM suite covers project-owned authoring/validation/assignment/refresh, Workspace fork/assignment keys, invalid findings, and the existing Sitemap/Wireframe/Agent regressions. Admin formatting, TypeScript, and lint pass.

Full verification passes `admin:check` with 4/4 tasks, 318 files, and 1417 tests, then passes cross-app `pnpm check` with 8/8 tasks. The API side remains 2196 passed / 435 integration-disabled skips / 26 existing warnings. Changed-scope review is `status=ok` with zero enforcement-blocking findings and 45 report-only findings (43 prototype `BLOCKER` labels and 2 `MINOR` findings); no Style Guide Admin file is reported.

Still gated: project version history/list, semantic compare diff, supersede, Agent-generated concepts, Asset/font-rights, section-scheme contrast editing, real shared visitor rendering, catalog-backed rendered preview, Design writes, compiler artifacts, publication readiness, comments/history, server undo/redo, and successful real-data light/dark/reduced-motion browser capture.

### 30. Style Guide immutable history and semantic review evidence (2026-07-21)

The signature version track now includes the complete project-owned lineage without turning browser state into a second history model:

- the Admin reads cursor-paginated immutable versions from the Project API and exposes an explicit “load earlier versions” action. Loaded pages are accumulated by React Query; the UI never treats the first response as complete history;
- each lineage entry keeps Canvas, Assigned, and Review target as separate plain-language markers. A version with `source="fork"` is labelled as the Workspace fork baseline even when its parent ID is outside the project-owned collection; the UI does not misreport that external provenance as missing data;
- selecting a prior version requests an exact server comparison from that immutable version to the current source or server candidate. The comparison resource is cached by Project, system, from-version, and to-version identities and is invalidated naturally when the review target changes;
- the comparison renders server counts, stable semantic concern/path/operation entries, and expandable exact before/after values. It does not claim downstream page impact, renderer compatibility, Asset/font authorization, or publication readiness;
- history loading, empty, error/retry, pagination pending, comparison loading, comparison error/retry, no-change, Workspace-owned source, and narrow touch-target states are explicit. All interactive controls use native semantics, visible focus, 44px narrow-layout targets, restrained transitions, and localized `zh-CN`/`en-US` copy.

The typed API and Editor DOM seams pass 2 files / 14 focused tests. They cover cursor and signal encoding, exact comparison payloads without command headers, two-page lineage loading, external Workspace fork provenance, exact prior-to-target comparison, and existing candidate/fork/validation/refresh regressions. Admin formatting, lint, and TypeScript checks pass.

Full verification passes `admin:check` with 4/4 tasks, 318 files, and 1419 tests. `api:check` passes 4/4 tasks with 2198 tests passed, 435 integration-disabled skips, and 26 existing warnings; cross-app `pnpm check` passes all 8 tasks. Changed-scope review remains `status=ok` with zero enforcement-blocking findings and the existing 45 report-only findings (43 prototype `BLOCKER`, 2 `MINOR`); no Design System/Style Guide file is reported. `git diff --check` passes.

The browser harness reached the exact Editor URL at a 3840×2160 viewport, but the local gateway again returned only `Bad Gateway` before the Admin application or login flow loaded. The captured evidence is `reports/creation-editor-style-history-bad-gateway-2026-07-21.png`. No successful real-data, light/dark, narrow-layout, or reduced-motion visual result is claimed from that gateway response.

Still gated: true version lifecycle/supersede projection and command, semantic breaking-impact analysis, Agent-generated concepts, Asset/font rights, section-scheme contrast editing, real shared visitor rendering, catalog-backed rendered preview, Design writes, compiler artifacts, publication readiness, comments, server undo/redo, and successful real-data light/dark/reduced-motion browser capture.

### 31. Style Guide lifecycle and supersession control evidence (2026-07-21)

The existing version evidence track now consumes the server lifecycle projection and adds one governed historical action without turning the rail into an action menu:

- every loaded version renders its real lifecycle state. Superseded entries remain comparable, identify the replacement project version when that version is loaded, and continue to show Canvas, Assigned, and Review target as separate markers;
- “Supersede version” appears only for a lifecycle-valid historical version that is neither the current assignment nor the current canvas pin, while a higher lifecycle-valid and foundation-valid review target is available. Read-only, offline, assigned, canvas, candidate, invalid, archived, and already-superseded entries do not expose the action;
- the confirmation uses `SettingDialog` and states the three material consequences: the target cannot be used for new assignments, exact historical Site Revisions remain readable, and canvas/Site Revision/active release are not rewritten. Pending and error states remain local to the decision;
- the command sends exact target lifecycle status/revision, exact replacement checksum, and the server-projected system metadata revision with stable key `style-guide-supersede:<targetVersionId>:<replacementVersionId>`;
- success closes the decision and invalidates only the Project Design System query family. It does not mutate local Builder canvas state or claim downstream compatibility;
- the rail remains neutral and scan-first: native text buttons, visible focus, 44px narrow-layout targets, semantic status text/icons, narrow property transitions, and no decorative lifecycle colors. All copy ships in `zh-CN` and `en-US`.

Focused typed API and Editor DOM tests cover the exact supersession path/header/payload, action eligibility, confirmation consequences, stable idempotency key, and the existing history/comparison/candidate/fork/refresh regressions. Admin format, TypeScript, and lint pass. Final `admin:check` passes all 4 tasks with 318 files / 1420 tests, including the 13-test Editor surface and 2-test Project Design System API contract. The first full run's seven test timeouts and four pool-worker startup failures were not reproducible: every affected file passed independently, then the complete suite passed without raising timeouts or adding fallback behavior. Cross-app `pnpm check` passes 8/8 tasks, generated OpenAPI typecheck passes, changed-scope review remains `status=ok` with zero enforcement-blocking and 45 unrelated report-only findings, and `git diff --check` passes.

The exact authenticated Editor URL was then reloaded without cache at 3840×2160. The Admin document returned 200 and rendered the intended product boundary, but every required API request for Workspace, Project, Builder, Project authorization/actions, and eligible Agents returned 502, so the Style Guide stage never became available. The stable evidence is `reports/creation-editor-style-supersession-api-502-2026-07-21.png`. A development Fast Refresh session had briefly retained an older Hook signature and entered the route error boundary; a full document reload removed that console error, leaving only the reproducible API 502 responses. No successful real-data, light/dark, narrow-layout, or reduced-motion visual result is claimed.

Still gated: downstream semantic impact analysis, Agent-generated concepts, Asset/font rights, section schemes, visitor rendering, Design writes, compile artifacts, publication readiness, comments, server undo/redo, and successful real-data light/dark/narrow/reduced-motion capture.

### 32. Style Guide downstream impact review evidence (2026-07-21)

The Style Guide history rail now pairs semantic comparison with server-authored
downstream evidence for the same exact review selection:

- selecting a historical source version starts comparison and impact queries
  in parallel with the identical source/target version IDs. The browser does
  not infer impact from the comparison response and does not persist a local
  compatibility model;
- the impact region renders the exact referenced/current Site Revision counts,
  affected page/section totals, blocker/warning totals, current assignment
  evidence, mapped Wireframe section/component/variant targets, unmapped diff
  count, and deterministic impact hash;
- removed recipes are presented as blockers, while recipe and reachable token
  changes are warnings. Empty mapped results remain explicit and are not
  rewritten as a global "safe" result;
- Asset evidence is labelled manifest-only. Active release, renderer, and
  compiler artifacts are labelled not evaluated, so the UI cannot be mistaken
  for publication readiness or a successful build/preview check;
- loading, local failure/retry, no-mapped-impact, unmapped-diff, assignment
  source, and detailed target states use one neutral evidence track with shared
  buttons, semantic icons/text, visible focus, and 44px narrow-layout action
  targets. All new product copy is present in `zh-CN` and `en-US`.

The typed API and Editor DOM seams pass 2 files / 15 focused tests after
formatting. They cover the exact read-only request path and payload without an
idempotency header, query activation from the exact version selection, and the
accessible downstream review region while retaining all existing Style Guide
candidate, history, comparison, supersession, and refresh regressions.

Full `admin:check` passes all 4 tasks with 318 files / 1420 tests. Full
`api:check` passes 4/4 tasks with 2201 tests passed, 436
integration-disabled skips, and 26 existing warnings; generated OpenAPI
typecheck passes, and cross-app `pnpm check` passes all 8 tasks.

Changed-scope review is `status=ok` with zero enforcement-blocking findings and
45 report-only findings outside this slice; no Style Guide impact path is
reported. `git diff --check` passes.

The authenticated Editor URL was reloaded without cache after the gates. The
Workspace, Project, Builder, authorization/actions, and eligible-Agent requests
all ultimately returned 200, replacing the earlier gateway-level 502 boundary.
This specific Project is still source-managed rather than Builder-managed, so
the live route truthfully renders the migration-required state and cannot enter
the Style Guide review stage. The stable evidence is
`reports/creation-editor-impact-migration-required-2026-07-21.png`. No
successful impact-review, light/dark, narrow-layout, or reduced-motion capture
is claimed.

### 33. Wave 3F Sitemap intent workbench and Wireframe traceability contract

The Sitemap page inspector becomes the authoring surface for the exact planning
projection required by Wireframe:

- the read state shows page purpose and the ordered section-intent spine from
  `BuilderRevisionPageOut`; an absent plan is a product state, not an empty
  Wireframe substitute;
- Edit creates one transient local draft. Intent IDs remain stable and are not
  editable after creation; label, visitor goal, and optional AI guidance remain
  explicit fields. Reorder and remove use native buttons with visible focus and
  44px targets on narrow layouts;
- Save first submits `page.intent.replace` to ChangeSet Preview. The inspector
  then shows the server summary, warnings/blockers, approval state, Apply, and
  Discard. It never writes on blur, inserts local canvas sections, or announces
  success before the new revision is read back;
- when a historical Wireframe has orphaned IDs, the UI may offer an explicit
  “Use current Wireframe structure” starting action. It retains the exact
  section/intent IDs and labels, but requires the user to supply page purpose
  and section goals before Preview. No label-to-goal inference is persisted;
- the Wireframe rail and inspector render the server traceability state and
  exact missing/orphaned counts. Unknown references block further composition
  Preview until the Sitemap plan is reconciled; missing compositions remain an
  explicit progressive-work state;
- pending, validation, Preview blocker, approval, Apply failure, conflict,
  offline, read-only, and successful revision reconciliation are distinct. New
  copy ships in `zh-CN` and `en-US`.

The interaction remains part of the existing full-screen editor rather than a
stack of dashboard cards. It uses the shared inspector rhythm, neutral surfaces,
one Action Blue decision path, restrained property transitions, native form
semantics, and reduced-motion-safe feedback.

### 34. Agent Wireframe generation workbench

The Wireframe stage gains the same review-first Agent workflow as the durable
backend contract without turning the inspector into a chat transcript:

- the selected page is the generation scope. An unplanned page or an orphaned
  historical Wireframe exposes a precise reconciliation message and cannot
  start generation;
- eligible Agents are filtered by availability, Build mode, and the exact
  `builder.wireframe.generate` grant. Starting sends `agentId` directly and
  never creates an invisible Thread or Run;
- objective, candidate count, active progress, cooperative cancel, structured
  candidate failures, and recovery after refresh are explicit. Inputs lock only
  while the exact stage/page generation is active;
- each result renders the server ChangeSet summary, affected page/section
  counts, warning/blocker evidence, and approval state. The canvas may preview
  the selected server candidate, but Apply remains a separate labelled action
  and the canonical revision reload is the only success signal;
- the global assistant toolkit registers an exact
  `builder.wireframe.generate` backend renderer. Pending approval, rejection,
  expiry, execution failure, queued/running progress, partial success,
  terminal failure, cancellation, and candidate-ready states are distinct.
  The renderer polls the same generation resource and does not duplicate
  validation or Apply logic;
- all stage and Tool copy ships in `zh-CN` and `en-US`, uses native controls,
  visible focus, 44px narrow-layout targets, neutral status surfaces, and
  reduced-motion-safe progress.

The workbench does not insert model output into local canvas state, fabricate a
Wireframe for an empty page, auto-select success, auto-approve, auto-apply, or
claim renderer/publication readiness.

Focused Admin verification passes 5 files / 51 tests covering the API payload,
exact stage/page deep link, no hidden Thread or Run, recovery and cancellation,
server-candidate Preview, explicit Apply, blocked unplanned pages, and every
assistant-ui Tool status branch. The full Admin gate passes 4/4 tasks with 321
files / 1455 tests; cross-app `pnpm check` passes all 8 tasks.

Authenticated browser verification uses the Builder-managed QA Project and the
exact Wireframe/page deep link. The recovery request returns 200, the selected
page and two canonical intents render, no validation toast or console error is
present, and the generation action remains disabled until a real objective is
provided. At 1024x768 the Inspector retains its vertical scroll container, its
primary control is 44px high, and no element exceeds the viewport. A local
Radix ScrollArea inner-table width override is intentionally scoped to this
Inspector; its regression is covered in the Editor DOM suite. Stable evidence:

- `reports/wave-3g-wireframe-generation-desktop-2026-07-22.png`
- `reports/wave-3g-wireframe-generation-narrow-2026-07-22.png`
- `reports/wave-3g-target-project-boundary-2026-07-22.png`

The user-specified source-managed Project remains on the explicit
migration-required boundary. Browser verification did not start a real
generation, Apply a candidate, publish, or migrate either Project.

### 35. Global-section reference review workbench

The Wireframe inspector consumes the revision-bound global-section catalog and
server dependency graph instead of treating `globalReferenceId` as a free text
field:

- the selected section shows its local composition and explicit shared-section
  state. A searchable selector lists only exact manifest-pinned reusable
  sections with product title, locale, version, planning/traceability state,
  and incoming dependency count;
- selecting or clearing a reference submits
  `wireframe.set_global_reference` or
  `wireframe.clear_global_reference` to ChangeSet Preview. The canvas may show
  the server candidate, but Apply remains a separate labelled action and only
  a reloaded Site Revision is success;
- Preview renders exact affected hosts, dependency edges, unknown/missing
  targets, and deterministic cycle paths. The browser never runs its own graph
  algorithm, guesses a target version, auto-clears a bad reference, or falls
  back to a similarly named legacy Site Settings entry;
- a global section without a plan or Wireframe is an explicit incomplete state,
  not a disabled-looking success. Planning uses the same review-first intent
  editor and the typed `global_section.intent.replace` command;
- while a reference is active, the inspector explains that shared structure is
  authoritative and retains the local component only as reversible context.
  Clearing is explicit; changing the referenced reusable section affects every
  dependent host projected by the server;
- read-only, offline, stale base, permission failure, Preview blocker, required
  approval, Apply failure, and successful revision reconciliation remain
  distinct. New copy ships in `zh-CN` and `en-US`.

The workbench stays inside the existing full-screen Wireframe scene. It uses a
compact neutral selector/impact disclosure, native labelled controls, visible
focus, 44px narrow-layout targets, restrained property transitions, and
reduced-motion-safe feedback. It does not add a dashboard card stack, a second
global-section manager, or a client-authored canvas graph.

### 36. Coordinated composition workbench

The Wireframe stage extends its review-first Agent surface from one selected
page to an explicit ordered target set without turning the canvas into a batch
job dashboard:

- the current page remains the initial target. A compact target control can add
  other planned pages and planned reusable sections from the exact revision,
  reorder them to express site-flow priority, and remove them before start;
- each row shows target kind, product title, locale/route or reusable slug,
  pinned version, planning/traceability state, and shared dependency impact.
  Unplanned, missing-version, incompatible-catalog, and graph-blocked targets
  remain visible with precise reasons but cannot enter an executable scope;
- start sends the complete typed target tuple, exact revision/ETag, Agent,
  objective, locale, and candidate count. It never creates one hidden request
  per page, an invisible Thread/Run, or local placeholder Wireframes;
- recovery matches the complete ordered target tuple. The active surface shows
  target count and names, one durable Job progress state, cooperative cancel,
  per-candidate failures, and stale-revision evidence after reload;
- each candidate review groups server-authored operations and affected targets
  by host while retaining one ChangeSet approval and one Apply action. The
  canvas may inspect one host candidate at a time, but cannot apply only that
  page or merge locally edited fragments;
- after Apply, the Editor reloads the returned canonical Site Revision and
  reconciles every affected canvas. A partial local success or optimistic
  per-page mutation is never presented as completion.

If one or more selected targets lack planning, the workbench explains the
planning requirement and offers one explicit “Plan first” workflow through the
multi-family Saga. Planning review and composition review remain
separate persisted phases with their own revision evidence and Apply actions.
The UI never automatically accepts the planning candidate merely to enable
Wireframe generation.

“Plan first” creates one persisted `BuilderCompositionSaga`; it does not remove
the blocked targets, create local intents, or submit one request per row. The
workbench recovers that parent by the exact ordered target tuple and renders a
single phase rail with these product states: planning in progress, planning
review required, composition in progress, composition review required,
completed, failed, and cancelled. Child Job identity, source/result Revision,
waiting reason, and structured failure remain inspectable without exposing raw
provider output.

At planning review, the primary action applies only the selected planning
ChangeSet through the existing Apply API. After the returned Site Revision is
reconciled, the client submits the persisted Apply evidence to the Saga phase
transition resource. A lost response leaves the Saga recoverable at the same
review gate; the UI can identify the already-applied candidate and resume
idempotently. Composition starts only from the server-returned new Revision.
The same sequence is repeated at composition review before the Saga is shown as
completed. At no point does the browser merge operation families, infer target
coverage, or mark a phase complete from local state.

The surface uses the existing inspector/canvas hierarchy, quiet neutral target
rows, one Action Blue start/apply decision at a time, native labelled controls,
visible focus, 44px narrow-layout targets, and reduced-motion-safe progress.
New copy ships in `zh-CN` and `en-US`. The browser does not compute candidate
coverage, dependency cycles, version validity, or transaction success.

### 37. Shared-section lifecycle workbench

The Sitemap scene gains one compact “Shared sections” entry beside page
creation. It opens a focused management dialog rather than a second dashboard
or a free-form Content Library shortcut. The list is sourced only from the
current Builder revision and shows title, stable key, locale, pinned version,
planning state, Wireframe state, and server-reported incoming reference count.

Creation is a two-step typed command:

- the form collects product name, stable key, locale, optional purpose, and
  optional default fields; the browser submits `global_section.create` with the
  exact current Revision/ETag and cannot choose a model key;
- a real Preview shows normalized identity, affected targets, permissions,
  issues, and approval state. Apply is enabled only when Preview has no blocker;
  success means the Editor has reloaded the returned canonical Site Revision.

Retirement starts from one exact listed shared section. Its review shows pinned
version and every incoming host supplied by the server graph. References make
the action blocked and direct the user to clear those exact Wireframe bindings
first; the dialog never offers “delete anyway”. When there are no incoming
references, the user must still review the destructive approval before Apply.
The row remains visible until revision reconciliation proves removal.

Create Preview failure, delete dependency blocker, approval required, Apply
failure, stale Revision, permission/read-only state, offline state, and
successful reconciliation are distinct. Closing or editing the form discards
the local Preview rather than reusing stale evidence. Product copy ships in
`zh-CN` and `en-US`; controls retain visible labels/focus, 44px narrow-layout
targets, restrained transitions, and reduced-motion-safe progress.

The browser does not create a local shared-section node, select
`reusable-section`, calculate dependency validity, clear references, mutate
legacy Site Settings, or treat a successful Preview as a successful Apply.

### 38. Design authoring workbench

The Design stage becomes available only when the current Revision contains a
selected page with a valid Wireframe and the exact component catalog/Design
System inputs can be loaded. It is not a blank free-form canvas and does not
edit the legacy PageBlueprint graph in browser memory.

Desktop composition:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Back · Project · Revision    Sitemap Wireframe Style Guide Design  Preview │
├──────────────┬──────────────────────────────────────────────┬──────────────┤
│ Pages/layers │ real revision-pinned visitor canvas          │ Properties   │
│ section tree │ selection outline + state/viewport preview   │ Style        │
│              │                                              │ Responsive   │
│              │                                              │ Asset / SEO  │
├──────────────┴──────────────────────────────────────────────┴──────────────┤
│ source + evidence        Desktop · state     zoom       review / revision │
└────────────────────────────────────────────────────────────────────────────┘
```

The section rail is projected from the exact Wireframe. Selecting a section
updates the real renderer canvas and constrained inspector. The inspector lists
only catalog-declared style slots, states, breakpoints, and image-capable slots;
token choices come from the pinned Design System. It cannot expose arbitrary
CSS, JSON, HTML, component keys, content bindings, or interaction targets.
The exact Wireframe checksum, default theme, breakpoint set, and compatible
token choices are server projections. The browser neither hashes Wireframe JSON
nor ships a fixed token inventory.

Every edit follows one review-first sequence:

1. local form state creates typed `design.*` intent against the exact Revision,
   draft version, and Wireframe checksum;
2. server Preview returns normalized Blueprint candidates, before/after source,
   issues, affected targets, approval, and signed token;
3. the canvas may render the candidate as an explicitly labelled Preview, but
   the toolbar and revision badge remain canonical;
4. Apply is the only save action. Success reloads the returned/current Site
   Revision before clearing review state; failure keeps the candidate and exact
   error visible.

Product states are distinct:

| State | UI contract |
| --- | --- |
| Loading | Stable editor chrome and shape-matched page/inspector skeleton |
| No page | Page selection prompt; no fabricated canvas |
| Wireframe missing/invalid | Blocked explanation linking to Wireframe stage |
| Blueprint absent | Labelled “Wireframe preview”; initialize Design is the primary action |
| Canonical Design | Real visitor render with source and Revision evidence |
| Candidate review | Before/after summary, issues, affected targets, Apply/Discard |
| Conflict | Base/current Revision evidence and explicit re-preview |
| Offline | Read-only canvas; no queued Apply or fake save state |
| Error | Inline cause, retry, correlation detail when available |
| Read-only | Inspect and Preview remain available; mutation controls explain permission |

Viewport and component-state switches are inspection controls, not persisted
until a typed Design operation changes a corresponding visual override. Focus,
hover, active, loading, empty, error, and overflow previews must be reachable
without pointer-only interaction. Canvas selection has a visible focus ring,
the rail uses native buttons/list semantics, icon controls have accessible
names, and narrow-layout targets remain at least 44px. Motion communicates
selection, panel entry, and Preview replacement only; it targets transform/
opacity, remains under 300ms, and honors reduced motion.

New copy ships in `zh-CN` and `en-US`. The recognizable visual decision is the
continuous trace from selected Wireframe section to visual state, server
Preview, and canonical Revision—not a dashboard card stack or decorative
canvas effect. AI Design generation, automated accessibility execution,
asset/font rights, compiler/publish actions, comments, and server undo/redo
remain visibly unavailable until their own contracts are implemented.

#### 38.1 Wave 3L implementation evidence

The Admin implementation now keeps one continuous evidence chain from the
selected page and Wireframe section through component state, catalog style
slot, resolved Design token, reviewed server candidate, and canonical Site
Revision. The Design stage is capability-gated, uses the shared canonical
`SiteRenderer`, labels `wireframe_preview` versus `visual_blueprint`, and keeps
the canvas canonical while a server candidate is under review. Apply requires
the signed Preview token and only reconciles after the returned Builder
aggregate is loaded.

The constrained inspector emits `design.initialize`, base style set/clear, and
responsive style set/clear operations with the exact Revision ID, ETag, draft
version, and server-projected Wireframe checksum. Missing Wireframe,
read-only, offline, component-catalog failure/retry, Preview failure, and Apply
failure remain explicit states without queued writes or local-success copy.

Verification on 2026-07-22 passes the focused Editor suite with 44 tests, the
shared SiteRenderer suite with 6 tests, `pnpm admin:check` with 339 test files
and 1570 tests, and the cross-app `pnpm check` with all 8 tasks successful.
React Doctor completed with exit code 0; its 116 warnings are existing
changed-worktree findings and do not identify the Wave 3L Design stage,
inspector, or renderer implementation. This evidence accepts the Wave 3L
authoring slice only. AI Design generation, asset/font authorization,
automated accessibility execution, compiler/release activation, thumbnail
capture, comments, server undo/redo, and final real-data visual convergence
remain gated.

### 39. AI-assisted Design generation workbench

Wave 3M adds one review-first Agent surface inside the existing Design stage.
It does not add a second canvas, an image-to-HTML shortcut, or a browser-owned
Visual Blueprint. The current selected page is the initial authoring scope and
must belong to the exact loaded Site Revision, contain a valid Wireframe, and
resolve the pinned Design System and component catalog before generation can
start.

The Inspector exposes a compact “Design with an Agent” section above manual
style-slot controls. It contains:

- an eligible Agent selector filtered by the `builder.design.generate` grant;
- a product objective and one-to-three direction count;
- explicit start and cooperative cancel actions;
- persisted Job phase/progress, per-direction failures, and recovery evidence;
- server-owned candidate choices with operation, affected-target, blocker, and
  approval summaries.

Starting from the stage sends the selected page, exact Revision/ETag, direct
Agent identity, objective, locale, and candidate count. Starting from a chat
uses the existing Run-backed `builder.design.generate` approval Tool with the
same selected page identity. Neither entry creates a hidden conversation or a
replacement Run. Refresh recovers the active or latest terminal generation by
the exact `design` stage and selected target tuple.

Selecting a candidate may replace the renderer input with the candidate's
server Preview and labels it as an Agent direction. The revision badge,
canonical source evidence, and saved-state language remain unchanged. Manual
style controls are disabled while a generation is active or any Design Preview
is under review. Apply uses the candidate's signed Preview token and approval;
only a successful canonical Builder reconciliation clears the review and
updates the canvas. Discard never cancels, deletes, or rewrites the persisted
candidate.

Loading, no page, missing Wireframe, stale catalog, read-only, offline, active,
partial, failed, cancelled, recovery failure, candidate blocker, Apply failure,
and stale Revision are separate product states. The surface uses the existing
quiet Inspector hierarchy, labelled controls, visible focus, 44px narrow-layout
targets, transform/opacity-only restrained motion, and reduced-motion-safe
progress. New copy ships in `zh-CN` and `en-US`.

The browser never asks the model for HTML, CSS, JSON Patch, arbitrary token
paths, component identities, assets, SEO, or publish actions. It never merges
candidate operations, fills missing targets, calculates checksums, auto-selects
success, auto-applies, or treats a candidate as canonical. Asset/font rights,
automated accessibility execution, compiler output, release activation,
thumbnail capture, comments, and server undo/redo remain gated.

### 39.1 Wave 3M implementation evidence

The Design Inspector now mounts the direct Agent generation workbench backed by
`use-project-design-generation.ts`, while `design-generation-panel.tsx` renders
persisted progress, recovery, candidate review, blocker, cancel, discard, and
explicit Apply states. The assistant-ui toolkit registers the same
`builder.design.generate` contract through `design-generate-tool.tsx`; neither
entry creates a hidden Thread or writes a candidate to the canvas.

Fresh focused verification on 2026-07-22 passes 74 tests across the Design Tool
contract, assistant-ui toolkit, and Editor page. Candidate Preview remains
visibly non-canonical and successful Apply reconciles only from the returned
Builder aggregate. Compiler/release activation, automated accessibility,
asset/font rights, thumbnails, comments, server undo/redo, and final visual
convergence remain gated.

## 40. Wave 4 Website Config workbench

Website Config is the visitor-facing settings workbench beside the creation
editor, not a second Project General screen. Its section navigation keeps three
explicit workspaces: public identity, browser/discovery, and localization. The
identity workspace owns the public name, optional tagline, description, current
public URL, support inbox, and localized variants. Browser/discovery owns logo,
favicon, social image, title policy, indexing, and sitemap defaults.
Localization retains the existing language and time-display contract. Domains
and Design System authoring are not duplicated here.

Identity and discovery use the same live visitor-preview rail. On wide layouts
the settings axis and a sticky preview remain visible together; narrow layouts
stack without horizontal overflow. Identity previews the current unsaved name,
tagline, description, address, logo/favicon, and support state inside a quiet
browser frame. Discovery previews the exact unsaved title policy, search result,
Open Graph card, favicon, description, URL, and noindex state. The preview is
explicitly local until Save; it never represents a draft as published.

The form continues to submit the real project settings patch and invalidates
both core settings and generated project source on success. Validation failures
remain explicit. Read-only mode disables every mutation surface, including the
title-policy presets, separator, home rule, dedupe, indexing, sitemap, and asset
actions. Shared setting switches now expose their visible label as the
accessible name.

The former 900-line mixed component is split by responsibility into identity,
discovery, localized-field, preview, and orchestration modules. The shared
sticky page header no longer feeds its measured height back into its own
minimum height; the measured variable is now output-only for dependent sticky
offsets. This removes the narrow-layout ResizeObserver feedback that expanded a
183px Website Config header to 711px.

Fresh verification on 2026-07-22 passes the 20-test focused page-shell and
Website Config suite and `pnpm admin:check` with 343 test files / 1591 tests.
Changed-scope repository review reports zero findings. Browser acceptance at
1440px and the 500px minimum DevTools viewport confirms live form-to-preview
updates, stable wide two-column composition, narrow stacking, named switches,
and zero horizontal overflow. React Doctor remains a branch-wide 56/100 across
the accumulated `develop` to `main` delta; it reports no finding in this Website
Config or page-shell slice.

## 41. Wave 4 Project General workbench

Project General is the team-facing identity and lifecycle workbench, not a
second Website Config screen. It owns the Project name, description, icon,
authoring/runtime context, access summary, stable internal identifiers,
archive, and permanent deletion. Public site name, metadata, locale, browser
assets, URL selection, and SEO remain in Website Config or Domains.

The identity axis is one React Hook Form/Zod form with explicit character
limits, dirty/saving/saved status, Save, and Reset. Its icon action receives
only the real Project ID/name and canonical icon fields; it must not construct
a list-card projection with invented operational data. A successful mutation
invalidates the Project detail, project cards, global navigation, and table
queries before reporting success.

The context rail renders canonical lifecycle state, authoring authority,
primary runtime state, access state, slug, Project/workspace IDs, and authoring
revision. Loading, read-only, permission failure, no runtime, inactive runtime,
active runtime, migration-required, and archived states remain distinct. A
permission failure is visible and keeps all mutations disabled.

Archive and delete use the server capability projection before enabling their
dialogs. Capability loading and failure are visible, blocked reasons are
associated with their controls, and permanent deletion requires an exact match
with the server-projected Project name. These commands never share the normal
identity form and never optimistically remove the Project.

All Project Settings routes share one searchable navigation model. Wide
viewports keep the side navigation; narrow viewports expose a labelled trigger
and localized left Sheet with General, API, Environments, and Databases. The
alternate entry is keyboard-native, returns the same routes, and does not
introduce horizontal overflow.

Fresh focused verification passes 4 Admin files / 20 tests, targeted Oxlint,
targeted Oxfmt, and explicit-file diff checks. Browser acceptance at 1440px,
800px, and 500px verifies save feedback, permission/lifecycle presentation,
archive/delete confirmation without executing either mutation, localized
navigation, and zero horizontal overflow. Branch-wide React Doctor reports
61/100 with 217 warnings and no Project General component finding.

The full Admin typecheck is not accepted for this checkpoint because a
concurrent Observability route test contains two unrelated `SearchRoute`
conversion errors. Typed identity/defaults facades, optimistic concurrency,
stable errors, Activity evidence, and Agent grants remain backend gates.

## 42. Website Config resolved-domain ownership

Website Config must not present a manual public URL beside Domains. The Admin
loads the existing project Domain bindings with the Domains query key and
projects exactly one display address: active and verified primary first, then
the first active verified binding, otherwise unavailable. Pending, disabled,
and unverified bindings are never presented as routable.

The Identity workspace renders this address as read-only operational context
with a “Manage domains” route. Identity and Browser/Discovery previews use the
same value. The identity mutation omits legacy `site.url`; it cannot silently
fall back to that field when Domain loading fails or no routable binding
exists. Domain load failure participates in the page error state, and Retry
reloads both Core Settings and Domain bindings.

The shared resolver keeps local platform domains visible in the preview while
the separate openable-link policy continues to suppress unsupported external
navigation to `.arclayer.localhost`. This frontend convergence does not replace
the still-required typed backend website/runtime facade, optimistic
concurrency, Activity evidence, or Agent grants.
