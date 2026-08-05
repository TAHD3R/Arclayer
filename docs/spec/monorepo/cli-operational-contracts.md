# CLI Operational Contracts

Status: Active implementation contract
Applies to: `packages/cli`, Product API commands, and Platform API commands

## Scenario: Arclayer CLI package commands

### 1. Scope / Trigger

- Trigger: adding or changing commands in `packages/cli`.
- Applies to operational commands that call Product or Platform HTTP endpoints, read/write local files, or expose future command placeholders.

### 2. Signatures

- Root command: `arclayer <command> <subcommand> [options]`
- Content export placeholder: `arclayer content export ...`
- Content import placeholder: `arclayer content import ...`
- Generator placeholder: `arclayer generate <target> [options]`

### 3. Contracts

- Commands must target an explicit Product or Platform domain contract.
- The CLI does not expose a global settings namespace dump or restore surface.
- Removed global configuration commands and `/api/v1/system/settings*` routes have no aliases.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| Backing API is absent | Exit non-zero with a direct message naming the missing API route surface |
| Removed global configuration command | Exit non-zero with `Unknown command: config` |

### 5. Good/Base/Bad Cases

- Good: a domain command calls only its canonical Product or Platform API.
- Base: root help lists only current command contracts.
- Bad: `content export`, `content import`, or `generate` reports success before backing APIs or generator contracts exist.

### 6. Tests Required

- Root-help tests proving removed commands are absent.
- Hard-cut tests proving `config` exits non-zero as an unknown command.
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
