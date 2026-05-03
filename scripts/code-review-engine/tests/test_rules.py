from __future__ import annotations

import pytest

from code_review_engine.models import AuditScope, ScopeSelector
from code_review_engine.rules import DEFAULT_REGISTRY


def test_registry_filters_by_scope() -> None:
    frontend_rules = DEFAULT_REGISTRY.select(ScopeSelector(scope=AuditScope.FRONTEND))
    rule_ids = {rule.id for rule in frontend_rules}

    assert "frontend.route-no-api-calls" in rule_ids
    assert "service.no-direct-orm" not in rule_ids


def test_registry_rejects_unknown_rule_id() -> None:
    with pytest.raises(ValueError, match="Unknown rule id"):
        DEFAULT_REGISTRY.select(ScopeSelector(scope=AuditScope.RULES, selected_rules=("missing.rule",)))
