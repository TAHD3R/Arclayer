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


def test_frontend_page_structure_allows_support_files_in_parent_with_child_pages(tmp_path) -> None:
    shell = tmp_path / "apps/admin/src/pages/system/system-settings-shell.tsx"
    form_utils = tmp_path / "apps/admin/src/pages/system/system-settings-form-utils.tsx"
    child_page = tmp_path / "apps/admin/src/pages/system/users/page.tsx"
    for path in (shell, form_utils, child_page):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("export function Sample() { return null; }\n", encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.FRONTEND, selected_rules=("frontend.page-structure",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_frontend_page_structure_allows_pure_support_directories(tmp_path) -> None:
    support = tmp_path / "apps/admin/src/pages/projects/content/surfaces/surface-boundary-card.tsx"
    support.parent.mkdir(parents=True, exist_ok=True)
    support.write_text("export function SurfaceBoundaryCard() { return null; }\n", encoding="utf-8")

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


def test_i18n_missing_t_call_accepts_localized_backend_error_codes(tmp_path) -> None:
    errors_dir = tmp_path / "locales"
    for locale in ("zh-CN", "en-US"):
        locale_dir = errors_dir / locale
        locale_dir.mkdir(parents=True)
        (locale_dir / "errors.json").write_text('{"USER_NOT_FOUND": "User not found"}', encoding="utf-8")
    service = tmp_path / "apps/api/src/modules/auth/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class AuthService(BaseService):",
                "    async def load_user(self):",
                "        raise NotFound(error='USER_NOT_FOUND')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("i18n.missing-t-call",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_i18n_missing_t_call_flags_unlocalized_backend_error_codes(tmp_path) -> None:
    errors_dir = tmp_path / "locales"
    for locale in ("zh-CN", "en-US"):
        locale_dir = errors_dir / locale
        locale_dir.mkdir(parents=True)
        (locale_dir / "errors.json").write_text("{}", encoding="utf-8")
    service = tmp_path / "apps/api/src/modules/auth/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class AuthService(BaseService):",
                "    async def load_user(self):",
                "        raise NotFound(error='USER_NOT_FOUND')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("i18n.missing-t-call",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "i18n.missing-t-call"


def test_i18n_missing_t_call_flags_user_visible_exception_text(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/auth/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class AuthService(BaseService):",
                "    async def load_user(self):",
                "        raise NotFound(message='User not found')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("i18n.missing-t-call",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "i18n.missing-t-call"


def test_schema_no_any_dict_fields_flags_json_contract_payloads(tmp_path) -> None:
    schema = tmp_path / "apps/api/src/modules/sites/settings/schema.py"
    schema.parent.mkdir(parents=True)
    schema.write_text(
        "\n".join(
            [
                "from typing import Any",
                "from src.common.schemas import BaseSchema",
                "",
                "class SiteSettingOut(BaseSchema):",
                "    payload: dict[str, Any] | None = None",
                "    config: dict[str, Any] | None = None",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("schema.no-any-dict-fields",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 2
    assert {finding.rule_id for finding in report.findings} == {"schema.no-any-dict-fields"}


def test_schema_no_any_dict_fields_flags_unowned_any_fields(tmp_path) -> None:
    schema = tmp_path / "apps/api/src/modules/sites/settings/schema.py"
    schema.parent.mkdir(parents=True)
    schema.write_text(
        "\n".join(
            [
                "from typing import Any",
                "from src.common.schemas import BaseSchema",
                "",
                "class SiteSettingOut(BaseSchema):",
                "    owner: Any = None",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("schema.no-any-dict-fields",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "schema.no-any-dict-fields"


def test_entity_manager_dataclass_rule_is_scoped_to_entity_manager_contracts(tmp_path) -> None:
    query_parser = tmp_path / "apps/api/src/core/query/parser.py"
    query_parser.parent.mkdir(parents=True)
    query_parser.write_text(
        "\n".join(
            [
                "from dataclasses import dataclass",
                "",
                "@dataclass",
                "class QueryPlan:",
                "    limit: int",
                "",
            ]
        ),
        encoding="utf-8",
    )
    entity_manager = tmp_path / "apps/api/src/core/entity_manager/manager.py"
    entity_manager.parent.mkdir(parents=True)
    entity_manager.write_text(
        "\n".join(
            [
                "from dataclasses import dataclass",
                "",
                "@dataclass",
                "class EntityCreateResult:",
                "    item: object",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("entity-manager.no-dataclass-return",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].file == "apps/api/src/core/entity_manager/manager.py"


def test_repository_mixin_name_is_repository_layer_for_orm_leak_rule(tmp_path) -> None:
    repository = tmp_path / "apps/api/src/modules/sites/runtime/repository.py"
    repository.parent.mkdir(parents=True)
    repository.write_text(
        "\n".join(
            [
                "class RuntimeRepositoryMixin:",
                "    async def get_site(self):",
                "        return await SiteRecord.filter(id=site_id).first()",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("architecture.orm-leak",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_repository_rule_accepts_canonical_base_after_mixins(tmp_path) -> None:
    repository = tmp_path / "apps/api/src/modules/sites/repository.py"
    repository.parent.mkdir(parents=True)
    repository.write_text(
        "\n".join(
            [
                "class SitesRepository(RuntimeQueries, SettingsQueries, TortoiseORMRepository):",
                "    pass",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("repository.must-extend-tortoise-orm",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


@pytest.mark.parametrize(
    ("source", "expected_evidence"),
    (
        (
            "from src.common.repositories.base import BaseRepository\n"
            "class GoodRepository(TortoiseORMRepository):\n"
            "    pass\n",
            "from src.common.repositories.base import BaseRepository",
        ),
        (
            "from src.common.repositories import BaseRepository\n"
            "class GoodRepository(TortoiseORMRepository):\n"
            "    pass\n",
            "from src.common.repositories import BaseRepository",
        ),
        (
            "class BadRepository(BaseRepository):\n"
            "    pass\n",
            "class BadRepository(BaseRepository): ...",
        ),
        (
            "BaseRepository = TortoiseORMRepository\n",
            "BaseRepository = TortoiseORMRepository",
        ),
        (
            "class BadRepository:\n"
            "    async def list_users(self):\n"
            "        return await User.filter(is_active=True).first()\n",
            "class BadRepository: ...",
        ),
    ),
)
def test_repository_rule_rejects_legacy_base_repository_patterns(
    tmp_path,
    source: str,
    expected_evidence: str,
) -> None:
    repository = tmp_path / "apps/api/src/modules/auth/repository.py"
    repository.parent.mkdir(parents=True)
    repository.write_text(source, encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("repository.must-extend-tortoise-orm",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "repository.must-extend-tortoise-orm"
    assert report.findings[0].evidence == expected_evidence


@pytest.mark.parametrize(
    "source",
    (
        "class GoodRepository(TortoiseORMRepository):\n"
        "    pass\n",
        "class TenantContentRepository(TenantScopedRepository):\n"
        "    pass\n",
    ),
)
def test_repository_rule_accepts_canonical_repository_bases(tmp_path, source: str) -> None:
    repository = tmp_path / "apps/api/src/modules/projects/repository.py"
    repository.parent.mkdir(parents=True)
    repository.write_text(source, encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("repository.must-extend-tortoise-orm",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_lifecycle_subscriber_rule_reads_runtime_registrations(tmp_path) -> None:
    subscribers = tmp_path / "apps/api/src/core/lifecycles/subscribers"
    subscribers.mkdir(parents=True)
    (subscribers / "audit.py").write_text("async def audit_lifecycle_events(event):\n    pass\n", encoding="utf-8")
    runtime_init = tmp_path / "apps/api/src/core/runtime_init.py"
    runtime_init.write_text(
        "\n".join(
            [
                "async def init(lifecycle_dispatcher):",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_CREATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_CREATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_UPDATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_UPDATE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_DELETE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_DELETE, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.BEFORE_PUBLISH, handler=handler)",
                "    await lifecycle_dispatcher.register(action=LifecycleAction.AFTER_PUBLISH, handler=handler)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("lifecycle.missing-subscribers",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_skip_rationale_rule_ignores_skip_as_domain_word(tmp_path) -> None:
    test_file = tmp_path / "apps/api/tests/modules/sites/test_sites_resolve_content_service_unit.py"
    test_file.parent.mkdir(parents=True)
    test_file.write_text(
        "\n".join(
            [
                "def test_skip_empty_strings():",
                "    payload = {'skip': None}",
                "    assert payload['skip'] is None",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("test.no-skipped-without-rationale",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()
