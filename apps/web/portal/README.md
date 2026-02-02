# Portal (apps/web/portal)

Sprint 1 scope

- Vite SSR pipeline based on **vike**
- Vike uses **V1 design** (+files) from day 1 (avoid legacy _.page._ files)
- Routing powered by **TanStack Router**
- API-backed `DocumentIR` rendered on the server and hydrated on the client (stub API in Sprint 1)
- CSS variables injected into SSR `<head>` from runtime config (API-first)

Non-goals (Sprint 1)

- No Admin UI
- No realtime OT/CRDT

Notes

- Vike page entry is a catch-all route at `pages/app/+route.ts` to ensure any URL can be SSR-rendered.
- TanStack Router does the actual routing inside the React shell (see `src/routes/**` and `src/router.ts`).

Sprint 2 (work in progress)

- Editor mode routes live under `/__editor/*` (portal-side only)
- A local `postMessage` test harness is available at `/__editor-host`
- Shared editor bridge lives in `packages/site-editor-bridge` (used by both Portal and Admin)
- Admin debug host page (iframe shell): `/debug/portal-editor`
- Preview mode routes live under `/__preview/*?token=...` (Sprint 1/2 protocol scaffolding)

Optional: API-backed route resolver (stub, for local dev)

Portal is API-only for route resolution (and content). For local dev:

- Portal server proxies `/api/*` to FastAPI.
  - Config lives at `apps/web/portal/.env.development`.
  - The dev script loads env via Node's `--env-file` (Node >= 20).
  - This keeps browser requests same-origin (no CORS needed) and keeps SSR deterministic.
  - Shared env naming: `VITE_API_PROXY_TARGET` matches the Admin app.

Local commands

- Start dev server: `pnpm -C apps/web/portal dev`
- Start production-like server (local): `pnpm -C apps/web/portal start:local`
