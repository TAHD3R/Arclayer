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

from code_review_engine.migrated.rules.architecture import (
    ORMLeakDetection,
    RouterNoDirectRepository,
    WritePathViolation,
)
from code_review_engine.migrated.rules.backend_dataclass import BackendNoProductionDataclass
from code_review_engine.migrated.rules.backend_infrastructure import (
    BackendGraphQLNoRepositoryAccess,
    BackendNoLocalQueryParsers,
    BackendPluginTypedPayloads,
    BackendSanitizeExternalSinks,
)
from code_review_engine.migrated.rules.base import AuditRule
from code_review_engine.migrated.rules.endpoint import (
    EndpointMissingDocstring,
    EndpointMissingResponseModel,
)
from code_review_engine.migrated.rules.entity_manager import (
    EntityManagerNoAnyFields,
    EntityManagerWriteMustUseEM,
)
from code_review_engine.migrated.rules.filesystem import ModuleStructureRule
from code_review_engine.migrated.rules.frontend import (
    FrontendDataMustUseReactQuery,
    FrontendNoAny,
    FrontendPageStructureRule,
    FrontendRouteNoAPICalls,
)
from code_review_engine.migrated.rules.hard_cut import (
    NoDualRepositoryPattern,
    NoShimFacadePattern,
    OpenApiSingleSourceRule,
)
from code_review_engine.migrated.rules.i18n import (
    InvalidI18nKeyFormat,
    InvalidI18nNamespace,
    MissingI18nRule,
)
from code_review_engine.migrated.rules.lifecycle import (
    LifecycleMustDispatchHooks,
    LifecycleSubscriberCoverage,
)
from code_review_engine.migrated.rules.plugin import PluginMustHaveLocales, PluginMustRegisterLifecycle
from code_review_engine.migrated.rules.repository import (
    RepositoryMustExtendTortoiseORM,
    RepositoryNoBusinessLogic,
)
from code_review_engine.migrated.rules.schema_rules import (
    SchemaMustExtendBase,
    SchemaNoAnyDictFields,
)
from code_review_engine.migrated.rules.service import (
    ServiceNoDirectInTransaction,
    ServiceNoMethodDependencyConstruction,
    ServiceMustExtendBaseService,
    ServiceNoDirectEventPublish,
    ServiceNoDirectORM,
    ServiceNoOptionalActivityPublish,
    ServiceRequiredActivityCoverage,
)
from code_review_engine.migrated.rules.test_coverage import (
    CoreMustHaveTests,
    ModuleMustHaveTests,
    NoSkippedTestsWithoutRationale,
)

ALL_RULES: list[AuditRule] = [
    # ── Backend: Service ──
    ServiceNoDirectORM(),
    ServiceMustExtendBaseService(),
    ServiceNoDirectEventPublish(),
    ServiceNoOptionalActivityPublish(),
    ServiceRequiredActivityCoverage(),
    ServiceNoMethodDependencyConstruction(),
    ServiceNoDirectInTransaction(),
    # ── Backend: Repository — must use TortoiseORMRepository (new architecture) ──
    RepositoryMustExtendTortoiseORM(),
    RepositoryNoBusinessLogic(),
    # ── Backend: Production dataclass ban ──
    BackendNoProductionDataclass(),
    BackendNoLocalQueryParsers(),
    BackendGraphQLNoRepositoryAccess(),
    BackendSanitizeExternalSinks(),
    BackendPluginTypedPayloads(),
    # ── Backend: EntityManager — universal write gateway ──
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
    OpenApiSingleSourceRule(),
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
