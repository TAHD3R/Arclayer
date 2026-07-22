from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.config import get_settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_registry import derive_durable_task_manifest
from src.modules.jobs.registry import JobPermissionScope, JobTargetScope, JobVisibility
from src.modules.workspaces.knowledge.indexing_contract import (
    KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
    KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
    KNOWLEDGE_SOURCE_INDEX_TASK_NAME,
    KnowledgeSourceIndexJobInput,
    KnowledgeSourceIndexJobResult,
    KnowledgeSourceIndexJobTarget,
    build_knowledge_source_index_job_definition,
)


def test_index_definition_uses_the_durable_agent_io_boundary() -> None:
    definition = build_knowledge_source_index_job_definition(
        execution_policy=get_settings().background_jobs.knowledge_source_index,
    )

    assert definition.job_type == KNOWLEDGE_SOURCE_INDEX_JOB_TYPE == "knowledge.source.index"
    assert definition.job_type_version == KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION == 1
    assert definition.task_name == KNOWLEDGE_SOURCE_INDEX_TASK_NAME
    assert definition.task_name == "jobs:agent-io:knowledge-source-index:v1"
    assert definition.workload_class == JobWorkloadClass.AGENT_IO
    assert definition.target_scope == JobTargetScope.WORKSPACE
    assert definition.visibility == JobVisibility.WORKSPACE
    assert definition.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED
    assert definition.required_permission is not None
    assert definition.required_permission.scope == JobPermissionScope.WORKSPACE
    assert definition.required_permission.action == "system:content:manage"
    assert definition.manage_permission == definition.required_permission
    assert definition.retry_class == JobRetryClass.TRANSIENT
    assert definition.target_schema is KnowledgeSourceIndexJobTarget
    assert definition.input_reference_schema is KnowledgeSourceIndexJobInput
    assert definition.result_reference_schema is KnowledgeSourceIndexJobResult
    assert definition.terminal_error_contracts


def test_builtin_registry_exposes_indexing_to_the_agent_io_manifest() -> None:
    registry = build_builtin_job_type_registry(get_settings())

    definition = registry.require(
        job_type=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
        job_type_version=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
    )
    task = derive_durable_task_manifest(registry).definition_for_job(
        job_type=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
        job_type_version=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
    )

    assert task is not None
    assert definition.task_name == task.task_name == KNOWLEDGE_SOURCE_INDEX_TASK_NAME
    assert task.workload_class == JobWorkloadClass.AGENT_IO


def test_index_input_requires_exact_reproducible_provider_metadata() -> None:
    with pytest.raises(ValidationError):
        KnowledgeSourceIndexJobInput(
            ingest_job_id=uuid4(),
            normalized_content_hash=f"sha256:{'a' * 64}",
            chunk_count=2,
            embedding_provider="litellm",
            embedding_model="",
            embedding_version="1",
            vector_dimensions=0,
            index_backend="meilisearch",
            index_uid="invalid uid",
            embedder_name="knowledge-default",
            index_schema_version=1,
        )
