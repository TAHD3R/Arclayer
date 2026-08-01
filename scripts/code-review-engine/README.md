# Code Review Engine

Standalone monorepo consistency audit engine.

## Status

This project contains the migrated audit rule set from
`apps/api/src/core/audit`, decoupled into `scripts/code-review-engine`:

- standalone package under `scripts/code-review-engine`
- scope-aware CLI contract (`full/backend/frontend/module/package/changed/rules`)
- stable report models and JSON envelope
- executable migrated rule registry with scope filtering
- finding-detail reporters (`json`, `human`, `markdown`)
- report artifact writing with optional `-o/--output` override
- CLI and registry tests for real finding behavior
- registry self-validation for rule metadata, implementation wiring, and
  blocking-rule eligibility

The current rules are prototype quality because several rules still mirror the
old audit engine heuristics. The engine now runs those rules and reports real
findings, including current blocker-severity backend architecture findings.

## Enforcement model

Rules carry both severity and stability:

- `prototype`: report-only. Findings are visible in reports but do not fail the
  CLI.
- `active`: stable enough to report as part of normal audits, but still
  report-only.
- `blocking`: stable, reproducible, and allowed to fail automation when the
  finding severity is `BLOCKER`.

The CLI exits with status `1` only when `summary.blocking_findings > 0`.
Prototype blocker-severity findings remain visible as report-only findings.
This keeps Hook automation from treating migrated heuristics as hard gates
until each rule is promoted through registry metadata.

The registry fails at startup if a rule has duplicate ids, incomplete metadata,
missing implementation, an implementation id mismatch, no supported scopes, or
`blocking` stability without `BLOCKER` severity. Baseline suppression is not
exposed yet; incomplete baseline flags were removed so unsupported behavior
does not appear as a no-op feature.

## Local usage

From repo root:

```bash
pnpm code-review-engine --help
pnpm code-review-engine --scope backend --format json
pnpm code-review-engine --scope module --module analytics --format human
pnpm code-review-engine --rules service.no-direct-orm --format json
pnpm code-review-engine --scope full --format json --output output/code-review-engine/full.json
pnpm code-review-engine --scope changed --base HEAD --format json --output output/code-review-engine/changed.json
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
output/code-review-engine/<UTC_TIMESTAMP>-<scope>.<ext>
```

Use `-o/--output` to set an explicit artifact path:

```bash
pnpm code-review-engine --scope full --format json --output output/code-review-engine/full.json
pnpm code-review-engine --scope module --module analytics --format markdown --output output/code-review-engine/analytics.md
```

The engine creates parent directories for the output path. The repository
standard location is `output/code-review-engine/`.

## Rule Catalog

### Backend Layers

- `service.no-direct-orm` `[BLOCKER/prototype]`
- `repository.must-extend-tortoise-orm` `[BLOCKER/prototype]`
- `repository.no-business-logic` `[MAJOR/prototype]`
- `backend.no-production-dataclass` `[BLOCKER/prototype]`
- `entity-manager.no-any-fields` `[BLOCKER/prototype]`
- `entity-manager.write-must-use-em` `[BLOCKER/prototype]`
- `schema.no-any-dict-fields` `[MAJOR/prototype]`
- `schema.must-extend-base` `[MAJOR/prototype]`
- `endpoint.missing-response-model` `[MAJOR/prototype]`
- `endpoint.missing-docstring` `[MINOR/prototype]`

### Backend Architecture

- `architecture.orm-leak` `[BLOCKER/prototype]`
- `architecture.write-path-violation` `[BLOCKER/prototype]`
- `architecture.router-no-direct-repository` `[BLOCKER/prototype]`
- `lifecycle.must-dispatch-hooks` `[BLOCKER/prototype]`
- `lifecycle.missing-subscribers` `[MAJOR/prototype]`
- `hard-cut.no-dual-repo-pattern` `[BLOCKER/prototype]`
- `hard-cut.no-shim-facade` `[BLOCKER/prototype]`

### i18n, Plugins, Tests, Filesystem

- `i18n.missing-t-call` `[MAJOR/prototype]`
- `i18n.invalid-key-format` `[MINOR/prototype]`
- `i18n.invalid-namespace` `[MINOR/prototype]`
- `plugin.must-register-lifecycle` `[MAJOR/prototype]`
- `plugin.must-have-locales` `[MINOR/prototype]`
- `test.missing-module-tests` `[BLOCKER/prototype]`
- `test.missing-core-tests` `[BLOCKER/prototype]`
- `test.no-skipped-without-rationale` `[MAJOR/prototype]`
- `filesystem.module-structure` `[MINOR/prototype]`

### Frontend

- `frontend.no-any` `[MAJOR/prototype]`
- `frontend.route-no-api-calls` `[MAJOR/prototype]`
- `frontend.data-must-use-react-query` `[MAJOR/prototype]`
- `frontend.page-structure` `[MINOR/prototype]`
