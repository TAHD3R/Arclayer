# CLI Operational Contracts

## Scenario: Arclayer CLI package commands

### 1. Scope / Trigger

- Trigger: adding or changing commands in `packages/cli`.
- Applies to operational commands that call Admin or system HTTP endpoints, read/write local files, or expose future command placeholders.

### 2. Signatures

- Root command: `arclayer <command> <subcommand> [options]`
- Config dump: `arclayer config dump --api-url <url> --token <token> [--out <file>] [--page-size <number>]`
- Config restore: `arclayer config restore --api-url <url> --token <token> --file <file>`
- Content export placeholder: `arclayer content export ...`
- Content import placeholder: `arclayer content import ...`
- Generator placeholder: `arclayer generate <target> [options]`

### 3. Contracts

- `--api-url` is the base URL for the API server.
- `--token` is sent as `Authorization: Bearer <token>`.
- `config dump` reads `/api/v1/system/settings`, then reads each namespace at `/api/v1/system/settings/{namespace}`.
- `config restore` patches `/api/v1/system/settings/{namespace}` with `{ "patch": <namespace value> }`.
- Config dump files use this shape:

```json
{
  "format": "arclayer.config.dump",
  "version": 1,
  "exportedAt": "2026-05-01T00:00:00.000Z",
  "namespaces": [
    {
      "namespace": "storage",
      "value": {}
    }
  ]
}
```

### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| Missing required option | Exit non-zero with `Missing required option --<name>` |
| Invalid `--page-size` | Exit non-zero with `--page-size must be a positive integer` |
| Unsupported dump format | Exit non-zero with `Unsupported config dump format` |
| Invalid namespace entry | Exit non-zero with `Config dump contains an invalid namespace entry` |
| HTTP non-2xx response | Exit non-zero with response status and API error payload |
| Backing API is absent | Exit non-zero with a direct message naming the missing API route surface |

### 5. Good/Base/Bad Cases

- Good: `config dump` writes a JSON dump to stdout or `--out` after all namespace reads succeed.
- Base: `config restore` reads a dump file and restores each namespace once.
- Bad: `content export`, `content import`, or `generate` reports success before backing APIs or generator contracts exist.

### 6. Tests Required

- Parser tests for `--flag value` and `--flag=value`.
- Command tests for missing required options.
- Config dump tests covering stdout and file output.
- Config restore tests covering file input and patched namespace list.
- HTTP behavior tests covering paths, methods, auth header, request body, and envelope unwrapping.
- Placeholder tests proving future command entries exit non-zero.

### 7. Wrong vs Correct

#### Wrong

```typescript
return 0;
```

Using a success exit code for a command whose backing API is absent hides missing platform work.

#### Correct

```typescript
throw new CliError("Content transfer CLI commands require backend transfer routes exposed through OpenAPI.");
```

The command exists as a discoverable surface and fails explicitly until the route contract is implemented.
