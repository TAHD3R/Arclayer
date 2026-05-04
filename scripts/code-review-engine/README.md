# Code Review Engine

Standalone monorepo consistency audit engine.

## Status

This project contains the migrated audit rule set from
`apps/api/src/core/audit`, decoupled into `scripts/code-review-engine`:

- standalone package under `scripts/code-review-engine`
- scope-aware CLI contract (`full/backend/frontend/module/package/changed/rules`)
- stable report models and JSON envelope
- executable migrated rule registry with scope filtering
- basic reporters (`json`, `human`, `markdown`)
- report artifact writing with optional `-o/--output` override
- CLI and registry tests for real finding behavior

The current rules are prototype quality because several rules still mirror the
old audit engine heuristics. The engine now runs those rules and reports real
findings, including current blocker-level backend architecture findings.

## Local usage

From repo root:

```bash
pnpm code-review-engine --help
pnpm code-review-engine --scope backend --format json
pnpm code-review-engine --scope module --module analytics --format human
pnpm code-review-engine --rules service.no-direct-orm --format json
pnpm code-review-engine --scope full --format json --output reports/code-review-engine/full.json
pnpm code-review-engine --list-rules
```

Direct package commands:

```bash
pnpm -C scripts/code-review-engine cli --help
pnpm -C scripts/code-review-engine test
```

## Report Artifacts

The CLI writes the selected report format to stdout and writes the same content
to a report artifact.

Default artifact location:

```text
reports/code-review-engine/<UTC_TIMESTAMP>-<scope>.<ext>
```

Use `-o/--output` to set an explicit artifact path:

```bash
pnpm code-review-engine --scope full --format json --output reports/code-review-engine/full.json
pnpm code-review-engine --scope module --module analytics --format markdown --output reports/code-review-engine/analytics.md
```

The engine creates parent directories for the output path. The repository
standard location is `reports/code-review-engine/`.

## Rule Catalog

### Engine

- `engine.scope-isolation` `[BLOCKER]`
- `engine.rule-metadata-required` `[BLOCKER]`

### Backend Layers

- `service.no-direct-orm` `[BLOCKER]`
- `repository.must-extend-tortoise-orm` `[BLOCKER]`
- `repository.no-business-logic` `[MAJOR]`
- `entity-manager.no-dataclass-return` `[BLOCKER]`
- `entity-manager.no-any-fields` `[BLOCKER]`
- `entity-manager.write-must-use-em` `[BLOCKER]`
- `schema.no-any-dict-fields` `[MAJOR]`
- `schema.must-extend-base` `[MAJOR]`
- `endpoint.missing-response-model` `[MAJOR]`
- `endpoint.missing-docstring` `[MINOR]`

### Backend Architecture

- `architecture.orm-leak` `[BLOCKER]`
- `architecture.write-path-violation` `[BLOCKER]`
- `architecture.router-no-direct-repository` `[BLOCKER]`
- `lifecycle.must-dispatch-hooks` `[BLOCKER]`
- `lifecycle.missing-subscribers` `[MAJOR]`
- `hard-cut.no-dual-repo-pattern` `[BLOCKER]`
- `hard-cut.no-shim-facade` `[BLOCKER]`

### i18n, Plugins, Tests, Filesystem

- `i18n.missing-t-call` `[MAJOR]`
- `i18n.invalid-key-format` `[MINOR]`
- `i18n.invalid-namespace` `[MINOR]`
- `plugin.must-register-lifecycle` `[MAJOR]`
- `plugin.must-have-locales` `[MINOR]`
- `test.missing-module-tests` `[BLOCKER]`
- `test.missing-core-tests` `[BLOCKER]`
- `test.no-skipped-without-rationale` `[MAJOR]`
- `filesystem.module-structure` `[MINOR]`

### Frontend

- `frontend.no-any` `[MAJOR]`
- `frontend.route-no-api-calls` `[MAJOR]`
- `frontend.data-must-use-react-query` `[MAJOR]`
- `frontend.page-structure` `[MINOR]`
