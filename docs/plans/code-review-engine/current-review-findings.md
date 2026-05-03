# Current Review Findings

Date: 2026-05-03
Subject: `apps/api/src/core/audit` standards audit prototype

## Verdict

`apps/api/src/core/audit` is a useful prototype for discovering standards drift. It is not ready to act as a long-term mandatory project standards gate.

The prototype already finds real issues, especially service ORM access, repository base divergence, schema `Any` usage, missing endpoint metadata, i18n gaps, and hard-cut residues. Its current output also contains known false positives, duplicate findings, and scope leakage. The next version should move to `scripts/code-review-engine` before it becomes a stronger governance tool.

## Evidence Reviewed

Files inspected:

- `apps/api/src/core/audit/engine.py`
- `apps/api/src/core/audit/indexer.py`
- `apps/api/src/core/audit/models.py`
- `apps/api/src/core/audit/runner.py`
- `apps/api/src/core/audit/rules/*.py`
- `.trellis/tasks/05-03-monorepo-consistency-audit-engine/prd.md`
- `docs/guidelines/backend-folder-architecture.md`
- `docs/guidelines/frontend-folder-architecture.md`

Commands run:

```bash
rtk pnpm -C apps/api uv -- python -m src.core.audit.runner --module analytics --json
rtk pnpm -C apps/api uv -- python -m src.core.audit.runner --json
rtk rg -n "core\\.audit|audit.runner|run_audit|AuditReport|ServiceNoDirectORM" apps/api/tests apps/admin/test apps/api/src -g '!apps/api/src/core/audit/**'
```

Observed output:

- `--module analytics` reported `Found 70 violations: 11 BLOCKER, 19 MAJOR, 40 MINOR`.
- Full run reported `Found 1183 violations: 204 BLOCKER, 908 MAJOR, 71 MINOR`.
- No focused tests were found for `core.audit` outside the implementation directory.

## High-Priority Findings

### 1. Scope leakage

`--module analytics` narrows only the backend module index. The engine still runs every global rule, and frontend rules directly scan `apps/admin/src`. A module-only backend run therefore includes unrelated frontend findings.

Impact:

- Single-module reports are noisy.
- A future CI gate would fail on unrelated surfaces.
- Developers cannot use scoped output as a reliable task boundary.

Required change:

- Add an explicit scope model.
- Bind every rule to supported scopes.
- Pass scope into rules instead of letting rules rediscover repo roots independently.

### 2. Duplicate primary findings

The same ORM access can be reported by service, architecture, and entity-manager rules. Write calls can appear as both write-path and entity-manager findings.

Impact:

- Severity counts are inflated.
- Report consumers cannot tell the primary remediation path.
- Baseline diffs become unstable.

Required change:

- Group findings by `(file, exact_line, symbol, evidence, architectural cause)`.
- Emit one primary finding and attach related rule hits.

### 3. Frontend structure false positives

`FrontendPageStructureRule` treats every directory under `apps/admin/src/pages` as a page root. This flags valid `components/`, `hooks/`, `shared/`, `tabs/`, and similar page-local directories.

Impact:

- Valid live repo patterns are reported as violations.
- The rule conflicts with `docs/guidelines/frontend-folder-architecture.md`.

Required change:

- Identify page roots by route-to-page conventions and `page.tsx` ownership.
- Exclude recognized page-local folders.
- Add fixture tests for `components/`, `hooks/`, and `shared`.

### 4. Backend filesystem rule assumes only flat modules

`ModuleStructureRule` expects each top-level module to directly contain `router.py`, `service.py`, `repository.py`, and `schema.py`. Live backend guidance allows large modules to split by subdomain.

Impact:

- Split modules are reported as missing canonical files.
- The rule conflicts with the live backend architecture guide.

Required change:

- Support both flat module and subdomain-split module shapes.
- Detect valid routers/services/repositories/schemas anywhere under the module when subdomain layout is used.
- Keep stricter enforcement for new modules through rule configuration.

### 5. Indexer lacks function-level precision

The current Python indexer creates class-level symbols and collects calls with `ast.walk`. Findings often point to class definition lines rather than the exact call line.

Impact:

- Findings require manual investigation.
- De-duplication is harder.
- Function-level endpoint and lifecycle rules are fragile.

Required change:

- Index modules, classes, functions, methods, decorators, imports, call sites, raises, assignments, annotations, and line spans separately.
- Preserve exact call site locations.

### 6. Coverage rules do not measure coverage

The current test rules inspect directory and file presence. They do not read coverage results. `CoreMustHaveTests` also treats any `test_*.py` under `apps/api/tests/core` as relevant.

Impact:

- The rule name and message overclaim.
- Coverage thresholds cannot be enforced.

Required change:

- Rename existence checks as test presence rules.
- Add a separate coverage rule backed by coverage XML/JSON.
- Add component-to-test matching tests.

### 7. Audit engine lacks its own test suite

No focused tests currently cover the audit engine. A governance tool needs high confidence because false positives and false negatives shape engineering behavior.

Required change:

- Add fixture tests for every active rule.
- Add CLI behavior tests for scope, JSON output, baseline diff, and waiver handling.
- Add regression fixtures for every finding in this document.

### 8. Output schema promises incomplete capabilities

`AuditReport` includes `canonical_rules` and `auto_fix`, but the engine does not populate them.

Impact:

- Report consumers can misread the tool as more complete than it is.
- Acceptance criteria are unclear.

Required change:

- Either populate these fields or remove them from the stable schema until implemented.
- Record field maturity in the target spec.

## Positive Signals

- The current implementation has a compact rule registry and a clear first-pass report model.
- Existing rules cover the right governance categories.
- The CLI already supports JSON output, module selection, baseline, and diff concepts.
- The prototype has enough real findings to justify a stronger standalone engine.

## Required Direction

1. Move the engine to `scripts/code-review-engine`.
2. Make the engine path-driven and scope-aware.
3. Treat current rules as migration inputs, not final gates.
4. Build fixture tests before promoting rules to blocking status.
5. Maintain `docs/plans/code-review-engine/README.md` as the rule catalog.
