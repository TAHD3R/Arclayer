# @arclayer/cli

Operational command surface for Arclayer.

## Usage

```bash
pnpm -C packages/cli build
node packages/cli/dist/bin.js --help
node packages/cli/dist/bin.js config dump --api-url http://localhost:8000 --token "$ARCLAYER_TOKEN" --out arclayer-config.json
node packages/cli/dist/bin.js config restore --api-url http://localhost:8000 --token "$ARCLAYER_TOKEN" --file arclayer-config.json
```

## Commands

### `config dump`

Reads system settings namespaces through the generated OpenAPI client and writes a JSON dump.

Required options:

- `--api-url <url>`
- `--token <bearer-token>`

Optional options:

- `--out <file>` writes to a file. Without it, JSON is printed to stdout.
- `--page-size <number>` controls namespace pagination.

### `config restore`

Reads a dump created by `config dump` and patches each namespace through the generated OpenAPI client.

Required options:

- `--api-url <url>`
- `--token <bearer-token>`
- `--file <file>`

### `content export` and `content import`

The command entries exist for the F05 operational surface. They exit non-zero with an explicit message until backend transfer routes are exposed through OpenAPI.

### `generate`

Generator command entries are reserved for future expansion. They exit non-zero with an explicit message until generator contracts are defined.
