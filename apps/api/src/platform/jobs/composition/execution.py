from __future__ import annotations

from collections.abc import Iterable
from functools import partial
from pathlib import Path
from random import random
from types import MappingProxyType
from uuid import UUID

from pydantic import ConfigDict

from src.agents.checkpointing import build_agent_checkpointer_factory
from src.agents.langgraph_runtime import AgentGraphCheckpointerFactory
from src.common.email.service import EmailService
from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.registries import ConnectorRegistry
from src.migrations.models.tenant_control import TENANT_CONTROL_MIGRATIONS
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.access_restrictions.repository import AccessRestrictionRepository
from src.modules.access_restrictions.service import AccessRestrictionAuthority
from src.modules.ai.agent_skill_grant_service import build_agent_skill_grant_resolver
from src.modules.ai.runtime_design_tool import BuilderDesignAgentToolExecutor
from src.modules.ai.runtime_job_handler import AgentRunJobHandler
from src.modules.ai.runtime_job_schema import AGENT_RUN_JOB_TYPE, AGENT_RUN_JOB_TYPE_VERSION
from src.modules.ai.runtime_knowledge_context import TenantAgentKnowledgeContextResolver
from src.modules.ai.runtime_langgraph_gateway import LangGraphAgentRunExecutionGateway
from src.modules.ai.runtime_model_step_gateway import ModelToolAgentRunExecutionGateway
from src.modules.ai.runtime_policy_authorizer import GlobalAgentToolPolicyAuthorizer
from src.modules.ai.runtime_project_bootstrap_tool import ProjectBootstrapToolExecutor
from src.modules.ai.runtime_skill_creator_tool import WorkspaceSkillAuthoringAgentToolExecutor
from src.modules.ai.runtime_style_guide_tool import DesignSystemConceptAgentToolExecutor
from src.modules.ai.runtime_wireframe_tool import BuilderWireframeAgentToolExecutor
from src.modules.ai.service import AIChatService
from src.modules.assets.admin.assets.repository import AdminAssetsRepository
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_JOB_TYPE,
    ASSET_THUMBNAIL_JOB_TYPE_VERSION,
    AssetThumbnailJobHandler,
    AssetThumbnailProviderEffectCoordinator,
    AssetThumbnailProviderEffectRecoveryCoordinator,
    AssetThumbnailProviderEffectRecoveryHandler,
    ExactAssetThumbnailProviderStorageResolver,
    RoutedAssetThumbnailRecoveryOutcomeRepository,
    StorageAssetThumbnailPipeline,
    TenantAssetThumbnailRepository,
    build_asset_thumbnail_provider_effect_contract,
)
from src.modules.commerce.access_state.fact_consumer_job_contract import (
    COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
    COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
)
from src.modules.commerce.access_state.fact_consumer_job_handler import CommercialAccessFactJobHandler
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_JOB_TYPE,
    BILLING_CONNECTOR_EVENT_JOB_TYPE_VERSION,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.dunning.command_policy import build_commercial_access_job_authorizer
from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer
from src.modules.jobs.actor_authorizer import WorkspaceActorJobAuthorizer
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_boundary import (
    ScopedJobExecutionBoundary,
    validate_production_execution_boundary_capabilities,
)
from src.modules.jobs.execution_errors import JobExecutionRegistryError
from src.modules.jobs.execution_registry import (
    JobExecutionRegistry,
    JobHandlerFactory,
    JobTypeRegistration,
)
from src.modules.jobs.execution_service import BackgroundJobExecutionService
from src.modules.jobs.execution_terminal_service import BackgroundJobTerminalService
from src.modules.jobs.provider_effect_contracts import ProviderEffectContractRegistry
from src.modules.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
)
from src.modules.jobs.provider_effect_service import ProviderEffectService
from src.modules.jobs.reaper_service import BackgroundJobLeaseReaperService
from src.modules.jobs.registry import JobTypeKey, JobTypeRegistry
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.service import BackgroundJobService
from src.modules.jobs.target_resolver import ProjectJobTargetResolver, WorkspaceJobTargetResolver
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.projects.builder.composition_saga_job_contract import (
    BUILDER_PLANNING_GENERATION_JOB_TYPE,
    BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION,
)
from src.modules.projects.builder.composition_saga_projection import BuilderCompositionSagaChildProjector
from src.modules.projects.builder.composition_saga_provider import LLMBuilderPlanningGenerator
from src.modules.projects.builder.composition_saga_repository import BuilderCompositionSagaRepository
from src.modules.projects.builder.generation_handler import BuilderGenerationJobHandler
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_DESIGN_GENERATION_JOB_TYPE,
    BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION,
    BUILDER_GENERATION_JOB_TYPE,
    BUILDER_GENERATION_JOB_TYPE_VERSION,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
)
from src.modules.projects.builder.generation_provider import (
    LLMBuilderDesignGenerator,
    LLMBuilderSitemapGenerator,
    LLMBuilderWireframeGenerator,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_service import BuilderGenerationService
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.service import SiteBuilderService
from src.modules.projects.design_systems.concept_handler import DesignSystemConceptGenerationJobHandler
from src.modules.projects.design_systems.concept_job_contract import (
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
)
from src.modules.projects.design_systems.concept_provider import LLMDesignSystemConceptGenerator
from src.modules.projects.design_systems.concept_repository import DesignSystemConceptGenerationRepository
from src.modules.projects.design_systems.concept_service import DesignSystemConceptGenerationService
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.design_systems.version_service import ProjectDesignSystemVersionService
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.service import build_project_service
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.sites.delivery.hosting import SitesHostingDeliveryAdapter
from src.modules.system.admin.notifications.campaign_job_contract import (
    NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE,
    NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION,
)
from src.modules.system.admin.notifications.campaign_job_handler import NotificationCampaignJobHandler
from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
    CommercialLifecycleNotificationConsumer,
    TortoiseCommercialLifecycleNotificationPersistence,
)
from src.modules.system.plugins.job_contract import (
    PLUGIN_LIFECYCLE_JOB_TYPE,
    PLUGIN_LIFECYCLE_JOB_TYPE_VERSION,
)
from src.modules.system.plugins.job_handler import PluginLifecycleJobHandler
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.tenancy.repository import TenancyRepository
from src.modules.workspaces.design_systems.publication_assets import DesignSystemAssetPinResolver
from src.modules.workspaces.design_systems.publication_contract import (
    DESIGN_SYSTEM_COMPILE_JOB_TYPE,
    DESIGN_SYSTEM_COMPILE_JOB_TYPE_VERSION,
)
from src.modules.workspaces.design_systems.publication_handler import DesignSystemPublicationJobHandler
from src.modules.workspaces.design_systems.publication_repository import DesignSystemPublicationRepository
from src.modules.workspaces.design_systems.repository import WorkspaceDesignSystemsRepository
from src.modules.workspaces.design_systems.service import WorkspaceDesignSystemsService
from src.modules.workspaces.design_systems.starter import WorkspaceStarterDesignSystemOrchestrator
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
    KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
)
from src.modules.workspaces.knowledge.indexing_handler import KnowledgeSourceIndexJobHandler
from src.modules.workspaces.knowledge.indexing_providers import (
    LiteLLMKnowledgeEmbeddingProvider,
    MeilisearchKnowledgeVectorIndex,
    RuleBasedKnowledgePromptInjectionScanner,
)
from src.modules.workspaces.knowledge.indexing_repository import TenantKnowledgeIndexRepository
from src.modules.workspaces.knowledge.ingestion import ManualMarkdownKnowledgeParser
from src.modules.workspaces.knowledge.ingestion_contract import (
    KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
    KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
)
from src.modules.workspaces.knowledge.ingestion_coordinator import TenantKnowledgeIngestionCoordinator
from src.modules.workspaces.knowledge.ingestion_handler import KnowledgeSourceIngestJobHandler
from src.modules.workspaces.knowledge.ingestion_repository import TenantKnowledgeIngestionRepository
from src.modules.workspaces.knowledge.source_fetch import (
    KnowledgeSourceFetchPolicy,
    UntrustedHttpKnowledgeFetcher,
)
from src.modules.workspaces.skills.github_fetcher import PublicGitHubSkillFetcher
from src.modules.workspaces.skills.github_import_contract import (
    SKILL_GITHUB_IMPORT_JOB_TYPE,
    SKILL_GITHUB_JOB_TYPE_VERSION,
    SKILL_GITHUB_REFRESH_JOB_TYPE,
)
from src.modules.workspaces.skills.github_import_coordinator import TenantSkillGitHubImportCoordinator
from src.modules.workspaces.skills.github_import_handler import (
    GitHubSkillSnapshotFetcher,
    SkillGitHubImportJobHandler,
)
from src.modules.workspaces.skills.github_import_repository import WorkspaceSkillGitHubImportRepository
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.lifecycle_service import WorkspaceSkillLifecycleService
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_service import WorkspaceOfficialSkillCatalogService
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.service import WorkspaceSkillsService
from src.platform.jobs.executor import DurableJobExecutor


class JobExecutionRuntime(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    job_types: JobTypeRegistry
    handlers: JobExecutionRegistry
    executor: DurableJobExecutor


class ProductionJobHandlerFactoryRegistry:
    """Exact production handler factories keyed by stable Job identity."""

    __slots__ = ("_factories",)

    def __init__(
        self,
        entries: Iterable[tuple[JobTypeKey, JobHandlerFactory]],
    ) -> None:
        factories: dict[JobTypeKey, JobHandlerFactory] = {}
        for identity, factory in entries:
            if identity in factories:
                raise JobExecutionRegistryError(
                    f"duplicate production handler factory for {_format_identity(identity)}"
                )
            factories[identity] = factory
        self._factories = MappingProxyType(factories)

    def build_registrations(
        self,
        *,
        job_types: JobTypeRegistry,
    ) -> tuple[JobTypeRegistration, ...]:
        if not job_types.strict_contracts:
            raise JobExecutionRegistryError("production handler factories require a strict JobTypeRegistry")
        definitions = job_types.list_definitions()
        expected = {definition.key for definition in definitions}
        actual = set(self._factories)
        if actual != expected:
            missing = sorted(_format_identity(identity) for identity in expected - actual)
            unexpected = sorted(_format_identity(identity) for identity in actual - expected)
            raise JobExecutionRegistryError(
                "production handler factories must match built-in Job types; "
                f"missing={missing}, unexpected={unexpected}"
            )
        validate_production_execution_boundary_capabilities(job_types=job_types)
        return tuple(
            JobTypeRegistration.from_definition(
                definition=definition,
                handler_factory=self._factories[definition.key],
            )
            for definition in definitions
        )


def build_job_execution_runtime(
    *,
    settings: Settings,
    workload_class: JobWorkloadClass,
    agent_checkpointer_factory: AgentGraphCheckpointerFactory | None = None,
    knowledge_url_fetcher: UntrustedHttpKnowledgeFetcher | None = None,
    skill_github_fetcher: GitHubSkillSnapshotFetcher | None = None,
    connector_registry: ConnectorRegistry | None = None,
) -> JobExecutionRuntime:
    """Compose one workload's exact definitions, handlers, and fenced executor."""

    global_job_types = build_builtin_job_type_registry(settings)
    global_registrations = _build_production_handler_factories(
        settings=settings,
        agent_checkpointer_factory=agent_checkpointer_factory,
        knowledge_url_fetcher=knowledge_url_fetcher,
        skill_github_fetcher=skill_github_fetcher,
        connector_registry=connector_registry if connector_registry is not None else ConnectorRegistry(),
    ).build_registrations(job_types=global_job_types)
    definitions = tuple(
        definition
        for definition in global_job_types.list_definitions()
        if JobWorkloadClass(definition.workload_class) == workload_class
    )
    job_types = JobTypeRegistry(definitions, strict_contracts=True)
    handlers = JobExecutionRegistry(
        job_types=job_types,
        registrations=tuple(
            registration
            for registration in global_registrations
            if JobWorkloadClass(registration.workload_class) == workload_class
        ),
    )
    repository = BackgroundJobRepository()
    execution = BackgroundJobExecutionService(
        settings,
        repository=repository,
        job_types=job_types,
        executions=handlers,
    )
    terminal = BackgroundJobTerminalService(
        settings,
        repository=repository,
        executions=handlers,
        retry_jitter=random,
    )
    lease_reaper = BackgroundJobLeaseReaperService(
        settings,
        repository=repository,
        retry_jitter=random,
    )
    project_resolver = _build_project_target_resolver()
    executor = DurableJobExecutor(
        execution=execution,
        terminal=terminal,
        lease_reaper=lease_reaper,
        job_types=job_types,
        handlers=handlers,
        boundary=ScopedJobExecutionBoundary(
            project_resolver=project_resolver,
            workspace_resolver=_build_workspace_target_resolver(),
            actor_authorizer=WorkspaceActorJobAuthorizer(),
            commercial_access_authorizer=build_commercial_access_job_authorizer(),
        ),
    )
    return JobExecutionRuntime(
        job_types=job_types,
        handlers=handlers,
        executor=executor,
    )


def _build_production_handler_factories(
    *,
    settings: Settings,
    agent_checkpointer_factory: AgentGraphCheckpointerFactory | None = None,
    knowledge_url_fetcher: UntrustedHttpKnowledgeFetcher | None = None,
    skill_github_fetcher: GitHubSkillSnapshotFetcher | None = None,
    connector_registry: ConnectorRegistry,
) -> ProductionJobHandlerFactoryRegistry:
    return ProductionJobHandlerFactoryRegistry((
        (
            JobTypeKey(
                job_type=AGENT_RUN_JOB_TYPE,
                job_type_version=AGENT_RUN_JOB_TYPE_VERSION,
            ),
            partial(
                _build_agent_run_handler,
                settings=settings,
                checkpointer_factory=agent_checkpointer_factory,
            ),
        ),
        (
            JobTypeKey(
                job_type=BUILDER_GENERATION_JOB_TYPE,
                job_type_version=BUILDER_GENERATION_JOB_TYPE_VERSION,
            ),
            partial(_build_builder_generation_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
                job_type_version=BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
            ),
            partial(_build_builder_generation_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=BUILDER_DESIGN_GENERATION_JOB_TYPE,
                job_type_version=BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION,
            ),
            partial(_build_builder_generation_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=BUILDER_PLANNING_GENERATION_JOB_TYPE,
                job_type_version=BUILDER_PLANNING_GENERATION_JOB_TYPE_VERSION,
            ),
            partial(_build_builder_generation_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
                job_type_version=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
            ),
            partial(_build_design_system_concept_generation_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=DESIGN_SYSTEM_COMPILE_JOB_TYPE,
                job_type_version=DESIGN_SYSTEM_COMPILE_JOB_TYPE_VERSION,
            ),
            partial(_build_design_system_publication_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=ASSET_THUMBNAIL_JOB_TYPE,
                job_type_version=ASSET_THUMBNAIL_JOB_TYPE_VERSION,
            ),
            partial(_build_asset_thumbnail_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
                job_type_version=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
            ),
            partial(
                _build_knowledge_source_ingest_handler,
                settings=settings,
                url_fetcher=knowledge_url_fetcher,
            ),
        ),
        (
            JobTypeKey(
                job_type=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
                job_type_version=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
            ),
            partial(_build_knowledge_source_index_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=SKILL_GITHUB_IMPORT_JOB_TYPE,
                job_type_version=SKILL_GITHUB_JOB_TYPE_VERSION,
            ),
            partial(
                _build_skill_github_import_handler,
                settings=settings,
                fetcher=skill_github_fetcher,
            ),
        ),
        (
            JobTypeKey(
                job_type=SKILL_GITHUB_REFRESH_JOB_TYPE,
                job_type_version=SKILL_GITHUB_JOB_TYPE_VERSION,
            ),
            partial(
                _build_skill_github_import_handler,
                settings=settings,
                fetcher=skill_github_fetcher,
            ),
        ),
        (
            JobTypeKey(
                job_type=BILLING_CONNECTOR_EVENT_JOB_TYPE,
                job_type_version=BILLING_CONNECTOR_EVENT_JOB_TYPE_VERSION,
            ),
            partial(
                _build_billing_connector_event_handler,
                settings=settings,
                connector_registry=connector_registry,
            ),
        ),
        (
            JobTypeKey(
                job_type=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
                job_type_version=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
            ),
            partial(
                _build_commercial_access_fact_handler,
                settings=settings,
                connector_registry=connector_registry,
            ),
        ),
        (
            JobTypeKey(
                job_type=PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
                job_type_version=PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
            ),
            partial(_build_provider_effect_recovery_handler, settings=settings),
        ),
        (
            JobTypeKey(
                job_type=NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE,
                job_type_version=NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION,
            ),
            partial(
                _build_notification_campaign_handler,
                settings=settings,
                connector_registry=connector_registry,
            ),
        ),
        (
            JobTypeKey(
                job_type=PLUGIN_LIFECYCLE_JOB_TYPE,
                job_type_version=PLUGIN_LIFECYCLE_JOB_TYPE_VERSION,
            ),
            partial(_build_plugin_lifecycle_handler, settings=settings),
        ),
    ))


def _build_billing_connector_event_handler(
    *,
    settings: Settings,
    connector_registry: ConnectorRegistry,
) -> BillingConnectorEventJobHandler:
    return BillingConnectorEventJobHandler(
        settings=settings,
        connectors=connector_registry,
    )


def _build_commercial_access_fact_handler(
    *,
    settings: Settings,
    connector_registry: ConnectorRegistry,
) -> CommercialAccessFactJobHandler:
    return CommercialAccessFactJobHandler(
        hosting=HostingCommercialAccessConsumer(delivery=SitesHostingDeliveryAdapter(settings=settings)),
        notifications=CommercialLifecycleNotificationConsumer(
            persistence=TortoiseCommercialLifecycleNotificationPersistence(settings=settings),
            email_sender=EmailService(settings, connector_registry=connector_registry),
        ),
    )


def _build_notification_campaign_handler(
    *,
    settings: Settings,
    connector_registry: ConnectorRegistry,
) -> NotificationCampaignJobHandler:
    return NotificationCampaignJobHandler(
        settings=settings,
        email_sender=EmailService(settings, connector_registry=connector_registry),
    )


def _build_plugin_lifecycle_handler(*, settings: Settings) -> PluginLifecycleJobHandler:
    return PluginLifecycleJobHandler(
        settings=settings,
        project_root=_resolve_project_root(),
    )


def _resolve_project_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pnpm-workspace.yaml").is_file() and (parent / "plugins").is_dir():
            return parent
    raise RuntimeError("Unable to resolve Arclayer project root for plugin lifecycle jobs")


def _build_agent_run_handler(
    *,
    settings: Settings,
    checkpointer_factory: AgentGraphCheckpointerFactory | None,
) -> AgentRunJobHandler:
    durable_checkpointer = checkpointer_factory or build_agent_checkpointer_factory(
        settings=settings,
        checkpointer="database",
    )
    return AgentRunJobHandler(
        settings=settings,
        skill_grant_resolver_factory=lambda: build_agent_skill_grant_resolver(require_current_tenant_context()),
        knowledge_context_resolver_factory=lambda: TenantAgentKnowledgeContextResolver(
            require_current_tenant_context()
        ),
        execution_gateway=LangGraphAgentRunExecutionGateway(
            step_gateway=ModelToolAgentRunExecutionGateway(
                chat_service=AIChatService(settings),
                tool_policy_authorizer=GlobalAgentToolPolicyAuthorizer(),
                project_bootstrap_executor=ProjectBootstrapToolExecutor(
                    project_service_factory=lambda: build_project_service(settings),
                    builder_service_factory=lambda tenant_context: SiteBuilderService(
                        repository=SiteBuilderRepository(tenant_context),
                        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
                        component_catalog_resolver=get_official_component_catalog_registry(),
                        settings=settings,
                    ),
                    tenant_context_factory=require_current_tenant_context,
                    workspace_design_system_default_ensurer=_build_workspace_starter_design_system_orchestrator(
                        settings=settings,
                    ),
                ),
                style_guide_executor=DesignSystemConceptAgentToolExecutor(
                    service_factory=lambda: _build_design_system_concept_generation_service(settings=settings),
                    organization_id_factory=lambda: require_current_tenant_context().identity.organization_id,
                ),
                wireframe_executor=BuilderWireframeAgentToolExecutor(
                    service_factory=lambda: _build_builder_generation_service(settings=settings),
                    organization_id_factory=lambda: require_current_tenant_context().identity.organization_id,
                    runtime_id_resolver=_resolve_primary_runtime_id,
                ),
                design_executor=BuilderDesignAgentToolExecutor(
                    service_factory=lambda: _build_builder_generation_service(settings=settings),
                    organization_id_factory=lambda: require_current_tenant_context().identity.organization_id,
                    runtime_id_resolver=_resolve_primary_runtime_id,
                ),
                skill_creator_executor=WorkspaceSkillAuthoringAgentToolExecutor(
                    skills_service_factory=lambda: WorkspaceSkillsService(
                        repository=WorkspaceSkillsRepository(require_current_tenant_context()),
                        settings=settings,
                    ),
                    lifecycle_service_factory=lambda: _build_workspace_skill_lifecycle_service(settings=settings),
                    organization_id_factory=lambda: require_current_tenant_context().identity.organization_id,
                ),
            ),
            checkpointer_factory=durable_checkpointer,
        ),
    )


def _build_workspace_starter_design_system_orchestrator(
    *,
    settings: Settings,
) -> WorkspaceStarterDesignSystemOrchestrator:
    return WorkspaceStarterDesignSystemOrchestrator(
        service_factory=lambda: _build_workspace_design_system_service(settings=settings),
    )


def _build_workspace_design_system_service(*, settings: Settings) -> WorkspaceDesignSystemsService:
    tenant_context = require_current_tenant_context()
    component_catalog_resolver = get_official_component_catalog_registry()
    return WorkspaceDesignSystemsService(
        repository=WorkspaceDesignSystemsRepository(tenant_context),
        component_catalog_resolver=component_catalog_resolver,
        representative_preview_renderer=SiteBuilderService(
            repository=SiteBuilderRepository(tenant_context),
            design_system_repository=ProjectDesignSystemsRepository(tenant_context),
            component_catalog_resolver=component_catalog_resolver,
            settings=settings,
        ),
        settings=settings,
    )


def _build_workspace_skill_lifecycle_service(*, settings: Settings) -> WorkspaceSkillLifecycleService:
    context = require_current_tenant_context()
    lifecycle = WorkspaceSkillLifecycleRepository(context)
    return WorkspaceSkillLifecycleService(
        packages=WorkspaceSkillsRepository(context),
        lifecycle=lifecycle,
        official_catalog=WorkspaceOfficialSkillCatalogService(
            catalog=OfficialSkillCatalogRepository(),
            installations=lifecycle,
            settings=settings,
        ),
        settings=settings,
    )


def _build_builder_generation_handler(*, settings: Settings) -> BuilderGenerationJobHandler:
    return BuilderGenerationJobHandler(
        settings=settings,
        repository_factory=lambda: BuilderGenerationRepository(require_current_tenant_context()),
        builder_repository_factory=lambda: SiteBuilderRepository(require_current_tenant_context()),
        design_system_repository_factory=lambda: ProjectDesignSystemsRepository(require_current_tenant_context()),
        component_catalog_resolver=get_official_component_catalog_registry(),
        generator=LLMBuilderSitemapGenerator(chat_service=AIChatService(settings)),
        wireframe_generator=LLMBuilderWireframeGenerator(chat_service=AIChatService(settings)),
        design_generator=LLMBuilderDesignGenerator(chat_service=AIChatService(settings)),
        planning_generator=LLMBuilderPlanningGenerator(chat_service=AIChatService(settings)),
        composition_saga_projector=BuilderCompositionSagaChildProjector(
            repository_factory=lambda: BuilderCompositionSagaRepository(require_current_tenant_context()),
        ),
    )


def _build_design_system_concept_generation_handler(
    *,
    settings: Settings,
) -> DesignSystemConceptGenerationJobHandler:
    return DesignSystemConceptGenerationJobHandler(
        settings=settings,
        repository_factory=lambda: DesignSystemConceptGenerationRepository(require_current_tenant_context()),
        design_system_repository_factory=lambda: ProjectDesignSystemsRepository(require_current_tenant_context()),
        builder_repository_factory=lambda: SiteBuilderRepository(require_current_tenant_context()),
        version_service_factory=lambda: ProjectDesignSystemVersionService(
            repository=ProjectDesignSystemsRepository(require_current_tenant_context()),
            component_catalog_resolver=get_official_component_catalog_registry(),
            settings=settings,
        ),
        generator=LLMDesignSystemConceptGenerator(chat_service=AIChatService(settings)),
    )


def _build_design_system_publication_handler(*, settings: Settings) -> DesignSystemPublicationJobHandler:
    _ = settings
    return DesignSystemPublicationJobHandler(
        design_systems_factory=lambda: WorkspaceDesignSystemsRepository(require_current_tenant_context()),
        publications_factory=lambda: DesignSystemPublicationRepository(require_current_tenant_context()),
        asset_resolver_factory=lambda: DesignSystemAssetPinResolver(
            repository=AdminAssetsRepository(require_current_tenant_context())
        ),
    )


def _build_design_system_concept_generation_service(
    *,
    settings: Settings,
) -> DesignSystemConceptGenerationService:
    tenant_context = require_current_tenant_context()
    return DesignSystemConceptGenerationService(
        repository=DesignSystemConceptGenerationRepository(tenant_context),
        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
        builder_repository=SiteBuilderRepository(tenant_context),
        settings=settings,
    )


def _build_builder_generation_service(*, settings: Settings) -> BuilderGenerationService:
    tenant_context = require_current_tenant_context()
    return BuilderGenerationService(
        repository=BuilderGenerationRepository(tenant_context),
        builder_repository=SiteBuilderRepository(tenant_context),
        design_system_repository=ProjectDesignSystemsRepository(tenant_context),
        component_catalog_resolver=get_official_component_catalog_registry(),
        settings=settings,
    )


async def _resolve_primary_runtime_id(project_id: UUID) -> UUID | None:
    runtime = await ProjectRepository().get_primary_runtime(project_id=project_id)
    return runtime.id if runtime is not None and runtime.is_active else None


def _build_asset_thumbnail_handler(*, settings: Settings) -> AssetThumbnailJobHandler:
    provider_effects = ProviderEffectService(
        settings,
        contracts=ProviderEffectContractRegistry((build_asset_thumbnail_provider_effect_contract(),)),
    )
    storage = ExactAssetThumbnailProviderStorageResolver(
        settings,
        route_operations=provider_effects,
    )
    return AssetThumbnailJobHandler(
        repository=TenantAssetThumbnailRepository(),
        pipeline=StorageAssetThumbnailPipeline(
            scratch_root=settings.storage.local_tmp_dir,
            storage_resolver=storage,
        ),
        effects=AssetThumbnailProviderEffectCoordinator(operations=provider_effects),
        storage=storage,
    )


def _build_knowledge_source_ingest_handler(
    *,
    settings: Settings,
    url_fetcher: UntrustedHttpKnowledgeFetcher | None = None,
) -> KnowledgeSourceIngestJobHandler:
    fetch = settings.knowledge_source_fetch
    return KnowledgeSourceIngestJobHandler(
        repository_factory=lambda: TenantKnowledgeIngestionCoordinator(
            settings=settings,
            repository=TenantKnowledgeIngestionRepository(require_current_tenant_context(), settings),
            jobs=BackgroundJobService(settings),
            url_fetcher=url_fetcher
            or UntrustedHttpKnowledgeFetcher(
                policy=KnowledgeSourceFetchPolicy(
                    enabled=fetch.enabled,
                    max_redirects=fetch.max_redirects,
                    max_compressed_bytes=fetch.max_compressed_bytes,
                    max_decompressed_bytes=fetch.max_decompressed_bytes,
                    connect_timeout_seconds=fetch.connect_timeout_seconds,
                    read_timeout_seconds=fetch.read_timeout_seconds,
                    user_agent=fetch.user_agent,
                )
            ),
        ),
        parser=ManualMarkdownKnowledgeParser(),
    )


def _build_knowledge_source_index_handler(*, settings: Settings) -> KnowledgeSourceIndexJobHandler:
    profile = settings.knowledge_index
    return KnowledgeSourceIndexJobHandler(
        store_factory=lambda: TenantKnowledgeIndexRepository(require_current_tenant_context()),
        scanner=RuleBasedKnowledgePromptInjectionScanner(),
        embedder=LiteLLMKnowledgeEmbeddingProvider(
            base_url=settings.ai.litellm_base_url,
            api_key=settings.ai.litellm_master_key,
            timeout_seconds=profile.request_timeout_seconds,
            enabled=profile.enabled,
        ),
        vector_index=MeilisearchKnowledgeVectorIndex(
            base_url=settings.search.meilisearch_url,
            api_key=settings.search.meilisearch_api_key.get_secret_value(),
            timeout_seconds=profile.request_timeout_seconds,
            poll_interval_seconds=profile.task_poll_interval_seconds,
            enabled=profile.enabled,
        ),
    )


def _build_skill_github_import_handler(
    *,
    settings: Settings,
    fetcher: GitHubSkillSnapshotFetcher | None,
) -> SkillGitHubImportJobHandler:
    policy = settings.skill_github_fetch

    def build_store() -> TenantSkillGitHubImportCoordinator:
        context = require_current_tenant_context()
        return TenantSkillGitHubImportCoordinator(
            tenant_context=context,
            imports=WorkspaceSkillGitHubImportRepository(context),
            packages=WorkspaceSkillsRepository(context),
            settings=settings,
        )

    return SkillGitHubImportJobHandler(
        store_factory=build_store,
        fetcher=fetcher or PublicGitHubSkillFetcher(policy=policy),
    )


def _build_provider_effect_recovery_handler(
    *,
    settings: Settings,
) -> AssetThumbnailProviderEffectRecoveryHandler:
    provider_effects = ProviderEffectService(
        settings,
        contracts=ProviderEffectContractRegistry((build_asset_thumbnail_provider_effect_contract(),)),
    )
    storage = ExactAssetThumbnailProviderStorageResolver(
        settings,
        route_operations=provider_effects,
    )
    return AssetThumbnailProviderEffectRecoveryHandler(
        repository=RoutedAssetThumbnailRecoveryOutcomeRepository(
            project_resolver=_build_project_target_resolver(),
            tenant_repository=TenantAssetThumbnailRepository(),
        ),
        pipeline=StorageAssetThumbnailPipeline(
            scratch_root=settings.storage.local_tmp_dir,
            storage_resolver=storage,
        ),
        effects=AssetThumbnailProviderEffectRecoveryCoordinator(operations=provider_effects),
        storage=storage,
    )


def _required_tenant_schema_version() -> int:
    return max((migration.version for migration in TENANT_CONTROL_MIGRATIONS), default=0)


def _build_project_target_resolver() -> ProjectJobTargetResolver:
    return ProjectJobTargetResolver(
        project_repository=ProjectRepository(),
        tenancy_repository=TenancyRepository(),
        access_restriction_authority=AccessRestrictionAuthority(AccessRestrictionRepository()),
        required_schema_version=_required_tenant_schema_version(),
    )


def _build_workspace_target_resolver() -> WorkspaceJobTargetResolver:
    return WorkspaceJobTargetResolver(
        workspace_repository=OrganizationWorkspaceRepository(),
        tenancy_repository=TenancyRepository(),
        access_restriction_authority=AccessRestrictionAuthority(AccessRestrictionRepository()),
        required_schema_version=_required_tenant_schema_version(),
    )


def _format_identity(identity: JobTypeKey) -> str:
    return f"{identity.job_type} v{identity.job_type_version}"
