# Portal Sprint 1 Implementation Notes

Date: 2026-02-02

This document describes how to verify the Sprint 1 deliverables for `apps/web/portal`.

## What is implemented (Sprint 1)
- SSR pipeline based on Vike (V1 design with `+` files)
- Client-side hydration (React 19)
- TanStack Router for in-app routing
- Hardcoded `DocumentIR` rendering (no backend integration yet)
- CSS variables injected into SSR `<head>` from runtime config
- Minimal error handling skeleton (404 via defaultNotFound, 403/500 via debug routes)

## How to run

### Install dependencies
From repo root:
```bash
pnpm -w install --no-frozen-lockfile
```

### Start Portal dev server (SSR)
```bash
pnpm -C apps/web/portal dev
```
Then open:
- `http://localhost:3100/`

### Typecheck / lint / format
```bash
pnpm -C apps/web/portal typecheck
pnpm -C apps/web/portal lint
pnpm -C apps/web/portal format
```

## What to verify

### 1) SSR output exists
Open `http://localhost:3100/` and view page source.
You should see rendered HTML content for the hardcoded DocumentIR (not an empty `<div>`).

### 2) Hydration happens
On the homepage, the hydration indicator should switch from `off` to `on`.

File: `apps/web/portal/src/components/HydrationStatus.tsx`

### 3) Hardcoded DocumentIR rendering works
Edit the hardcoded document:
File: `apps/web/portal/src/runtime/hardcoded-document.ts`

Change any block (e.g. heading text), refresh the page and verify the SSR output changes accordingly.

### 4) CSS variables are injected into SSR head (required)
Runtime config:
File: `apps/web/portal/src/runtime/runtime-config.ts`

SSR injection:
File: `apps/web/portal/renderer/+onRenderHtml.tsx`

Verify `<head>` contains:
```html
<style id="portal-css-vars">:root{...}</style>
```
Change any value (e.g. `--color-primary`) and refresh to verify the content changes in SSR output.

### 5) Error skeleton exists (minimal)
Routes:
- `http://localhost:3100/debug/403` (simulated 403)
- `http://localhost:3100/debug/500` (simulated 500)
- Any unknown route should render 404 (default not found component)

## Key design decisions
- Vike page-level routing is a catch-all route (`pages/app/+route.ts`) that always matches. This ensures any URL can be SSR-rendered.
- TanStack Router handles actual routing inside the React shell (`src/routes/**`).
- Theme tokens are injected as CSS variables in SSR to keep the runtime theming mechanism explicit and testable.
