# Code Review Engine Guideline

This guideline defines the long-lived standards for the repository code review engine.

## Purpose

The code review engine is a repository-local standards audit tool. It validates backend, frontend, filesystem, testing, i18n, plugin, and architecture constraints through stable reports.

Target location:

```text
scripts/code-review-engine/
```

The engine is independent from `apps/api` runtime code and does not import from `apps/api/src/core/audit`.

## CLI Contract

Supported command shape:

```bash
pnpm code-review-engine --scope full --format human
pnpm code-review-engine --scope backend --format json
pnpm code-review-engine --scope module --module analytics --format json
pnpm code-review-engine --scope changed --base develop --format json
pnpm code-review-engine --rules service.no-direct-orm,frontend.route-no-api-calls --format json
pnpm code-review-engine --baseline .baseline/code-review-engine.json --format json
pnpm code-review-engine --write-baseline .baseline/code-review-engine.json
pnpm code-review-engine --scope full --format markdown --output reports/code-review-engine/full.md
```

CLI behavior:

- Exits non-zero when active `BLOCKER` findings are present outside baseline or waiver policy.
- Exits non-zero on invalid scope, missing module, malformed baseline, or malformed waiver.
- Prints actionable error context with file path and rule id.
- Emits output to stdout and always writes an artifact.
- Uses `reports/code-review-engine/<timestamp>-<scope>.<ext>` when `--output` is omitted.

## Scope Model

Each run has one explicit scope:

- `full`: all governed repo surfaces
- `backend`: `apps/api` backend source and backend tests
- `frontend`: `apps/admin` and Admin-facing shared frontend packages
- `module`: one backend module under `apps/api/src/modules/<module>`
- `package`: one workspace package or app
- `changed`: files changed against a git base ref
- `rules`: rule subset selected by id or category

Rules declare supported scopes and stay within active scope boundaries.

## Rule Metadata Contract

Each rule declares:

- `id`
- `title`
- `category`
- `severity` (`BLOCKER`, `MAJOR`, `MINOR`, `INFO`)
- `supported_scopes`
- `source` guideline references
- `stability` (`prototype`, `active`, `blocking`, `retired`)
- `owner`
- `autofix` capability mode
- `dedupe_key`

## Finding Contract

Each finding includes:

- `rule_id`
- `severity`
- `file`
- `line`
- `column`
- `symbol`
- `message`
- `evidence`
- `source`
- `primary`
- `related_rules`
- `suggested_fix`
- `waiver`

Findings are de-duplicated by location and architectural cause. One location has one primary remediation finding with related rule ids attached.

## Baseline and Waiver Contract

- `--write-baseline` saves current findings for debt tracking.
- `--baseline` reports new and resolved findings against baseline.
- New blocking findings outside baseline fail execution.
- Waivers are committed in `scripts/code-review-engine/waivers.yaml`.
- Each waiver declares rule id, path or pattern, owner, reason, and expiry.
- Expired waivers fail execution.

## Indexing Contract

Backend indexing captures:

- modules, classes, functions, methods
- decorators and decorator kwargs
- imports and aliases
- class bases
- field, parameter, return annotations
- exact call sites with line and column
- raise statements and user-facing payloads
- Tortoise model `Meta.table`
- router metadata: tags, response models, endpoint docstrings

Frontend indexing captures:

- route files and route metadata
- page roots and page-local subdirectories
- imports and package boundaries
- React Query usage
- Zustand store definitions
- browser fetch usage
- TypeScript `any` and unsafe casts

Filesystem indexing captures:

- module and package layout
- generated artifacts
- ignored planning docs
- reference repository boundaries
- migration and generated OpenAPI outputs

## Reporter Contract

Required reporters:

- `json`: stable machine-readable report
- `human`: terminal-friendly grouped output
- `markdown`: review artifact for guideline and review records

## Promotion Policy

A rule can move to `blocking` when all items are complete:

- metadata complete
- positive and negative fixtures present
- scope behavior stable
- known false positives documented
- remediation message stable
- rule entry documented in this guideline

## Rule Catalog

### Engine Governance

- `engine.scope-isolation`
- `engine.rule-metadata-required`
- `engine.finding-deduplication`
- `engine.baseline-diff-only-new`
- `engine.waiver-expiry-required`

### Backend Layer and Architecture

- `service.no-direct-orm`
- `repository.must-extend-tortoise-orm`
- `repository.no-business-logic`
- `entity-manager.no-dataclass-return`
- `entity-manager.no-any-fields`
- `entity-manager.write-must-use-em`
- `schema.no-any-dict-fields`
- `schema.must-extend-base`
- `endpoint.missing-response-model`
- `endpoint.missing-docstring`
- `architecture.orm-leak`
- `architecture.write-path-violation`
- `architecture.router-no-direct-repository`
- `architecture.no-route-aggregation-layer`
- `architecture.no-cross-domain-repository-orchestration`
- `architecture.no-circular-layer-imports`

### Model, Migration, and API Contract

- `model.meta-table-required`
- `model.table-prefix-vocabulary`
- `model.docstring-first-line`
- `migration.generated-only`
- `endpoint.tag-vocabulary`
- `endpoint.publicuuid-external-id`

### i18n, Lifecycle, Plugin, and Hard-Cut

- `i18n.missing-t-call`
- `i18n.invalid-key-format`
- `i18n.invalid-namespace`
- `i18n.locale-key-parity`
- `i18n.no-hardcoded-user-copy`
- `lifecycle.must-dispatch-hooks`
- `lifecycle.missing-subscribers`
- `plugin.must-register-lifecycle`
- `plugin.must-have-locales`
- `hard-cut.no-dual-repo-pattern`
- `hard-cut.no-shim-facade`
- `hard-cut.no-deleted-route-residue`
- `hard-cut.no-compat-surface-without-plan`

### Tests, Filesystem, and Frontend

- `test.missing-module-tests`
- `test.missing-core-tests`
- `test.no-skipped-without-rationale`
- `test.coverage-threshold`
- `test.rule-fixtures-required`
- `filesystem.module-structure`
- `filesystem.generated-artifact-boundary`
- `filesystem.reference-repo-boundary`
- `frontend.no-any`
- `frontend.route-no-api-calls`
- `frontend.data-must-use-react-query`
- `frontend.page-structure`
- `frontend.static-title-key-required`
- `frontend.no-cross-app-source-import`
- `frontend.server-state-not-in-zustand`

## Execution Phases

1. Planning and contract confirmation.
2. Standalone project skeleton in `scripts/code-review-engine`.
3. Rule metadata, scope engine, and inventory boundaries.
4. Backend rule migration with exact call-site precision.
5. Filesystem, frontend, tests, i18n, and plugin calibration.
6. Baseline, waiver, and reporter completion.
7. Preview-fix support for selected safe cases.
8. Legacy `apps/api/src/core/audit` removal after parity.

## Current Risk Baseline

Known high-priority risks from the current prototype:

- Scope leakage across backend and frontend.
- Duplicate primary findings from overlapping rules.
- Frontend page-structure false positives.
- Backend module-shape false positives.
- Function-level indexing precision gaps.
- Coverage naming and evidence mismatch.
- Missing dedicated audit-engine test suite.
- Report schema fields that imply unsupported capabilities.

The migration plan closes these gaps before rule promotion.
