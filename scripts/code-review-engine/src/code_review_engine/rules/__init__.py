from __future__ import annotations

from dataclasses import dataclass

from code_review_engine.models import AuditScope, RuleMetadata, RuleStability, ScopeSelector, Severity


@dataclass(frozen=True)
class RuleRegistry:
    rules: tuple[RuleMetadata, ...]

    def all(self) -> tuple[RuleMetadata, ...]:
        return self.rules

    def select(self, selector: ScopeSelector) -> tuple[RuleMetadata, ...]:
        selected = self.rules
        if selector.selected_rules:
            wanted = set(selector.selected_rules)
            selected = tuple(rule for rule in selected if rule.id in wanted)
            missing = sorted(wanted - {rule.id for rule in selected})
            if missing:
                raise ValueError(f"Unknown rule id(s): {', '.join(missing)}")
        return tuple(rule for rule in selected if selector.scope in rule.supported_scopes)


DEFAULT_REGISTRY = RuleRegistry(
    rules=(
        RuleMetadata(
            id="engine.scope-isolation",
            title="Rules must stay inside the active audit scope",
            category="engine",
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
            source=("docs/plans/code-review-engine/spec.md",),
            stability=RuleStability.PROTOTYPE,
            owner="architecture",
            autofix="none",
            dedupe_key="engine-scope",
        ),
        RuleMetadata(
            id="engine.rule-metadata-required",
            title="Every rule must declare metadata",
            category="engine",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.RULES),
            source=("docs/plans/code-review-engine/spec.md",),
            stability=RuleStability.PROTOTYPE,
            owner="architecture",
            autofix="none",
            dedupe_key="rule-metadata",
        ),
        RuleMetadata(
            id="service.no-direct-orm",
            title="Service layer must not call ORM models directly",
            category="backend",
            severity=Severity.BLOCKER,
            supported_scopes=(AuditScope.FULL, AuditScope.BACKEND, AuditScope.MODULE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/backend-folder-architecture.md",),
            stability=RuleStability.PROTOTYPE,
            owner="backend-architecture",
            autofix="preview",
            dedupe_key="orm-call-site",
        ),
        RuleMetadata(
            id="frontend.route-no-api-calls",
            title="Route files must not own API calls",
            category="frontend",
            severity=Severity.MAJOR,
            supported_scopes=(AuditScope.FULL, AuditScope.FRONTEND, AuditScope.PACKAGE, AuditScope.CHANGED, AuditScope.RULES),
            source=("docs/guidelines/frontend-folder-architecture.md",),
            stability=RuleStability.PROTOTYPE,
            owner="frontend-architecture",
            autofix="none",
            dedupe_key="frontend-route-data-flow",
        ),
    )
)
