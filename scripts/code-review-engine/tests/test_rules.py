from __future__ import annotations

import pytest

from code_review_engine.engine import run_audit
from code_review_engine.migrated.contracts import Violation
from code_review_engine.migrated.rules.base import AuditRule
from code_review_engine.models import AuditScope, RuleMetadata, RuleStability, ScopeSelector, Severity
from code_review_engine.rules import DEFAULT_REGISTRY, ExecutableRule, RuleRegistry


def test_registry_filters_by_scope() -> None:
    frontend_rules = DEFAULT_REGISTRY.select(ScopeSelector(scope=AuditScope.FRONTEND))
    rule_ids = {rule.metadata.id for rule in frontend_rules}

    assert "frontend.route-no-api-calls" in rule_ids
    assert "hard-cut.openapi-single-source" in rule_ids
    assert "service.no-direct-orm" not in rule_ids
    assert len(DEFAULT_REGISTRY.all()) >= 30


def test_registry_rejects_unknown_rule_id() -> None:
    with pytest.raises(ValueError, match="Unknown rule id"):
        DEFAULT_REGISTRY.select(ScopeSelector(scope=AuditScope.RULES, selected_rules=("missing.rule",)))


def test_registry_rejects_missing_rule_implementation() -> None:
    with pytest.raises(ValueError, match="implementation is required"):
        RuleRegistry(
            rules=(
                ExecutableRule(
                    metadata=_metadata(rule_id="custom.missing-implementation"),
                    implementation=None,
                    symbol_driven=False,
                ),
            )
        )


def test_registry_rejects_blocking_stability_for_non_blocker_severity() -> None:
    with pytest.raises(ValueError, match="blocking stability requires BLOCKER severity"):
        RuleRegistry(
            rules=(
                ExecutableRule(
                    metadata=_metadata(
                        rule_id="custom.noop",
                        severity=Severity.MAJOR,
                        stability=RuleStability.BLOCKING,
                    ),
                    implementation=_NoopRule(),
                    symbol_driven=False,
                ),
            )
        )


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


def _metadata(
    *,
    rule_id: str,
    severity: Severity = Severity.BLOCKER,
    stability: RuleStability = RuleStability.PROTOTYPE,
) -> RuleMetadata:
    return RuleMetadata(
        id=rule_id,
        title="Fixture rule",
        category="test",
        severity=severity,
        supported_scopes=(AuditScope.RULES,),
        source=("tests/test_rules.py",),
        stability=stability,
        owner="quality",
        autofix="none",
        dedupe_key=rule_id,
    )


class _NoopRule(AuditRule):
    rule_id = "custom.noop"
    description = "Fixture noop rule."

    def check(self, symbols: list[dict]) -> list[Violation]:
        return []


def test_openapi_single_source_flags_removed_contract_package_and_imports(tmp_path) -> None:
    contracts_file = tmp_path / "packages/contracts/src/index.ts"
    package_file = tmp_path / "packages/management-sdk/package.json"
    source_file = tmp_path / "packages/management-sdk/src/types.ts"
    admin_barrel = tmp_path / "apps/admin/src/types/api/index.ts"
    for path in (contracts_file, package_file, source_file, admin_barrel):
        path.parent.mkdir(parents=True, exist_ok=True)
    contracts_file.write_text("export type Legacy = {};\n", encoding="utf-8")
    package_file.write_text('{"dependencies":{"@arclayer/contracts":"workspace:*"}}\n', encoding="utf-8")
    source_file.write_text('import type { Legacy } from "@arclayer/contracts";\n', encoding="utf-8")
    admin_barrel.write_text('export * from "@arclayer/openapi/admin-types";\n', encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("hard-cut.openapi-single-source",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 4
    assert {finding.rule_id for finding in report.findings} == {"hard-cut.openapi-single-source"}


def test_openapi_single_source_allows_direct_generated_imports_and_ui_models(tmp_path) -> None:
    admin_types = tmp_path / "apps/admin/src/types/api/projects.ts"
    admin_types.parent.mkdir(parents=True, exist_ok=True)
    admin_types.write_text(
        "\n".join(
            [
                'import type { ProjectDetailOut } from "@arclayer/openapi/admin-types";',
                "",
                "export type ProjectListItemRow = {",
                "  id: ProjectDetailOut['id'];",
                "  statusLabel: string;",
                "};",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("hard-cut.openapi-single-source",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_openapi_single_source_flags_generated_request_aliases_in_admin_types(tmp_path) -> None:
    admin_types = tmp_path / "apps/admin/src/types/api/uploads.ts"
    admin_types.parent.mkdir(parents=True, exist_ok=True)
    admin_types.write_text(
        "\n".join(
            [
                'import type { UploadInitRequest as OpenApiUploadInitRequest } from "@arclayer/openapi/admin-types";',
                "",
                "export type UploadInitRequest = OpenApiUploadInitRequest;",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("hard-cut.openapi-single-source",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "hard-cut.openapi-single-source"


def test_openapi_single_source_allows_test_files_describing_removed_contract_import(tmp_path) -> None:
    test_file = tmp_path / "apps/admin/src/pages/workspaces/assets/__tests__/hard-cut-contracts.test.ts"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text(
        "\n".join(
            [
                'const forbiddenExample = \'import type { Legacy } from "@arclayer/contracts";\';',
                "expect(forbiddenExample).toContain('@arclayer/contracts');",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("hard-cut.openapi-single-source",)),
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


def test_backend_dataclass_rule_flags_production_source_only(tmp_path) -> None:
    production_file = tmp_path / "apps/api/src/core/query/parser.py"
    production_file.parent.mkdir(parents=True)
    production_file.write_text(
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
    test_file = tmp_path / "apps/api/tests/core/test_query_parser.py"
    test_file.parent.mkdir(parents=True)
    test_file.write_text(
        "\n".join(
            [
                "from dataclasses import dataclass",
                "",
                "@dataclass",
                "class QueryPlanFixture:",
                "    limit: int",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.no-production-dataclass",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) >= 2
    assert all(finding.rule_id == "backend.no-production-dataclass" for finding in report.findings)
    assert all(finding.file.startswith("apps/api/src/") for finding in report.findings)
    assert all("dataclasses" in finding.evidence or "@dataclass" in finding.evidence for finding in report.findings)


def test_backend_dataclass_rule_flags_aliases_and_factory_calls(tmp_path) -> None:
    production_file = tmp_path / "apps/api/src/core/query/parser.py"
    production_file.parent.mkdir(parents=True)
    production_file.write_text(
        "\n".join(
            [
                "import dataclasses as dc",
                "from dataclasses import dataclass as dc_model",
                "",
                "@dc_model(frozen=True)",
                "class QueryPlan:",
                "    limit: int",
                "",
                "RuntimePlan = dc.dataclass(type('RuntimePlan', (), {'limit': 10}))",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.no-production-dataclass",)),
        registry=DEFAULT_REGISTRY,
    )

    evidence = "\n".join(finding.evidence for finding in report.findings)
    assert len(report.findings) >= 4
    assert "import dataclasses as dc" in evidence
    assert "from dataclasses import dataclass as dc_model" in evidence
    assert "@dc_model(frozen=True)" in evidence
    assert "RuntimePlan = dc.dataclass" in evidence


def test_backend_dataclass_rule_reports_unparseable_production_file(tmp_path) -> None:
    production_file = tmp_path / "apps/api/src/core/query/parser.py"
    production_file.parent.mkdir(parents=True)
    production_file.write_text("def broken(:\n", encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.no-production-dataclass",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "backend.no-production-dataclass"
    assert report.findings[0].file == "apps/api/src/core/query/parser.py"
    assert "SyntaxError" in report.findings[0].evidence


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


def test_repository_rule_accepts_parameterized_canonical_base(tmp_path) -> None:
    repository = tmp_path / "apps/api/src/modules/access_restrictions/repository.py"
    repository.parent.mkdir(parents=True)
    repository.write_text(
        "\n".join(
            [
                "class AccessRestrictionRepository(",
                "    TortoiseORMRepository[AccessRestrictionRecord]",
                "):",
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


def test_service_base_rule_flags_service_without_base_service(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService:",
                "    async def list_projects(self):",
                "        return []",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.must-extend-base-service",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.must-extend-base-service"


def test_service_base_rule_accepts_base_service(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def list_projects(self):",
                "        return []",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.must-extend-base-service",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_event_publish_rule_flags_direct_publish(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def publish(self):",
                "        await events.publish(Event(name='project.changed'))",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-direct-event-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-direct-event-publish"


def test_service_event_publish_rule_flags_direct_event_bus_publish(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def publish(self, event_bus):",
                "        await event_bus.publish(Event(name='project.changed'))",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-direct-event-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-direct-event-publish"


def test_service_event_publish_rule_accepts_base_service_publisher(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def publish(self):",
                "        await self.publish_optional_domain_event(name='project.changed')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-direct-event-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_backend_local_query_parser_rule_flags_module_parser(tmp_path) -> None:
    parser_file = tmp_path / "apps/api/src/modules/sites/content/query_helpers.py"
    parser_file.parent.mkdir(parents=True)
    parser_file.write_text(
        "\n".join(
            [
                "def parse_sort(raw):",
                "    return raw.split(',')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.no-local-query-parsers",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "backend.no-local-query-parsers"


def test_backend_local_query_parser_rule_accepts_core_query_import(tmp_path) -> None:
    parser_file = tmp_path / "apps/api/src/modules/sites/content/query_helpers.py"
    parser_file.parent.mkdir(parents=True)
    parser_file.write_text(
        "\n".join(
            [
                "from src.core.query import QueryParser",
                "",
                "def parse_sort(raw):",
                "    return QueryParser.parse_sort(raw)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.no-local-query-parsers",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_backend_graphql_repository_rule_flags_resolver_repository_import(tmp_path) -> None:
    resolver = tmp_path / "apps/api/src/modules/sites/graphql/resolvers/content.py"
    resolver.parent.mkdir(parents=True)
    resolver.write_text(
        "\n".join(
            [
                "from src.modules.sites.repository import SitesRepository",
                "",
                "async def resolve_site():",
                "    return await SitesRepository().find_one()",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.graphql-no-repository-access",)),
        registry=DEFAULT_REGISTRY,
    )

    assert {finding.rule_id for finding in report.findings} == {"backend.graphql-no-repository-access"}


def test_backend_graphql_repository_rule_accepts_service_module_repository(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/sites/graphql/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "from src.modules.sites.repository import SitesRepository",
                "",
                "class SiteGraphQLService:",
                "    def __init__(self):",
                "        self.repo = SitesRepository()",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.graphql-no-repository-access",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_backend_sanitize_external_sinks_rule_flags_unsanitized_activity_sink(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/ingest/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "async def ingest(payload):",
                "    await write_required_activity_event(payload=payload)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.sanitize-external-sinks",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "backend.sanitize-external-sinks"


def test_backend_sanitize_external_sinks_rule_accepts_canonical_sanitizer(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/ingest/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "from src.core.sanitize import OutputSanitizer",
                "",
                "async def ingest(payload):",
                "    cleaned = OutputSanitizer.sanitize_response(payload)",
                "    await write_required_activity_event(payload=cleaned)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.sanitize-external-sinks",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_backend_sanitize_external_sinks_rule_accepts_sanitized_row_payload(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/audit.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "async def ingest(payload):",
                "    properties = sanitize_properties(payload)",
                "    row = {'properties': properties}",
                "    await AuditEvent.create(**row)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.sanitize-external-sinks",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_backend_sanitize_external_sinks_rule_accepts_sanitized_list_comprehension(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/repository.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "SanitizedAuditEventRow = dict[str, object]",
                "",
                "async def create_many(rows: list[SanitizedAuditEventRow]):",
                "    objs = [AuditEvent(**row) for row in rows]",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.sanitize-external-sinks",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_backend_sanitize_external_sinks_rule_rejects_sanitized_name_without_call(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/ingest/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "async def ingest(payload):",
                "    SanitizedAuditEventRow = dict[str, object]",
                "    await write_required_activity_event(payload=payload)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.sanitize-external-sinks",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "backend.sanitize-external-sinks"


def test_backend_sanitize_external_sinks_rule_reports_parse_failures(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/analytics/ingest/service.py"
    service.parent.mkdir(parents=True)
    service.write_text("async def broken(:\n", encoding="utf-8")

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.sanitize-external-sinks",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "backend.sanitize-external-sinks"
    assert "could not parse" in report.findings[0].message


def test_backend_plugin_typed_payload_rule_flags_untyped_payload_dict(tmp_path) -> None:
    specs = tmp_path / "apps/api/src/core/plugin/specs.py"
    specs.parent.mkdir(parents=True)
    specs.write_text(
        "\n".join(
            [
                "class ArclayerSpec:",
                "    def arclayer_hook(self, payload: dict[str, object]) -> None:",
                "        pass",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.plugin-typed-payloads",)),
        registry=DEFAULT_REGISTRY,
    )

    assert {finding.rule_id for finding in report.findings} == {"backend.plugin-typed-payloads"}


def test_backend_plugin_typed_payload_rule_accepts_pydantic_payload_model(tmp_path) -> None:
    specs = tmp_path / "apps/api/src/core/plugin/specs.py"
    specs.parent.mkdir(parents=True)
    specs.write_text(
        "\n".join(
            [
                "from pydantic import BaseModel",
                "",
                "class HookPayload(BaseModel):",
                "    plugin_name: str",
                "",
                "class ArclayerSpec:",
                "    def arclayer_hook(self, payload: HookPayload) -> None:",
                "        pass",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("backend.plugin-typed-payloads",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_optional_activity_publish_rule_flags_activity_event(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/workspaces/team/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class WorkspaceTeamService(BaseService):",
                "    async def invite(self):",
                "        await self.publish_optional_domain_event(name='workspace.member.invited')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-optional-activity-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-optional-activity-publish"


def test_service_optional_activity_publish_rule_flags_activity_helper(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/workspaces/team/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class WorkspaceTeamService(BaseService):",
                "    async def invite(self):",
                "        await self._publish_activity_event(name='workspace.invite.email.created', payload={})",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-optional-activity-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-optional-activity-publish"


def test_service_optional_activity_publish_rule_flags_service_mixin_activity_helper(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/workspaces/team/invites/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class WorkspaceTeamInviteMixin:",
                "    async def create_email_invite(self):",
                "        await self._publish_activity_event(name='workspace.invite.email.created', payload={})",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-optional-activity-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-optional-activity-publish"


def test_service_optional_activity_publish_rule_flags_known_activity_constant(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/assets/admin/uploads/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "ASSET_UPLOADED_EVENT = 'asset.uploaded'",
                "",
                "class AssetUploadService(BaseService):",
                "    async def complete(self):",
                "        await self.publish_optional_domain_event(name=ASSET_UPLOADED_EVENT, payload={})",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-optional-activity-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-optional-activity-publish"


def test_service_optional_activity_publish_rule_accepts_non_activity_event(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/workspaces/team/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class WorkspaceTeamService(BaseService):",
                "    async def notify(self):",
                "        await self.publish_optional_domain_event(name='notification.delivered')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-optional-activity-publish",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_required_activity_coverage_rule_flags_target_write_without_activity(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/workspaces/team/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class WorkspaceTeamService(BaseService):",
                "    async def set_member_roles(self):",
                "        await self.repo.replace_membership_roles(role_codes=['editor'])",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.required-activity-coverage",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.required-activity-coverage"


def test_service_required_activity_coverage_rule_accepts_required_activity_helper(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/workspaces/team/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class WorkspaceTeamService(BaseService):",
                "    async def set_member_roles(self):",
                "        await self.repo.replace_membership_roles(role_codes=['editor'])",
                "        await self._write_activity_event(name='workspace.member.roles_updated')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.required-activity-coverage",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_required_activity_coverage_rule_accepts_direct_required_writer(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/system/settings/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class SettingsService(BaseService):",
                "    async def patch_namespace(self):",
                "        await self.repo.upsert(namespace='mail')",
                "        await write_required_activity_event(payload=payload, conn=conn)",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.required-activity-coverage",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_required_activity_coverage_rule_ignores_non_matrix_write(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/automation/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectAutomationService(BaseService):",
                "    async def create_flow_out(self):",
                "        return await self.repo.create_flow(name='Flow')",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.required-activity-coverage",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_dependency_construction_rule_flags_method_repository_construction(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def update_project(self):",
                "        repo = ProjectsRepository()",
                "        return await repo.get()",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-method-dependency-construction",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-method-dependency-construction"


def test_service_dependency_construction_rule_accepts_constructor_injection(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    def __init__(self, repo=None):",
                "        self.repo = repo or ProjectsRepository()",
                "    async def update_project(self):",
                "        return await self.repo.get()",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-method-dependency-construction",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_tx_rule_flags_direct_in_transaction_call(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def update_project(self):",
                "        async with in_transaction() as conn:",
                "            return conn",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-direct-in-transaction",)),
        registry=DEFAULT_REGISTRY,
    )

    assert len(report.findings) == 1
    assert report.findings[0].rule_id == "service.no-direct-in-transaction"


def test_service_tx_rule_accepts_base_service_tx(tmp_path) -> None:
    service = tmp_path / "apps/api/src/modules/projects/service.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class ProjectService(BaseService):",
                "    async def update_project(self):",
                "        async with self.tx() as conn:",
                "            return conn",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-direct-in-transaction",)),
        registry=DEFAULT_REGISTRY,
    )

    assert report.findings == ()


def test_service_tx_rule_skips_base_service_foundation(tmp_path) -> None:
    service = tmp_path / "apps/api/src/core/services/base.py"
    service.parent.mkdir(parents=True)
    service.write_text(
        "\n".join(
            [
                "class BaseService:",
                "    async def tx(self):",
                "        async with in_transaction() as conn:",
                "            return conn",
                "",
            ]
        ),
        encoding="utf-8",
    )

    report = run_audit(
        repo_root=tmp_path,
        selector=ScopeSelector(scope=AuditScope.RULES, selected_rules=("service.no-direct-in-transaction",)),
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
