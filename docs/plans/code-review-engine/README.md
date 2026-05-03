# Code Review Engine

This directory is the planning source of truth for upgrading the current audit prototype into a complete, long-lived project standards audit engine.

## Objective

Move the current audit implementation from `apps/api/src/core/audit` into an independent repo-local project at `scripts/code-review-engine`, then upgrade it into a standards engine that can review backend, frontend, filesystem, tests, i18n, plugin, and hard-cut architecture rules with controlled scope and stable output.

## Documents

| File | Purpose |
| --- | --- |
| `current-review-findings.md` | Captures the 2026-05-03 review verdict and concrete risks in the current prototype. |
| `spec.md` | Defines the target engine contract, architecture, report shape, scope behavior, and quality bar. |
| `implementation-plan.md` | Breaks the migration and upgrade into executable phases. |
| `README.md` | Lists the audit rules and documents this planning package. |

## Current Verdict

`apps/api/src/core/audit` is useful as a discovery prototype. It should not be used as a mandatory long-term standards gate until it has scope isolation, rule metadata, fixture tests, de-duplication, baseline support, and live-guideline-aligned rules.

## Target Location

```text
scripts/code-review-engine/
├── README.md
├── pyproject.toml
├── src/code_review_engine/
│   ├── cli.py
│   ├── config.py
│   ├── engine.py
│   ├── indexers/
│   ├── rules/
│   ├── reporters/
│   └── models.py
└── tests/
    ├── fixtures/
    ├── rules/
    └── test_cli.py
```

The old `apps/api/src/core/audit` path becomes a migration source. After parity and tests, it should be removed from the API runtime tree.

## Rule Status Legend

| Status | Meaning |
| --- | --- |
| `prototype` | Exists in `apps/api/src/core/audit`, needs validation and migration. |
| `needs-calibration` | Exists but currently produces known false positives or scope leakage. |
| `target` | Required for the full standards engine and not yet implemented. |
| `active-ready` | Migrated, tested, scoped, and suitable for baseline-gated execution. |

## Rule Catalog

### Engine Governance

| Rule ID | Status | Scope | Source |
| --- | --- | --- | --- |
| `engine.scope-isolation` | target | all | `spec.md` |
| `engine.rule-metadata-required` | target | all | `spec.md` |
| `engine.finding-deduplication` | target | all | `spec.md` |
| `engine.baseline-diff-only-new` | target | all | `spec.md` |
| `engine.waiver-expiry-required` | target | all | `spec.md` |

### Backend Layer Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `service.no-direct-orm` | `ServiceNoDirectORM` | prototype | Needs exact call-site lines and de-duplication with architecture rules. |
| `repository.must-extend-tortoise-orm` | `RepositoryMustExtendTortoiseORM` | prototype | Needs alignment with the accepted repository migration plan. |
| `repository.no-business-logic` | `RepositoryNoBusinessLogic` | prototype | Needs import pattern accuracy and wildcard support. |
| `entity-manager.no-dataclass-return` | `EntityManagerNoDataclassReturn` | prototype | Needs entity-manager-specific type ownership instead of all dataclasses. |
| `entity-manager.no-any-fields` | `EntityManagerNoAnyFields` | prototype | Needs real field/parameter annotation indexing. |
| `entity-manager.write-must-use-em` | `EntityManagerWriteMustUseEM` | prototype | Needs primary grouping with `architecture.write-path-violation`. |
| `schema.no-any-dict-fields` | `SchemaNoAnyDictFields` | prototype | Needs allowed structured JSON escape hatches. |
| `schema.must-extend-base` | `SchemaMustExtendBase` | prototype | Needs full base-class resolution. |
| `endpoint.missing-response-model` | `EndpointMissingResponseModel` | prototype | Needs support for all router decorators and exceptions. |
| `endpoint.missing-docstring` | `EndpointMissingDocstring` | prototype | Needs product-docstring quality checks. |

### Backend Architecture Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `architecture.orm-leak` | `ORMLeakDetection` | prototype | Needs call-site precision and primary/related grouping. |
| `architecture.write-path-violation` | `WritePathViolation` | prototype | Needs de-duplication with entity-manager write rules. |
| `architecture.router-no-direct-repository` | `RouterNoDirectRepository` | prototype | Needs function-level router indexing. |
| `architecture.no-route-aggregation-layer` | target | target | Enforce `core/routes.py` ownership. |
| `architecture.no-cross-domain-repository-orchestration` | target | target | Enforce backend folder architecture dependency direction. |
| `architecture.no-circular-layer-imports` | target | target | Requires import graph indexing. |

### Model, Migration, and API Contract Rules

| Rule ID | Status | Source |
| --- | --- | --- |
| `model.meta-table-required` | target | `docs/guidelines/backend-folder-architecture.md` |
| `model.table-prefix-vocabulary` | target | `docs/guidelines/backend-folder-architecture.md` |
| `model.docstring-first-line` | target | `docs/guidelines/backend-folder-architecture.md` |
| `migration.generated-only` | target | `AGENTS.md`, `docs/guidelines/backend-folder-architecture.md` |
| `endpoint.tag-vocabulary` | target | `docs/guidelines/backend-folder-architecture.md` |
| `endpoint.publicuuid-external-id` | target | `docs/guidelines/backend-endpoint-contract.md` |

### i18n Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `i18n.missing-t-call` | `MissingI18nRule` | prototype | Needs distinction between internal exceptions and user-visible API output. |
| `i18n.invalid-key-format` | `InvalidI18nKeyFormat` | prototype | Needs backend/frontend pattern split. |
| `i18n.invalid-namespace` | `InvalidI18nNamespace` | prototype | Needs registry source from locale files. |
| `i18n.locale-key-parity` | target | target | Check `zh-CN` and `en-US` parity. |
| `i18n.no-hardcoded-user-copy` | target | target | Applies to Admin UI and public API messages. |

### Lifecycle and Plugin Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `lifecycle.must-dispatch-hooks` | `LifecycleMustDispatchHooks` | prototype | Needs method-level write operation mapping. |
| `lifecycle.missing-subscribers` | `LifecycleSubscriberCoverage` | prototype | Needs critical action registry instead of fixed global set. |
| `plugin.must-register-lifecycle` | `PluginMustRegisterLifecycle` | prototype | Needs plugin manifest awareness. |
| `plugin.must-have-locales` | `PluginMustHaveLocales` | prototype | Needs UI detection based on plugin metadata. |

### Hard-Cut Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `hard-cut.no-dual-repo-pattern` | `NoDualRepositoryPattern` | prototype | Needs module-scope precision and approved migration exceptions. |
| `hard-cut.no-shim-facade` | `NoShimFacadePattern` | prototype | Needs semantic forwarding detection beyond keyword matching. |
| `hard-cut.no-deleted-route-residue` | target | target | Check generated OpenAPI and client consumers after route removals. |
| `hard-cut.no-compat-surface-without-plan` | target | target | Require explicit approved removal plan for compatibility surfaces. |

### Test and Coverage Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `test.missing-module-tests` | `ModuleMustHaveTests` | needs-calibration | Directory existence is useful, but it does not prove coverage. |
| `test.missing-core-tests` | `CoreMustHaveTests` | needs-calibration | Current matching treats any core test as relevant. |
| `test.no-skipped-without-rationale` | `NoSkippedTestsWithoutRationale` | prototype | Needs owner, reason, and expiry parsing. |
| `test.coverage-threshold` | target | target | Read coverage XML/JSON from test runs. |
| `test.rule-fixtures-required` | target | target | Every active rule needs positive and negative fixtures. |

### Filesystem Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `filesystem.module-structure` | `ModuleStructureRule` | needs-calibration | Must support subdomain-split modules and transitional surfaces. |
| `filesystem.generated-artifact-boundary` | target | target | Check lockfiles, migrations, OpenAPI, build outputs, and ignored plans. |
| `filesystem.reference-repo-boundary` | target | target | Ensure `references/**` stays uncommitted and excluded. |

### Frontend Rules

| Rule ID | Current Class | Status | Notes |
| --- | --- | --- | --- |
| `frontend.no-any` | `FrontendNoAny` | prototype | Needs TypeScript parser support and generated-file exclusions. |
| `frontend.route-no-api-calls` | `FrontendRouteNoAPICalls` | prototype | Needs import graph checks and route file role awareness. |
| `frontend.data-must-use-react-query` | `FrontendDataMustUseReactQuery` | needs-calibration | Raw browser-native fetch flows need explicit allow rules. |
| `frontend.page-structure` | `FrontendPageStructureRule` | needs-calibration | Currently flags valid page-local folders. |
| `frontend.static-title-key-required` | target | target | Enforce route metadata title ownership. |
| `frontend.no-cross-app-source-import` | target | target | Enforce shared package boundary. |
| `frontend.server-state-not-in-zustand` | target | target | Enforce React Query vs client state ownership. |

## Completion Contract

The code review engine is considered complete when:

- It runs from `scripts/code-review-engine` without importing from `apps/api/src/core/audit`.
- It supports explicit scopes without cross-surface leakage.
- Every active rule has fixture tests and a guideline source.
- Reports use stable JSON with de-duplicated primary findings.
- Existing debt can be tracked through baseline diff and explicit waivers.
- This README is updated whenever a rule is added, retired, or promoted to `active-ready`.
