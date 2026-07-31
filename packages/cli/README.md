# @arclayer/cli

Operational command surface for Arclayer.

## Usage

```bash
pnpm -C packages/cli build
node packages/cli/dist/bin.js --help
```

## Commands

### `content export` and `content import`

The command entries exist for the F05 operational surface. They exit non-zero with an explicit message until backend transfer routes are exposed through OpenAPI.

### `generate`

Generator command entries are reserved for future expansion. They exit non-zero with an explicit message until generator contracts are defined.
