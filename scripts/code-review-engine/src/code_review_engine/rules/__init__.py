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

    def __post_init__(self) -> None:
        errors = validate_rules(self.rules)
        if errors:
            raise ValueError("Invalid code review rule registry:\n- " + "\n- ".join(errors))

    def all(self) -> tuple[RuleMetadata, ...]:
        return tuple(rule.metadata for rule in self.rules if rule.metadata.stability != RuleStability.RETIRED)

    def select(self, selector: ScopeSelector) -> tuple[ExecutableRule, ...]:
        selected = tuple(rule for rule in self.rules if rule.metadata.stability != RuleStability.RETIRED)
        if selector.selected_rules:
            wanted = set(selector.selected_rules)
            selected = tuple(rule for rule in selected if rule.id in wanted)
            missing = sorted(wanted - {rule.id for rule in selected})
            if missing:
                raise ValueError(f"Unknown rule id(s): {', '.join(missing)}")
        return tuple(rule for rule in selected if selector.scope in rule.metadata.supported_scopes)

    def stability_counts(self, rules: tuple[ExecutableRule, ...] | None = None) -> dict[str, int]:
        selected = rules if rules is not None else self.rules
        return {
            "blocking": sum(1 for rule in selected if rule.metadata.stability == RuleStability.BLOCKING),
            "active": sum(1 for rule in selected if rule.metadata.stability == RuleStability.ACTIVE),
            "prototype": sum(1 for rule in selected if rule.metadata.stability == RuleStability.PROTOTYPE),
            "retired": sum(1 for rule in selected if rule.metadata.stability == RuleStability.RETIRED),
        }


def validate_rules(rules: tuple[ExecutableRule, ...]) -> tuple[str, ...]:
    errors: list[str] = []
    seen: set[str] = set()

    for rule in rules:
        metadata = rule.metadata
        if metadata.id in seen:
            errors.append(f"duplicate rule id: {metadata.id}")
        seen.add(metadata.id)

        if not metadata.id.strip():
            errors.append("rule id must not be empty")
        if not metadata.title.strip():
            errors.append(f"{metadata.id}: title must not be empty")
        if not metadata.category.strip():
            errors.append(f"{metadata.id}: category must not be empty")
        if not metadata.owner.strip():
            errors.append(f"{metadata.id}: owner must not be empty")
        if not metadata.autofix.strip():
            errors.append(f"{metadata.id}: autofix must not be empty")
        if not metadata.dedupe_key.strip():
            errors.append(f"{metadata.id}: dedupe_key must not be empty")
        if not metadata.source or any(not source.strip() for source in metadata.source):
            errors.append(f"{metadata.id}: source must include at least one non-empty reference")
        if not metadata.supported_scopes:
            errors.append(f"{metadata.id}: supported_scopes must not be empty")
        if rule.implementation is None:
            errors.append(f"{metadata.id}: implementation is required")
        elif getattr(rule.implementation, "rule_id", None) != metadata.id:
            errors.append(
                f"{metadata.id}: implementation rule_id mismatch "
                f"({getattr(rule.implementation, 'rule_id', None)!r})"
            )
        if metadata.stability == RuleStability.BLOCKING and metadata.severity != Severity.BLOCKER:
            errors.append(f"{metadata.id}: blocking stability requires BLOCKER severity")

    return tuple(errors)


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
    stability: RuleStability = RuleStability.PROTOTYPE,
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
            stability=stability,
            owner=owner,
            autofix=autofix,
            dedupe_key=dedupe_key,
        ),
        implementation=implementation,
        symbol_driven=symbol_driven,
    )


DEFAULT_REGISTRY = RuleRegistry(
    rules=(
        _legacy_rule(
            rule_id="service.no-direct-orm",
            title="Service layer must not call ORM models directly",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="orm-call-site",
            autofix="preview",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="service.must-extend-base-service",
            title="Service classes must extend BaseService",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="service-base-class",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="service.no-direct-event-publish",
            title="Service methods must publish events through BaseService",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="service-event-publish",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="service.no-optional-activity-publish",
            title="Required Activity events must not use optional publishing",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="service-optional-activity-publish",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="service.required-activity-coverage",
            title="Target mutation service methods must write required Activity evidence",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="service-required-activity-coverage",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="service.no-method-dependency-construction",
            title="Service methods must use injected dependencies",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="service-method-dependency-construction",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="service.no-direct-in-transaction",
            title="Service methods must use BaseService transaction helpers",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="service-direct-in-transaction",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="repository.must-extend-tortoise-orm",
            title="Repository must extend TortoiseORMRepository",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="repo-business-import",
            symbol_driven=True,
        ),
        _legacy_rule(
            rule_id="backend.no-production-dataclass",
            title="Production backend code must not use dataclasses",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="backend-production-dataclass",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="backend.no-local-query-parsers",
            title="Backend query parsing must use canonical core/query contracts",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="backend-local-query-parser",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="backend.graphql-no-repository-access",
            title="GraphQL resolvers must use planner/service paths",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="backend-graphql-repository-access",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="backend.sanitize-external-sinks",
            title="External sink payloads must be sanitized through canonical policy",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="backend-sanitize-sink",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="backend.plugin-typed-payloads",
            title="Plugin hook payloads must use typed contracts",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
            owner="backend-architecture",
            dedupe_key="backend-plugin-payload-contract",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="entity-manager.no-any-fields",
            title="EntityManager fields must avoid Any",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/domain-design.md",),
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
            source=("docs/spec/api/backend/domain-design.md",),
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
            source=("docs/spec/api/backend/i18n.md",),
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
            source=("docs/spec/api/backend/i18n.md",),
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
            source=("docs/spec/api/backend/i18n.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/domain-design.md",),
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
            rule_id="hard-cut.openapi-single-source",
            title="OpenAPI is the single backend API type source",
            category="hard-cut",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.FRONTEND, AuditScope.PACKAGE, AuditScope.CHANGED, AuditScope.RULES),
            source=(
                "docs/spec/api/backend/domain-design.md",
                "docs/spec/app/frontend/directory-structure.md",
            ),
            owner="architecture",
            dedupe_key="hard-cut-openapi-single-source",
            symbol_driven=False,
        ),
        _legacy_rule(
            rule_id="plugin.must-register-lifecycle",
            title="Plugins extending lifecycle must register hooks",
            category="plugin",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/api/backend/i18n.md",),
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
            source=("docs/spec/monorepo/quality-gates.md",),
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
            source=("docs/spec/monorepo/quality-gates.md",),
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
            source=("docs/spec/monorepo/quality-gates.md",),
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
            source=("docs/spec/api/backend/index.md",),
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
            source=("docs/spec/app/frontend/directory-structure.md",),
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
            source=("docs/spec/app/frontend/directory-structure.md",),
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
            source=("docs/spec/app/frontend/directory-structure.md",),
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
            source=("docs/spec/app/frontend/directory-structure.md",),
            owner="frontend-architecture",
            dedupe_key="frontend-page-structure",
            symbol_driven=False,
        ),
    )
)
