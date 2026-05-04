# Code Review Engine Implementation Plan

## Phase 0: Planning and Contract

Status: in progress

Deliverables:

- `docs/plans/code-review-engine/README.md`
- `docs/plans/code-review-engine/spec.md`
- `docs/plans/code-review-engine/current-review-findings.md`
- `docs/plans/code-review-engine/implementation-plan.md`
- updated Trellis PRD and context jsonl files

Acceptance:

- Planning docs capture the current prototype verdict.
- README lists current and target rules.
- Spec states the independent `scripts/code-review-engine` contract.
- Plan gives a phased migration path.

## Phase 1: Standalone Project Skeleton

Create:

```text
scripts/code-review-engine/
├── README.md
├── pyproject.toml
├── src/code_review_engine/
│   ├── __init__.py
│   ├── cli.py
│   ├── config.py
│   ├── engine.py
│   ├── models.py
│   ├── indexers/
│   ├── reporters/
│   └── rules/
└── tests/
    ├── fixtures/
    ├── rules/
    └── test_cli.py
```

Tasks:

- Add package metadata and local run command.
- Add root-path discovery that accepts `--repo-root`.
- Add CLI argument parsing for scope, rules, format, baseline, and module.
- Add empty JSON/human reporters with stable envelope.
- Add CLI tests for help, invalid scope, missing module, and empty report.

Verification:

```bash
rtk pnpm code-review-engine --help
rtk pnpm code-review-engine --scope backend --format json
```

## Phase 2: Rule Metadata and Scope Engine

Tasks:

- Define `RuleMetadata`, `AuditScope`, `Finding`, `Report`, `Waiver`, and `Baseline` models.
- Require metadata for every rule.
- Add rule registry with filtering by scope and rule id.
- Add scope-resolved file inventory.
- Prevent rules from scanning outside scope.
- Add fixture tests for `full`, `backend`, `frontend`, `module`, `changed`, and `rules` scopes.

Acceptance:

- `--scope module --module analytics` cannot produce frontend findings.
- `--rules service.no-direct-orm` runs only that rule and its required indexer.

## Phase 3: Migrate Backend Rules with Precision

Migrate and improve:

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

Tasks:

- Build function-level Python AST indexer.
- Capture exact call-site line and column.
- Capture router decorator metadata and endpoint docstrings.
- Add de-duplication between service, architecture, and write-path findings.
- Add fixtures for analytics known violations and clean examples.

Acceptance:

- Analytics known violations are detected.
- Findings point to exact call or declaration lines.
- Duplicate ORM/write findings are grouped.

## Phase 4: Calibrate Filesystem, Frontend, Test, i18n, Plugin Rules

Filesystem:

- Support flat and subdomain-split backend module shapes.
- Add generated-artifact boundary checks.

Frontend:

- Replace page-directory regex with page-root-aware logic.
- Exclude page-local `components`, `hooks`, `shared`, `tabs`, and similar folders.
- Distinguish browser-native fetch flows from server-state fetching.
- Add package boundary checks.

Tests:

- Rename presence checks where they only prove presence.
- Add coverage report reader for real coverage threshold checks.
- Enforce skip/xfail owner, reason, and expiry.

i18n:

- Split backend and frontend translation call patterns.
- Check locale parity from actual locale files.

Plugin:

- Use plugin metadata and manifest files where available.

Acceptance:

- Known false positives from the 2026-05-03 review are covered by negative fixtures.
- Every active rule appears in the README rule catalog.

## Phase 5: Baseline, Waivers, and Reporters

Tasks:

- Implement baseline write/read/diff.
- Add waiver file parser.
- Require waiver owner, reason, and expiry.
- Add expired waiver failure.
- Add Markdown reporter.
- Add summary by severity, category, scope, and new/resolved status.

Acceptance:

- Existing debt can be baselined.
- New blocking findings fail with a focused diff.
- Removed findings are visible.
- Expired waivers fail.

## Phase 6: Preview Fixes

Tasks:

- Add patch preview model.
- Implement preview fixes for at least:
  - simple direct ORM read extraction suggestion;
  - raw i18n string replacement placeholder;
  - schema bare `dict` to typed alias scaffolding when safe.
- Keep fixes explicit and review-only.

Acceptance:

- Patch files are syntactically valid unified diffs.
- The engine never applies patches automatically.

## Phase 7: Remove Legacy API-Coupled Prototype

Tasks:

- Update all command references to use `scripts/code-review-engine`.
- Ensure report content writes to stdout, report artifacts are stored under `reports/code-review-engine` by default, and explicit `--output` remains supported.
- Remove `apps/api/src/core/audit` after parity.
- Remove stale imports and module docs.
- Run `gitnexus_detect_changes` before commit.

Acceptance:

- No `src.core.audit` imports remain.
- The standalone CLI passes its test suite.
- `pnpm api:check` remains clean if API files are touched.

## Suggested Execution Order

1. Phase 1 and Phase 2 together: skeleton, scope, metadata, empty report.
2. Phase 3: backend parity and de-duplication.
3. Phase 4: calibration for noisy existing rules.
4. Phase 5: baseline and waivers.
5. Phase 6: preview fixes.
6. Phase 7: legacy removal.

## Risks

- TypeScript AST integration can expand scope quickly. Keep frontend Phase 4 focused on rules already listed in README.
- Existing debt count is high. Use baseline-first rollout to protect current work while blocking regressions.
- Rule messages can become vague. Every active rule needs fixture-backed remediation text.
- Generated and ignored files can confuse verification. Read back docs under `docs/plans` because `docs/.gitignore` hides them from normal Git status.
