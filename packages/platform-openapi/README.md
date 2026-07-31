# @arclayer/platform-openapi

Generated TypeScript SDK and boundary types for the independent Platform API composition.

Generate from the repository root:

```bash
pnpm --filter @arclayer/platform-openapi generate
```

The schema is exported from `src.platform_main:app`. Do not import Product API types from
`@arclayer/openapi`, re-export either package through a facade, or edit generated files by hand.
