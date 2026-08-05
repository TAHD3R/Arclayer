from __future__ import annotations

from functools import lru_cache

from src.config import Settings, get_settings
from src.modules.ai.runtime_job_schema import build_agent_run_job_definition
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_RETRYABLE_CODES,
    ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS,
    AssetThumbnailExecutionPolicy,
    build_asset_thumbnail_job_definition,
)
from src.modules.commerce.access_state.fact_consumer_job_contract import (
    build_commercial_access_fact_job_definition,
)
from src.modules.commerce.billing_event_job_contract import build_billing_connector_event_job_definition
from src.modules.jobs.provider_effect_recovery import (
    ProviderEffectRecoveryExecutionPolicy,
    build_provider_effect_recovery_job_definition,
)
from src.modules.jobs.registry import JobTypeRegistry
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.projects.builder.composition_saga_job_contract import (
    build_builder_planning_generation_job_definition,
)
from src.modules.projects.builder.generation_job_contract import (
    build_builder_design_generation_job_definition,
    build_builder_generation_job_definition,
    build_builder_wireframe_generation_job_definition,
)
from src.modules.projects.design_systems.concept_job_contract import (
    build_design_system_concept_generation_job_definition,
)
from src.modules.system.admin.notifications.campaign_job_contract import (
    build_notification_campaign_job_definition,
)
from src.modules.system.plugins.job_contract import build_plugin_lifecycle_job_definition
from src.modules.workspaces.design_systems.publication_contract import build_design_system_compile_job_definition
from src.modules.workspaces.knowledge.indexing_contract import (
    build_knowledge_source_index_job_definition,
)
from src.modules.workspaces.knowledge.ingestion_contract import (
    build_knowledge_source_ingest_job_definition,
)
from src.modules.workspaces.skills.github_import_contract import (
    build_skill_github_import_job_definition,
    build_skill_github_refresh_job_definition,
)


def build_builtin_job_type_registry(settings: Settings) -> JobTypeRegistry:
    """Compose the canonical built-in Job registry from deployment policy."""

    policy = settings.background_jobs.asset_thumbnail
    recovery_policy = settings.background_jobs.provider_effect_recovery
    return JobTypeRegistry(
        [
            build_agent_run_job_definition(
                execution_policy=settings.background_jobs.agent_run,
            ),
            build_builder_generation_job_definition(
                execution_policy=settings.background_jobs.builder_generation,
            ),
            build_builder_wireframe_generation_job_definition(
                execution_policy=settings.background_jobs.builder_generation,
            ),
            build_builder_design_generation_job_definition(
                execution_policy=settings.background_jobs.builder_generation,
            ),
            build_builder_planning_generation_job_definition(
                execution_policy=settings.background_jobs.builder_generation,
            ),
            build_design_system_concept_generation_job_definition(
                execution_policy=settings.background_jobs.builder_generation,
            ),
            build_design_system_compile_job_definition(
                execution_policy=settings.background_jobs.design_system_compile,
            ),
            build_asset_thumbnail_job_definition(
                execution_policy=AssetThumbnailExecutionPolicy(
                    retry_policy=JobRetryPolicy(
                        max_attempts=policy.max_attempts,
                        initial_delay_seconds=policy.initial_delay_seconds,
                        multiplier=policy.multiplier,
                        maximum_delay_seconds=policy.maximum_delay_seconds,
                        retryable_codes=ASSET_THUMBNAIL_RETRYABLE_CODES,
                    ),
                    timeout_seconds=policy.timeout_seconds,
                    lease_seconds=policy.lease_seconds,
                    heartbeat_seconds=policy.heartbeat_seconds,
                )
            ),
            build_knowledge_source_ingest_job_definition(
                execution_policy=settings.background_jobs.knowledge_source_ingest,
            ),
            build_knowledge_source_index_job_definition(
                execution_policy=settings.background_jobs.knowledge_source_index,
            ),
            build_skill_github_import_job_definition(
                execution_policy=settings.background_jobs.skill_github_import,
            ),
            build_skill_github_refresh_job_definition(
                execution_policy=settings.background_jobs.skill_github_refresh,
            ),
            build_billing_connector_event_job_definition(
                execution_policy=settings.background_jobs.billing_connector_event,
            ),
            build_commercial_access_fact_job_definition(
                execution_policy=settings.background_jobs.billing_connector_event,
            ),
            build_notification_campaign_job_definition(
                execution_policy=settings.background_jobs.notification_campaign,
            ),
            build_plugin_lifecycle_job_definition(
                execution_policy=settings.background_jobs.plugin_lifecycle,
            ),
            build_provider_effect_recovery_job_definition(
                execution_policy=ProviderEffectRecoveryExecutionPolicy(
                    retry_policy=JobRetryPolicy(
                        max_attempts=recovery_policy.max_attempts,
                        initial_delay_seconds=recovery_policy.initial_delay_seconds,
                        multiplier=recovery_policy.multiplier,
                        maximum_delay_seconds=recovery_policy.maximum_delay_seconds,
                        retryable_codes=ASSET_THUMBNAIL_RETRYABLE_CODES,
                    ),
                    timeout_seconds=recovery_policy.timeout_seconds,
                    lease_seconds=recovery_policy.lease_seconds,
                    heartbeat_seconds=recovery_policy.heartbeat_seconds,
                ),
                terminal_error_contracts=ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS,
            ),
        ],
        strict_contracts=True,
    )


@lru_cache(maxsize=1)
def get_builtin_job_type_registry() -> JobTypeRegistry:
    return build_builtin_job_type_registry(get_settings())
