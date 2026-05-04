from __future__ import annotations

from dataclasses import dataclass

from code_review_engine.migrated.rules import ALL_RULES
from code_review_engine.migrated.rules.base import AuditRule
from code_review_engine.models import AuditScope, RuleMetadata, RuleStability, ScopeSelector, Severity


@dataclass(frozen=True)
class ExecutableRule:
    metadata: RuleMetadata
    implementation: AuditRule | None
    symbol_driven: bool = False

    @property
    def id(self) -> str:
        return self.metadata.id


@dataclass(frozen=True)
class RuleRegistry:
    rules: tuple[ExecutableRule, ...]

    def all(self) -> tuple[RuleMetadata, ...]:
        return tuple(rule.metadata for rule in self.rules)

    def select(self, selector: ScopeSelector) -> tuple[ExecutableRule, ...]:
        selected = self.rules
        if selector.selected_rules:
            wanted = set(selector.selected_rules)
            selected = tuple(rule for rule in selected if rule.id in wanted)
            missing = sorted(wanted - {rule.id for rule in selected})
            if missing:
                raise ValueError(f"Unknown rule id(s): {', '.join(missing)}")
        return tuple(rule for rule in selected if selector.scope in rule.metadata.supported_scopes)


_LEGACY_RULES_BY_ID = {rule.rule_id: rule for rule in ALL_RULES}


def _legacy_rule(
    *,
    rule_id: str,
    title: str,
    category: str,
    severity: Severity,
    supported_scopes: tuple[AuditScope, ...],
    source: tuple[str, ...],
    owner: str,
    dedupe_key: str,
    autofix: str = "none",
    symbol_driven: bool,
) -> ExecutableRule:
    implementation = _LEGACY_RULES_BY_ID.get(rule_id)
    if implementation is None:
        raise ValueError(f"Missing migrated implementation for rule: {rule_id}")

    return ExecutableRule(
        metadata=RuleMetadata(
            id=rule_id,
            title=title,
            category=category,
            severity=severity,
            supported_scopes=supported_scopes,
            source=source,
            stability=RuleStability.PROTOTYPE,
            owner=owner,
            autofix=autofix,
            dedupe_key=dedupe_key,
        ),
        implementation=implementation,
        symbol_driven=symbol_driven,
    )


def _engine_rule(
    *,
    rule_id: str,
    title: str,
    severity: Severity,
    supported_scopes: tuple[AuditScope, ...],
    dedupe_key: str,
) -> ExecutableRule:
    return ExecutableRule(
        metadata=RuleMetadata(
            id=rule_id,
            title=title,
            category="engine",
            severity=severity,
            supported_scopes=supported_scopes,
            source=("docs/plans/code-review-engine/spec.md",),
            stability=RuleStability.PROTOTYPE,
            owner="architecture",
            autofix="none",
            dedupe_key=dedupe_key,
        ),
        implementation=None,
        symbol_driven=False,
    )


DEFAULT_REGISTRY = RuleRegistry(
    rules=(
        _engine_rule(
            rule_id="engine.scope-isolation",
            title="Rules must stay inside the active audit scope",
            severity=Severity.BLOCKER,
            supported_scopes=(
                AuditScope.FULL,
                AuditScope.BACKEND,
                AuditScope.FRONTEND,
                AuditScope.MODULE,
                AuditScope.PACKAGE,
                AuditScope.CHANGED,
                AuditScope.RULES,
            ),
            dedupe_key="engine-scope",
        ),
        _engine_rule(
            rule_id="engine.rule-metadata-required",
            title="Every rule must declare metadata",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.RULES),
            dedupe_key="rule-metadata",
        ),
        _legacy_rule(
            rule_id="service.no-direct-orm",
            title="Service layer must not call ORM models directly",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="orm-call-site",
            autofix="preview",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="repository.must-extend-tortoise-orm",
            title="Repository must extend TortoiseORMRepository",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="repo-base-class",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="repository.no-business-logic",
            title="Repository must not import service/business logic",
            category="backend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="repo-business-import",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="entity-manager.no-dataclass-return",
            title="EntityManager return types must avoid dataclass",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="entity-manager-dataclass",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="entity-manager.no-any-fields",
            title="EntityManager fields must avoid Any",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="entity-manager-any",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="entity-manager.write-must-use-em",
            title="Write operations must go through EntityManager",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="entity-manager-write-path",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="lifecycle.must-dispatch-hooks",
            title="EntityManager must dispatch lifecycle hooks",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="lifecycle-dispatch",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="lifecycle.missing-subscribers",
            title="Critical lifecycle actions require subscribers",
            category="backend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="lifecycle-subscriber",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="schema.no-any-dict-fields",
            title="Schemas must avoid Any and bare dict",
            category="backend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="schema-any",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="schema.must-extend-base",
            title="Schema classes must extend approved base",
            category="backend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="backend-architecture",
            dedupe_key="schema-base",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="endpoint.missing-response-model",
            title="Router endpoint decorator must include response_model",
            category="backend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-endpoint-contract.md",),
            owner="backend-architecture",
            dedupe_key="endpoint-response-model",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="endpoint.missing-docstring",
            title="Router endpoint must include docstring",
            category="backend",
            severity=Severity.MINOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-endpoint-contract.md",),
            owner="backend-architecture",
            dedupe_key="endpoint-docstring",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="i18n.missing-t-call",
            title="User-facing exception messages must use t(...)",
            category="i18n",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/i18n.md",),
            owner="frontend-platform",
            dedupe_key="i18n-missing-t",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="i18n.invalid-key-format",
            title="i18n key format must be UPPER_SNAKE_CASE",
            category="i18n",
            severity=Severity.MINOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/i18n.md",),
            owner="frontend-platform",
            dedupe_key="i18n-key-format",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="i18n.invalid-namespace",
            title="i18n namespace must use approved registry",
            category="i18n",
            severity=Severity.MINOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/i18n.md",),
            owner="frontend-platform",
            dedupe_key="i18n-namespace",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="architecture.orm-leak",
            title="ORM access must stay in repository/entity manager",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="architecture",
            dedupe_key="architecture-orm-leak",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="architecture.write-path-violation",
            title="Write path must go through entity manager",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="architecture",
            dedupe_key="architecture-write-path",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="architecture.router-no-direct-repository",
            title="Router must route through service",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-endpoint-contract.md",),
            owner="architecture",
            dedupe_key="router-repository-call",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="hard-cut.no-dual-repo-pattern",
            title="No dual repository patterns",
            category="hard-cut",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("AGENTS.md",),
            owner="architecture",
            dedupe_key="hard-cut-dual-repo",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="hard-cut.no-shim-facade",
            title="No shim/facade compatibility layers",
            category="hard-cut",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("AGENTS.md",),
            owner="architecture",
            dedupe_key="hard-cut-shim",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="plugin.must-register-lifecycle",
            title="Plugins extending lifecycle must register hooks",
            category="plugin",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="platform",
            dedupe_key="plugin-lifecycle",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="plugin.must-have-locales",
            title="Plugins with UI must include zh-CN and en-US locales",
            category="plugin",
            severity=Severity.MINOR,
            supported_scopes=(AuditScope.FULL, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/i18n.md",),
            owner="platform",
            dedupe_key="plugin-locales",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="test.missing-module-tests",
            title="Backend modules must have test directories",
            category="test",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/testing-and-quality-gates.md",),
            owner="quality",
            dedupe_key="test-module-coverage",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="test.missing-core-tests",
            title="Core backend layers must have tests",
            category="test",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/testing-and-quality-gates.md",),
            owner="quality",
            dedupe_key="test-core-coverage",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="test.no-skipped-without-rationale",
            title="Skipped tests need rationale",
            category="test",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/testing-and-quality-gates.md",),
            owner="quality",
            dedupe_key="test-skip-rationale",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="filesystem.module-structure",
            title="Backend modules should follow canonical structure",
            category="filesystem",
            severity=Severity.MINOR,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            owner="architecture",
            dedupe_key="filesystem-module-structure",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="frontend.no-any",
            title="Frontend TypeScript must avoid any",
            category="frontend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.FRONTEND, AuditScope.PACKAGE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/frontend-folder-architecture.md",),
            owner="frontend-architecture",
            dedupe_key="frontend-any",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="frontend.route-no-api-calls",
            title="Route files must not own API calls",
            category="frontend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.FRONTEND, AuditScope.PACKAGE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/frontend-folder-architecture.md",),
            owner="frontend-architecture",
            dedupe_key="frontend-route-data-flow",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="frontend.data-must-use-react-query",
            title="UI data fetching must use React Query",
            category="frontend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.FRONTEND, AuditScope.PACKAGE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/frontend-folder-architecture.md",),
            owner="frontend-architecture",
            dedupe_key="frontend-react-query",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="frontend.page-structure",
            title="Frontend page directories must have entry files",
            category="frontend",
            severity=Severity.MINOR,
            supported_scopes=(AuditScope.FULL, AuditScope.FRONTEND, AuditScope.PACKAGE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/frontend-folder-architecture.md",),
            owner="frontend-architecture",
            dedupe_key="frontend-page-structure",
            symbol_driven=False,
        ),
    )
)
