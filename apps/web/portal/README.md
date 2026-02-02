# Portal (apps/web/portal)

Sprint 1 scope

- Vite SSR pipeline based on **vike**
- Vike uses **V1 design** (+files) from day 1 (avoid legacy _.page._ files)
- Routing powered by **TanStack Router**
- Hardcoded `DocumentIR` rendered on the server and hydrated on the client
- CSS variables injected into SSR `<head>` from runtime config

Non-goals (Sprint 1)

- No Admin UI
- No realtime OT/CRDT
- No backend API integration yet

Notes

- Vike page entry is a catch-all route at `pages/app/+route.ts` to ensure any URL can be SSR-rendered.
- TanStack Router does the actual routing inside the React shell (see `src/routes/**` and `src/router.ts`).

Sprint 2 (work in progress)

- Editor mode routes live under `/__editor/*` (portal-side only)
- A local `postMessage` test harness is available at `/__editor-host`
