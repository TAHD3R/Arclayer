# Arclayer Product Application

`apps/app` is the customer-facing Arclayer product. It owns workspace, project, content, site-building, publishing, billing, and account experiences.

It is not the deployment management console. Platform-wide administration belongs in `apps/platform`; server and API work belongs in `apps/api`.

## Commands

Run commands from the repository root:

```bash
pnpm app
pnpm app:build
pnpm app:check
```

Focused tests use the package filter:

```bash
pnpm --filter @arclayer/app test test/path/to/example.test.tsx
```

## Local Configuration

Copy `.env.example` to `.env.local` when using the local HTTPS setup. `VITE_SITE_ORIGIN` controls the default local site origin when that behavior is needed.