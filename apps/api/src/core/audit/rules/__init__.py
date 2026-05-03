"""Audit rule registry — hard-cut new architecture enforcement.

Target architecture:
  - Repository: TortoiseORMRepository (core/repository/implementations/tortoise.py)
  - Write gateway: EntityManager (core/entity_manager/manager.py)
  - Lifecycle hooks: LifecycleDispatcher (core/lifecycles/dispatcher.py)
  - Plugin system: core/plugin/
  - Schema: strict Pydantic v2 BaseModel
  - i18n: full t(namespace, key) coverage
  - Test coverage: 90%+

Hard-cut principle: one canonical contract surface per domain boundary.
No facades, no shims, no dual old+new patterns.
"""

from __future__ import annotations

from src.core.audit.rules.architecture import (
    ORMLeakDetection,
    RouterNoDirectRepository,
    WritePathViolation,
)
from src.core.audit.rules.base import AuditRule
from src.core.audit.rules.endpoint import (
    EndpointMissingDocstring,
    EndpointMissingResponseModel,
)
from src.core.audit.rules.entity_manager import (
    EntityManagerNoAnyFields,
    EntityManagerNoDataclassReturn,
    EntityManagerWriteMustUseEM,
)
from src.core.audit.rules.filesystem import ModuleStructureRule
from src.core.audit.rules.frontend import (
    FrontendDataMustUseReactQuery,
    FrontendNoAny,
    FrontendPageStructureRule,
    FrontendRouteNoAPICalls,
)
from src.core.audit.rules.hard_cut import NoDualRepositoryPattern, NoShimFacadePattern
from src.core.audit.rules.i18n import (
    InvalidI18nKeyFormat,
    InvalidI18nNamespace,
    MissingI18nRule,
)
from src.core.audit.rules.lifecycle import (
    LifecycleMustDispatchHooks,
    LifecycleSubscriberCoverage,
)
from src.core.audit.rules.plugin import PluginMustHaveLocales, PluginMustRegisterLifecycle
from src.core.audit.rules.repository import (
    RepositoryMustExtendTortoiseORM,
    RepositoryNoBusinessLogic,
)
from src.core.audit.rules.schema_rules import (
    SchemaMustExtendBase,
    SchemaNoAnyDictFields,
)
from src.core.audit.rules.service import ServiceNoDirectORM
from src.core.audit.rules.test_coverage import (
    CoreMustHaveTests,
    ModuleMustHaveTests,
    NoSkippedTestsWithoutRationale,
)

ALL_RULES: list[AuditRule] = [
    # ── Backend: Service ──
    ServiceNoDirectORM(),
    # ── Backend: Repository — must use TortoiseORMRepository (new architecture) ──
    RepositoryMustExtendTortoiseORM(),
    RepositoryNoBusinessLogic(),
    # ── Backend: EntityManager — universal write gateway ──
    EntityManagerNoDataclassReturn(),
    EntityManagerNoAnyFields(),
    EntityManagerWriteMustUseEM(),
    # ── Backend: Lifecycle hooks — must dispatch on all writes ──
    LifecycleMustDispatchHooks(),
    LifecycleSubscriberCoverage(),
    # ── Backend: Schema ──
    SchemaNoAnyDictFields(),
    SchemaMustExtendBase(),
    # ── Backend: Endpoint Contract ──
    EndpointMissingResponseModel(),
    EndpointMissingDocstring(),
    # ── i18n ──
    MissingI18nRule(),
    InvalidI18nKeyFormat(),
    InvalidI18nNamespace(),
    # ── Architecture (cross-layer) ──
    ORMLeakDetection(),
    WritePathViolation(),
    RouterNoDirectRepository(),
    # ── Hard-Cut Enforcement ──
    NoDualRepositoryPattern(),
    NoShimFacadePattern(),
    # ── Plugin Architecture ──
    PluginMustRegisterLifecycle(),
    PluginMustHaveLocales(),
    # ── Test Coverage (90%+ requirement) ──
    ModuleMustHaveTests(),
    CoreMustHaveTests(),
    NoSkippedTestsWithoutRationale(),
    # ── Filesystem ──
    ModuleStructureRule(),
    # ── Frontend ──
    FrontendNoAny(),
    FrontendRouteNoAPICalls(),
    FrontendDataMustUseReactQuery(),
    FrontendPageStructureRule(),
]
