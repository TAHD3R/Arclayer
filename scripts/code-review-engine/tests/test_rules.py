from __future__ import annotations

import pytest

from code_review_engine.engine import run_audit
from code_review_engine.models import AuditScope, ScopeSelector
from code_review_engine.rules import DEFAULT_REGISTRY


def test_registry_filters_by_scope() -> None:
    frontend_rules = DEFAULT_REGISTRY.select(ScopeSelector(scope=AuditScope.FRONTEND))
    rule_ids = {rule.metadata.id for rule in frontend_rules}

    assert "frontend.route-no-api-calls" in rule_ids
    assert "service.no-direct-orm" not in rule_ids
    assert len(DEFAULT_REGISTRY.all()) >= 29


def test_registry_rejects_unknown_rule_id() -> None:
    with pytest.raises(ValueError, match="Unknown rule id"):
        DEFAULT_REGISTRY.select(ScopeSelector(scope=AuditScope.RULES, selected_rules=("missing.rule",)))


def test_frontend_page_structure_allows_page_local_directories(tmp_path) -> None:
    page = tmp_path / "apps/admin/src/pages/workspaces/assets/page.tsx"
    component = tmp_path / "apps/admin/src/pages/workspaces/assets/components/assets-view.tsx"
    hook = tmp_path / "apps/admin/src/pages/workspaces/assets/hooks/use-assets-view.tsx"
    shared = tmp_path / "apps/admin/src/pages/workspaces/shared/activity.tsx"
    for path in (page, component, hook, shared):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("export function Sample() { return null; }\n", encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.FRONTEND, selected_rules=("frontend.page-structure",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_module_structure_accepts_subdomain_split_modules(tmp_path) -> None:
    module_root = tmp_path / "apps/api/src/modules/system"
    for relative_path in (
        "admin/notifications/router.py",
        "admin/notifications/service.py",
        "admin/notifications/repository.py",
        "admin/notifications/schema.py",
    ):
        path = module_root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("class Placeholder:\n    pass\n", encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.MODULE, module="system", selected_rules=("filesystem.module-structure",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()
