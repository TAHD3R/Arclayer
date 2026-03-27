# Content Library Article Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Plate-backed article editor to the Contents Library branch with shared split/page editor shells, autosaved drafts, explicit publish actions, and Notion-like document header/menu structure.

**Architecture:** Keep article editing under the `/content/library` route family and split the work into shell-first slices. First establish a shared article editor shell and route continuation, then wire frontend API/types to current canonical version endpoints, and only then mount Plate for the body document. Treat title/summary/cover/icon as structured editor-header fields and store the body as `rich_text_document` inside version presentations.

**Tech Stack:** TanStack Router, React 19, TanStack Query, Vitest, i18next, `@arclayer/ui`, FastAPI canonical content version APIs, Plate editor.

---

### Task 1: Add RED tests for article editor routing and shell ownership

**Files:**
- Modify: `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`
- Create: `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- Reference: `docs/plans/2026-03-27-content-library-article-editor-design.md`

**Step 1: Write the failing tests**

Cover these behaviors:

- split preview toolbar renders `close` and `maximize` actions with tooltips
- maximize action navigates into a page editor route under `/content/library`
- page editor route still keeps the `Contents Library` navigation branch active
- page editor shell renders a toolbar, document menu trigger, title field, summary field, and empty body area

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx
```

Expected: FAIL because the page route and shared editor shell do not exist yet.

**Step 3: Commit the RED tests**

```bash
git add apps/admin/test/pages/workspaces/content/content-library-page.test.tsx apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx
git commit -m "test(content-library): add article editor shell red tests"
```

### Task 2: Create the article editor route and shared shell scaffold

**Files:**
- Create: `apps/admin/src/routes/w/$workspaceId/content/library/$itemId/index.tsx`
- Create: `apps/admin/src/routes/w/$workspaceId/content/library/$itemId/index.lazy.tsx`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/page.tsx`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx`
- Modify: `apps/admin/src/constants/menu/workspaces.ts`
- Modify: `apps/admin/src/pages/workspaces/content/library/components/content-library-preview-panel.tsx`
- Modify: `apps/admin/src/pages/workspaces/content/library/page.tsx`
- Modify: `apps/admin/src/lib/routing/workspace-content-routing.ts`

**Step 1: Build the route and shell scaffold**

Implement:

- page editor route under the library branch
- `Split Mode` preview toolbar buttons: close + maximize, each with tooltip
- shared shell component that can render in `split` or `page` mode
- route helper for article page continuation
- sidebar/nav active matching so the branch remains `Contents Library`

**Step 2: Run focused tests**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx
```

Expected: PASS.

**Step 3: Commit the shell scaffold**

```bash
git add apps/admin/src/routes/w/$workspaceId/content/library/$itemId/index.tsx apps/admin/src/routes/w/$workspaceId/content/library/$itemId/index.lazy.tsx apps/admin/src/pages/workspaces/content/library/article-editor/page.tsx apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx apps/admin/src/constants/menu/workspaces.ts apps/admin/src/pages/workspaces/content/library/components/content-library-preview-panel.tsx apps/admin/src/pages/workspaces/content/library/page.tsx apps/admin/src/lib/routing/workspace-content-routing.ts apps/admin/test/pages/workspaces/content/content-library-page.test.tsx apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx
git commit -m "feat(content-library): add article editor route shell"
```

### Task 3: Expose article editor API/types from canonical content versions

**Files:**
- Modify: `apps/admin/src/types/api/content.ts`
- Modify: `apps/admin/src/api/content.ts`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/api.ts`
- Create: `apps/admin/test/pages/workspaces/content/content-library-article-editor-api.test.ts`
- Reference: `apps/api/src/modules/workspaces/content/items/router.py`
- Reference: `apps/api/src/modules/workspaces/content/contracts/schema.py`

**Step 1: Add the editor-facing contracts**

Add frontend types and API functions for:

- loading a single content item snapshot and active draft version
- reading version presentations / `rich_text_document`
- saving a draft version
- patching the active draft version
- publishing the active draft version

Keep the type layer explicit about:

- header fields in `fields_snapshot`
- body document in `presentations`
- SEO payload remaining separate from the body document

**Step 2: Run focused tests**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-article-editor-api.test.ts
```

Expected: PASS.

**Step 3: Commit the API slice**

```bash
git add apps/admin/src/types/api/content.ts apps/admin/src/api/content.ts apps/admin/src/pages/workspaces/content/library/article-editor/api.ts apps/admin/test/pages/workspaces/content/content-library-article-editor-api.test.ts
git commit -m "feat(content-library): expose article editor version apis"
```

### Task 4: Render the document header and save-state chrome without Plate

**Files:**
- Modify: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-toolbar.tsx`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-header.tsx`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-menu.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- Modify: `locales/en-US/content.json`
- Modify: `locales/zh-CN/content.json`

**Step 1: Implement shell-first editor chrome**

Render:

- autosave status slot
- explicit publish action slot
- top-right document menu trigger (`...`)
- cover/icon hover affordance placeholders
- editable title field
- editable summary field
- empty body container placeholder

Do not mount Plate yet. This slice is for hierarchy and IA.

**Step 2: Run focused tests**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-article-editor-page.test.tsx
```

Expected: PASS.

**Step 3: Commit the header and chrome slice**

```bash
git add apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-toolbar.tsx apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-header.tsx apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-menu.tsx apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx locales/en-US/content.json locales/zh-CN/content.json
git commit -m "feat(content-library): add article editor document chrome"
```

### Task 5: Integrate Plate for the article body

**Files:**
- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/plate/*`
- Modify: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`

**Step 1: Add Plate dependencies and minimal editor kit**

Install and wire the minimal Plate stack required for:

- editable body canvas
- paragraph + heading support
- slash command
- line-leading add button
- drag handle
- drag-handle menu scaffold

Do not add advanced AI/collab packs in the first pass.

**Step 2: Run focused tests**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-article-editor-page.test.tsx
```

Expected: PASS.

**Step 3: Commit the Plate integration**

```bash
git add apps/admin/package.json apps/admin/src/pages/workspaces/content/library/article-editor apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx
git commit -m "feat(content-library): mount plate article editor"
```

### Task 6: Wire autosave draft persistence and publish actions

**Files:**
- Create: `apps/admin/src/pages/workspaces/content/library/article-editor/use-content-library-article-editor.ts`
- Modify: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-page.test.tsx`

**Step 1: Add the editor controller**

Implement:

- initial draft load
- editor state hydration from `fields_snapshot` + `rich_text_document`
- debounced autosave to draft
- visible save state (`saving`, `saved`, `error`)
- publish / update-published action
- split/page mode sharing the same controller logic

**Step 2: Run focused tests**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-page.test.tsx
```

Expected: PASS.

**Step 3: Commit persistence**

```bash
git add apps/admin/src/pages/workspaces/content/library/article-editor/use-content-library-article-editor.ts apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-shell.tsx apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx apps/admin/test/pages/workspaces/content/content-library-page.test.tsx
git commit -m "feat(content-library): wire article autosave and publish"
```

### Task 7: Add document menu sections for status, visibility, slug, and SEO

**Files:**
- Modify: `apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-menu.tsx`
- Modify: `apps/admin/src/pages/workspaces/content/library/article-editor/use-content-library-article-editor.ts`
- Modify: `apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx`
- Modify: `locales/en-US/content.json`
- Modify: `locales/zh-CN/content.json`

**Step 1: Implement menu-backed document settings**

Add inline items and submenus for:

- status
- visibility
- slug/path
- SEO fields

Keep them in the menu, not a side inspector.

**Step 2: Run focused tests**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-article-editor-page.test.tsx
```

Expected: PASS.

**Step 3: Commit menu-backed metadata**

```bash
git add apps/admin/src/pages/workspaces/content/library/article-editor/content-library-article-editor-menu.tsx apps/admin/src/pages/workspaces/content/library/article-editor/use-content-library-article-editor.ts apps/admin/test/pages/workspaces/content/content-library-article-editor-page.test.tsx locales/en-US/content.json locales/zh-CN/content.json
git commit -m "feat(content-library): add article document menu settings"
```

### Task 8: Run targeted verification

**Files:**
- Modify: `docs/plans/2026-03-27-content-library-article-editor-design.md`
- Modify: `docs/plans/2026-03-27-content-library-article-editor-implementation-plan.md`

**Step 1: Run focused frontend verification**

Run:

```bash
pnpm -C apps/admin exec vitest run --config vitest.config.ts test/pages/workspaces/content/content-library-page.test.tsx test/pages/workspaces/content/content-library-article-editor-page.test.tsx test/pages/workspaces/content/content-library-article-editor-api.test.ts test/pages/workspaces/content/content-library-row-actions.test.tsx test/pages/workspaces/content/content-library-table-columns.test.tsx
```

Expected: PASS.

**Step 2: Run targeted lint/type verification**

Run:

```bash
pnpm -C apps/admin exec oxlint src/pages/workspaces/content/library src/routes/w/\$workspaceId/content/library && (cd apps/admin && (pnpm exec tsc --noEmit --pretty false 2>&1 || true) | rg 'src/pages/workspaces/content/library|src/routes/w/\\$workspaceId/content/library|test/pages/workspaces/content/content-library-article-editor' || echo 'NO_MATCHING_ARTICLE_EDITOR_TSC_ERRORS')
```

Expected: `NO_MATCHING_ARTICLE_EDITOR_TSC_ERRORS` or only pre-existing unrelated diagnostics.

**Step 3: Commit verification updates**

```bash
git add docs/plans/2026-03-27-content-library-article-editor-design.md docs/plans/2026-03-27-content-library-article-editor-implementation-plan.md
git commit -m "chore(content-library): record article editor verification"
```
