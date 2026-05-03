# Code Review Engine Spec

## Purpose

The code review engine is a repo-local standards audit tool. It reads project source files and project guidelines, then reports architecture, type-safety, filesystem, i18n, testing, frontend, backend, plugin, and hard-cut violations in a stable machine-readable format.

The engine must help enforce project rules while keeping false positives visible and correctable.

## Non-Goals

- Runtime API behavior.
- Admin UI behavior.
- Mandatory CI blocking in the first migration slice.
- Silent automatic code modification.
- Replacing `pnpm api:check`, `pnpm admin:check`, or `pnpm check`.

## Location

Target path:

```text
scripts/code-review-engine
```

The engine must be independent from `apps/api`. It may inspect `apps/api`, `apps/admin`, `packages`, `plugins`, `docs`, and `.trellis`, but it must not import from `apps/api/src/core/audit`.

## CLI Contract

Initial command shape:

```bash
pnpm code-review-engine --scope full --format human
pnpm code-review-engine --scope backend --format json
pnpm code-review-engine --scope module --module analytics --format json
pnpm code-review-engine --scope changed --base develop --format json
pnpm code-review-engine --rules service.no-direct-orm,frontend.route-no-api-calls --format json
pnpm code-review-engine --baseline .baseline/code-review-engine.json --format json
pnpm code-review-engine --write-baseline .baseline/code-review-engine.json
```

The CLI must:

- exit non-zero when active blocking findings are present outside the accepted baseline;
- exit non-zero on invalid scope, missing module, malformed baseline, or malformed waiver;
- print direct errors with actionable file paths;
- support JSON output suitable for CI and Markdown/human output suitable for local review.

## Scope Model

Every run has an explicit scope.

| Scope | Meaning |
| --- | --- |
| `full` | All governed repo surfaces. |
| `backend` | `apps/api` backend source and backend tests. |
| `frontend` | `apps/admin` and Admin-facing shared frontend packages. |
| `module` | One backend module under `apps/api/src/modules/<module>`. |
| `package` | One workspace package or app. |
| `changed` | Files changed against a Git base ref. |
| `rules` | Rule subset selected by id or category. |

Rules must declare supported scopes. A rule must not scan outside the active scope.

## Rule Metadata

Every rule must declare:

```yaml
id: service.no-direct-orm
title: Service layer must not call ORM models directly
category: backend
severity: BLOCKER
supported_scopes: [full, backend, module, changed, rules]
source:
  - docs/guidelines/backend-folder-architecture.md#dependency-direction-rules
stability: active
owner: architecture
autofix: preview
dedupe_key: orm-call-site
```

Allowed severities:

- `BLOCKER`: architecture, safety, or contract violation that can block promotion once active.
- `MAJOR`: structural inconsistency or maintainability risk.
- `MINOR`: style or convention drift.
- `INFO`: advisory signal.

Allowed stability states:

- `prototype`: migrated rule under test.
- `active`: suitable for normal reporting.
- `blocking`: suitable for non-zero exit outside baseline.
- `retired`: preserved for historical context and baseline cleanup.

## Finding Model

Every finding must include:

```json
{
  "rule_id": "service.no-direct-orm",
  "severity": "BLOCKER",
  "file": "apps/api/src/modules/analytics/service.py",
  "line": 92,
  "column": 18,
  "symbol": "ActivityService.get_event",
  "message": "Service method calls AuditEvent.get_or_none directly.",
  "evidence": "AuditEvent.get_or_none(id=event_id)",
  "source": ["docs/guidelines/backend-folder-architecture.md"],
  "primary": true,
  "related_rules": ["architecture.orm-leak"],
  "suggested_fix": "Move the read into a repository method and call it from the service.",
  "waiver": null
}
```

Findings must be de-duplicated. One code location should have one primary remediation finding with related rule ids attached.

## Baseline and Waivers

The engine must support existing debt without hiding new regressions.

Baseline behavior:

- `--write-baseline` writes all current active findings.
- `--baseline` compares current findings against a saved baseline.
- New blocking findings cause non-zero exit.
- Removed findings are reported separately.

Waiver behavior:

- Waivers live in a committed file, for example `scripts/code-review-engine/waivers.yaml`.
- Every waiver requires rule id, file or path pattern, reason, owner, and expiry date.
- Expired waivers fail the audit.

## Indexing Contract

Backend Python indexing must capture:

- modules, classes, functions, methods;
- decorators and decorator kwargs;
- imports and import aliases;
- class bases with resolved names;
- annotations on fields, parameters, and returns;
- function calls with exact line and column;
- raise statements and user-visible error payloads;
- Tortoise model metadata, including `Meta.table`;
- router decorators, tags, response models, and endpoint docstrings.

Frontend indexing must capture:

- route files and route metadata;
- page roots and page-local subdirectories;
- imports and source package boundaries;
- React Query usage;
- Zustand store definitions;
- raw browser fetch usage;
- TypeScript `any` and unsafe casts;
- user-facing copy candidates when practical.

Filesystem indexing must capture:

- module and package layouts;
- generated artifacts;
- ignored planning docs;
- references directories;
- migration files and generated OpenAPI outputs.

## Reporters

Required reporters:

- `json`: stable machine-readable report.
- `human`: concise terminal output grouped by severity and category.
- `markdown`: review artifact suitable for docs/plans or PR comments.

## Rule Promotion Policy

A rule can become `blocking` only when:

- it has metadata;
- it has positive and negative fixtures;
- it respects all supported scopes;
- it has known false positives documented;
- it has a stable remediation message;
- it appears in `docs/plans/code-review-engine/README.md`.

## Migration Contract

The migration from `apps/api/src/core/audit` to `scripts/code-review-engine` must:

- preserve useful existing rules as migrated modules;
- remove runtime coupling to `apps/api`;
- keep the old path available only until the new CLI reaches parity;
- remove the old path in the same completion wave after parity is proven;
- update docs, Trellis context, and command references.
