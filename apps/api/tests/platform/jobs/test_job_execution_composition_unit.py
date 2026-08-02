from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest
from pydantic import ConfigDict

from src.agents.checkpointing import memory_agent_checkpointer
from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.registries import ConnectorRegistry
from src.models.jobs.background_job import JobAuthorityMode, JobWorkloadClass
from src.modules.ai.runtime_job_handler import AgentRunJobHandler
from src.modules.ai.runtime_langgraph_gateway import LangGraphAgentRunExecutionGateway
from src.modules.ai.runtime_model_step_gateway import ModelToolAgentRunExecutionGateway
from src.modules.ai.service import AIChatService
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailJobHandler,
    AssetThumbnailProviderEffectCoordinator,
    AssetThumbnailProviderEffectRecoveryCoordinator,
    AssetThumbnailProviderEffectRecoveryHandler,
    ExactAssetThumbnailProviderStorageResolver,
    RoutedAssetThumbnailRecoveryOutcomeRepository,
    StorageAssetThumbnailPipeline,
    TenantAssetThumbnailRepository,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
)
from src.modules.commerce.access_state.fact_consumer_job_contract import (
    COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
    COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
)
from src.modules.commerce.access_state.fact_consumer_job_handler import CommercialAccessFactJobHandler
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_errors import JobExecutionRegistryError
from src.modules.jobs.execution_registry import JobHandlerFactory
from src.modules.jobs.provider_effect_recovery import (
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
    PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
)
from src.modules.jobs.provider_effect_service import ProviderEffectService
from src.modules.jobs.registry import (
    JobTargetScope,
    JobTypeDefinition,
    JobTypeKey,
    JobTypeRegistry,
    JobVisibility,
)
from src.modules.projects.builder.composition_saga_projection import BuilderCompositionSagaChildProjector
from src.modules.projects.builder.composition_saga_provider import LLMBuilderPlanningGenerator
from src.modules.projects.builder.generation_handler import BuilderGenerationJobHandler
from src.modules.projects.builder.generation_provider import (
    LLMBuilderDesignGenerator,
    LLMBuilderSitemapGenerator,
    LLMBuilderWireframeGenerator,
)
from src.modules.projects.design_systems.concept_handler import DesignSystemConceptGenerationJobHandler
from src.modules.projects.design_systems.concept_provider import LLMDesignSystemConceptGenerator
from src.modules.sites.delivery.hosting import SitesHostingDeliveryAdapter
from src.modules.system.admin.notifications.campaign_job_contract import (
    NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE,
    NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION,
)
from src.modules.system.admin.notifications.campaign_job_handler import NotificationCampaignJobHandler
from src.modules.system.plugins.job_contract import (
    PLUGIN_LIFECYCLE_JOB_TYPE,
    PLUGIN_LIFECYCLE_JOB_TYPE_VERSION,
)
from src.modules.system.plugins.job_handler import PluginLifecycleJobHandler
from src.modules.workspaces.knowledge.indexing_handler import KnowledgeSourceIndexJobHandler
from src.modules.workspaces.knowledge.ingestion import ManualMarkdownKnowledgeParser
from src.modules.workspaces.knowledge.ingestion_handler import KnowledgeSourceIngestJobHandler
from src.modules.workspaces.skills.github_import_handler import SkillGitHubImportJobHandler
from src.platform.jobs.composition.execution import (
    ProductionJobHandlerFactoryRegistry,
    _build_commercial_access_fact_handler,
    build_job_execution_runtime,
)

pytestmark = pytest.mark.unit


class _RuntimeJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    project_id: UUID
    site_id: UUID


def _settings(tmp_path) -> Settings:
    return Settings(
        app_env="test",
        database={"enabled": False},
        storage={
            "local_root_dir": tmp_path / "objects",
            "local_tmp_dir": tmp_path / "scratch",
        },
    )


def test_asset_cpu_execution_runtime_binds_real_thumbnail_handler(tmp_path) -> None:
    runtime = build_job_execution_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.ASSET_CPU,
    )

    assert len(runtime.job_types.list_definitions()) == 1
    assert len(runtime.handlers) == 1
    handler = runtime.handlers.create_handler(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    assert isinstance(handler, AssetThumbnailJobHandler)
    assert runtime.executor.handlers is runtime.handlers


def test_agent_io_execution_runtime_binds_real_chat_service(tmp_path) -> None:
    runtime = build_job_execution_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.AGENT_IO,
        agent_checkpointer_factory=memory_agent_checkpointer,
    )

    assert len(runtime.job_types.list_definitions()) == 7
    assert len(runtime.handlers) == 7
    handler = runtime.handlers.create_handler(
        job_type="agent.run.execute",
        job_type_version=1,
    )
    assert isinstance(handler, AgentRunJobHandler)
    gateway = handler._execution_gateway
    assert isinstance(gateway, LangGraphAgentRunExecutionGateway)
    assert isinstance(gateway._step_gateway, ModelToolAgentRunExecutionGateway)
    assert isinstance(gateway._step_gateway._chat_service, AIChatService)
    index_handler = runtime.handlers.create_handler(
        job_type="knowledge.source.index",
        job_type_version=1,
    )
    assert isinstance(index_handler, KnowledgeSourceIndexJobHandler)
    builder_handler = runtime.handlers.create_handler(
        job_type="builder.sitemap.generate",
        job_type_version=1,
    )
    assert isinstance(builder_handler, BuilderGenerationJobHandler)
    assert isinstance(builder_handler._generator, LLMBuilderSitemapGenerator)
    assert isinstance(builder_handler._generator._chat_service, AIChatService)
    wireframe_handler = runtime.handlers.create_handler(
        job_type="builder.wireframe.generate",
        job_type_version=1,
    )
    assert isinstance(wireframe_handler, BuilderGenerationJobHandler)
    assert isinstance(wireframe_handler._wireframe_generator, LLMBuilderWireframeGenerator)
    assert isinstance(wireframe_handler._wireframe_generator._chat_service, AIChatService)
    design_handler = runtime.handlers.create_handler(
        job_type="builder.design.generate",
        job_type_version=1,
    )
    assert isinstance(design_handler, BuilderGenerationJobHandler)
    assert isinstance(design_handler._design_generator, LLMBuilderDesignGenerator)
    assert isinstance(design_handler._design_generator._chat_service, AIChatService)
    planning_handler = runtime.handlers.create_handler(
        job_type="builder.planning.generate",
        job_type_version=1,
    )
    assert isinstance(planning_handler, BuilderGenerationJobHandler)
    assert isinstance(planning_handler._planning_generator, LLMBuilderPlanningGenerator)
    assert isinstance(planning_handler._planning_generator._chat_service, AIChatService)
    assert isinstance(planning_handler._composition_sagas, BuilderCompositionSagaChildProjector)
    concept_handler = runtime.handlers.create_handler(
        job_type="design_system.concept.generate",
        job_type_version=1,
    )
    assert isinstance(concept_handler, DesignSystemConceptGenerationJobHandler)
    assert isinstance(concept_handler._generator, LLMDesignSystemConceptGenerator)
    assert isinstance(concept_handler._generator._chat_service, AIChatService)
    assert runtime.executor.handlers is runtime.handlers


def test_thumbnail_handler_composition_uses_one_exact_provider_effect_authority(tmp_path) -> None:
    runtime = build_job_execution_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.ASSET_CPU,
    )
    handler = runtime.handlers.create_handler(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )

    assert isinstance(handler, AssetThumbnailJobHandler)
    assert isinstance(handler._repository, TenantAssetThumbnailRepository)
    assert isinstance(handler._pipeline, StorageAssetThumbnailPipeline)
    assert isinstance(handler._effects, AssetThumbnailProviderEffectCoordinator)
    assert isinstance(handler._storage, ExactAssetThumbnailProviderStorageResolver)
    assert handler._pipeline._storage_resolver is handler._storage

    provider_effects = handler._effects._operations
    assert isinstance(provider_effects, ProviderEffectService)
    assert handler._storage._route_operations is provider_effects

    job_id = UUID("11111111-1111-4111-8111-111111111111")
    project_id = UUID("22222222-2222-4222-8222-222222222222")
    asset_id = UUID("33333333-3333-4333-8333-333333333333")
    manifest = AssetThumbnailProviderEffectManifestV1(
        job_id=job_id,
        project_id=project_id,
        asset_id=asset_id,
        request_fingerprint="a" * 64,
        source_revision="b" * 64,
        target_bucket=None,
        outputs=(
            AssetThumbnailProviderOutputV1(
                width=320,
                object_key=(f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-320.jpg"),
            ),
        ),
    )
    canonical_manifest = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))

    assert (
        provider_effects.contracts.validate_manifest(
            effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            value=canonical_manifest,
        )
        == canonical_manifest
    )


def test_maintenance_runtime_binds_exact_thumbnail_provider_effect_recovery(tmp_path) -> None:
    runtime = build_job_execution_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.MAINTENANCE,
    )

    identities = {
        (definition.job_type, definition.job_type_version) for definition in runtime.job_types.list_definitions()
    }
    assert identities == {
        (PROVIDER_EFFECT_RECOVERY_JOB_TYPE, PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION),
        (COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE, COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION),
        (NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE, NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION),
        (PLUGIN_LIFECYCLE_JOB_TYPE, PLUGIN_LIFECYCLE_JOB_TYPE_VERSION),
    }
    assert len(runtime.handlers) == 4
    handler = runtime.handlers.create_handler(
        job_type=PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
        job_type_version=PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
    )
    assert isinstance(handler, AssetThumbnailProviderEffectRecoveryHandler)
    assert isinstance(handler._repository, RoutedAssetThumbnailRecoveryOutcomeRepository)
    assert isinstance(handler._repository._tenant_repository, TenantAssetThumbnailRepository)
    assert isinstance(handler._pipeline, StorageAssetThumbnailPipeline)
    assert isinstance(handler._effects, AssetThumbnailProviderEffectRecoveryCoordinator)
    assert isinstance(handler._storage, ExactAssetThumbnailProviderStorageResolver)
    assert handler._pipeline._storage_resolver is handler._storage
    assert handler._storage._route_operations is handler._effects._operations
    commerce_handler = runtime.handlers.create_handler(
        job_type=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE,
        job_type_version=COMMERCE_ACCESS_FACT_CONSUME_JOB_TYPE_VERSION,
    )
    assert isinstance(commerce_handler, CommercialAccessFactJobHandler)
    assert isinstance(commerce_handler._hosting._delivery, SitesHostingDeliveryAdapter)
    campaign_handler = runtime.handlers.create_handler(
        job_type=NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE,
        job_type_version=NOTIFICATION_CAMPAIGN_DISPATCH_JOB_TYPE_VERSION,
    )
    assert isinstance(campaign_handler, NotificationCampaignJobHandler)
    plugin_handler = runtime.handlers.create_handler(
        job_type=PLUGIN_LIFECYCLE_JOB_TYPE,
        job_type_version=PLUGIN_LIFECYCLE_JOB_TYPE_VERSION,
    )
    assert isinstance(plugin_handler, PluginLifecycleJobHandler)


def test_commercial_access_fact_composition_injects_settings_into_notification_persistence(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = _settings(tmp_path)
    captured_settings: list[Settings] = []

    class _Persistence:
        def __init__(self, *, settings: Settings) -> None:
            captured_settings.append(settings)

    monkeypatch.setattr(
        "src.platform.jobs.composition.execution.TortoiseCommercialLifecycleNotificationPersistence",
        _Persistence,
    )

    _build_commercial_access_fact_handler(
        settings=settings,
        connector_registry=ConnectorRegistry(),
    )

    assert captured_settings == [settings]
    assert captured_settings[0] is settings


def test_connector_execution_runtime_binds_billing_knowledge_and_github_skill_handlers(tmp_path) -> None:
    runtime = build_job_execution_runtime(
        settings=_settings(tmp_path),
        workload_class=JobWorkloadClass.CONNECTOR,
    )

    assert runtime.job_types.strict_contracts is True
    assert len(runtime.job_types.list_definitions()) == 4
    assert len(runtime.handlers) == 4
    assert isinstance(
        runtime.handlers.create_handler(job_type="billing.connector-event.process", job_type_version=1),
        BillingConnectorEventJobHandler,
    )
    handler = runtime.handlers.create_handler(
        job_type="knowledge.source.ingest",
        job_type_version=1,
    )
    assert isinstance(handler, KnowledgeSourceIngestJobHandler)
    assert isinstance(handler._parser, ManualMarkdownKnowledgeParser)
    assert isinstance(
        runtime.handlers.create_handler(job_type="skill.github.import", job_type_version=1),
        SkillGitHubImportJobHandler,
    )
    assert isinstance(
        runtime.handlers.create_handler(job_type="skill.github.refresh", job_type_version=1),
        SkillGitHubImportJobHandler,
    )


def test_production_handler_factory_registry_rejects_a_missing_builtin_job(tmp_path) -> None:
    job_types = build_builtin_job_type_registry(_settings(tmp_path))
    factories = ProductionJobHandlerFactoryRegistry(())

    with pytest.raises(
        JobExecutionRegistryError,
        match=(
            r"missing=\['agent.run.execute v1', 'asset.thumbnail.generate v1', "
            r"'billing.connector-event.process v1', "
            r"'builder.design.generate v1', "
            r"'builder.planning.generate v1', "
            r"'builder.sitemap.generate v1', 'builder.wireframe.generate v1', "
            r"'commerce.access-fact.consume v1', "
            r"'design_system.concept.generate v1', "
            r"'knowledge.source.index v1', 'knowledge.source.ingest v1', "
            r"'notification.campaign.dispatch v1', "
            r"'provider.effect.orphan.reconcile v1', 'skill.github.import v1', "
            r"'skill.github.refresh v1', 'system.plugin.lifecycle v2'\]"
        ),
    ):
        factories.build_registrations(job_types=job_types)


def test_production_handler_factory_registry_rejects_duplicate_identities() -> None:
    identity = JobTypeKey(job_type="asset.thumbnail.generate", job_type_version=1)
    invalid_factory = cast(JobHandlerFactory, lambda: object())

    with pytest.raises(JobExecutionRegistryError, match="duplicate production handler factory"):
        ProductionJobHandlerFactoryRegistry((
            (identity, invalid_factory),
            (identity, invalid_factory),
        ))


def test_production_handler_factory_registry_rejects_an_unexpected_builtin_factory(tmp_path) -> None:
    job_types = build_builtin_job_type_registry(_settings(tmp_path))
    thumbnail_identity = JobTypeKey(job_type="asset.thumbnail.generate", job_type_version=1)
    unexpected_identity = JobTypeKey(job_type="unknown.job", job_type_version=1)
    invalid_factory = cast(JobHandlerFactory, lambda: object())
    factories = ProductionJobHandlerFactoryRegistry((
        (thumbnail_identity, invalid_factory),
        (unexpected_identity, invalid_factory),
    ))

    with pytest.raises(JobExecutionRegistryError, match=r"unexpected=\['unknown.job v1'\]"):
        factories.build_registrations(job_types=job_types)


def test_production_handler_factory_registry_rejects_a_non_strict_job_registry(tmp_path) -> None:
    builtin = build_builtin_job_type_registry(_settings(tmp_path))
    job_types = JobTypeRegistry(builtin.list_definitions(), strict_contracts=False)
    identity = JobTypeKey(job_type="asset.thumbnail.generate", job_type_version=1)
    invalid_factory = cast(JobHandlerFactory, lambda: object())
    factories = ProductionJobHandlerFactoryRegistry(((identity, invalid_factory),))

    with pytest.raises(JobExecutionRegistryError, match="strict JobTypeRegistry"):
        factories.build_registrations(job_types=job_types)


@pytest.mark.parametrize(
    ("capability", "expected_message"),
    [
        ("system_actor", "actor-revalidated"),
        ("runtime", "runtime-scoped Jobs"),
        ("required_permission", "System-service Jobs cannot declare an actor permission"),
        ("entitlement", "Entitlement"),
    ],
)
def test_production_handler_factory_registry_rejects_unsupported_boundary_capabilities(
    tmp_path,
    capability: str,
    expected_message: str,
) -> None:
    builtin = build_builtin_job_type_registry(_settings(tmp_path))
    definition = builtin.require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    unsupported = _with_unsupported_capability(definition, capability=capability)
    job_types = JobTypeRegistry([unsupported], strict_contracts=True)
    invalid_factory = cast(JobHandlerFactory, lambda: object())
    factories = ProductionJobHandlerFactoryRegistry(((unsupported.key, invalid_factory),))

    with pytest.raises(JobExecutionRegistryError, match=expected_message):
        factories.build_registrations(job_types=job_types)


def test_execution_runtime_rejects_actor_revalidated_builtin_without_authorizer(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    builtin = build_builtin_job_type_registry(_settings(tmp_path))
    definition = builtin.require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )
    unsupported = definition.model_copy(
        update={
            "authority_mode": JobAuthorityMode.ACTOR_REVALIDATED,
            "required_permission": definition.manage_permission,
        }
    )
    registry = JobTypeRegistry(
        [unsupported if candidate.key == definition.key else candidate for candidate in builtin.list_definitions()],
        strict_contracts=True,
    )
    monkeypatch.setattr(
        "src.platform.jobs.composition.execution.build_builtin_job_type_registry",
        lambda _settings: registry,
    )

    with pytest.raises(JobExecutionRegistryError, match="require a Project permission"):
        build_job_execution_runtime(
            settings=_settings(tmp_path),
            workload_class=JobWorkloadClass.ASSET_CPU,
        )


def _with_unsupported_capability(
    definition: JobTypeDefinition,
    *,
    capability: str,
) -> JobTypeDefinition:
    if capability == "system_actor":
        return definition.model_copy(
            update={
                "target_scope": JobTargetScope.SYSTEM,
                "visibility": JobVisibility.SYSTEM,
                "authority_mode": JobAuthorityMode.ACTOR_REVALIDATED,
                "required_permission": definition.manage_permission,
            }
        )
    if capability == "runtime":
        return definition.model_copy(
            update={
                "target_scope": JobTargetScope.RUNTIME,
                "target_schema": _RuntimeJobTarget,
            }
        )
    if capability == "required_permission":
        return definition.model_copy(update={"required_permission": definition.manage_permission})
    if capability == "entitlement":
        return definition.model_copy(update={"required_entitlement": "sites.generate"})
    raise AssertionError(f"Unhandled test capability: {capability}")
