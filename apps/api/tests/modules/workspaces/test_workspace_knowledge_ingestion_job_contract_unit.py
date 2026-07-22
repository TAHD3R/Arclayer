from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.config import get_settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_registry import derive_durable_task_manifest
from src.modules.jobs.registry import JobPermissionScope, JobTargetScope, JobVisibility
from src.modules.workspaces.knowledge.ingestion_contract import (
    KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
    KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
    KNOWLEDGE_SOURCE_INGEST_TASK_NAME,
    KnowledgeSourceIngestJobInput,
    KnowledgeSourceIngestJobResult,
    KnowledgeSourceIngestJobTarget,
    build_knowledge_source_ingest_job_definition,
    validate_knowledge_source_ingest_target_input,
)

_HASH_A = "sha256:" + "a" * 64
_HASH_B = "sha256:" + "b" * 64


def test_manual_ingestion_definition_uses_the_durable_connector_boundary() -> None:
    definition = build_knowledge_source_ingest_job_definition(
        execution_policy=get_settings().background_jobs.knowledge_source_ingest,
    )

    assert definition.job_type == KNOWLEDGE_SOURCE_INGEST_JOB_TYPE == "knowledge.source.ingest"
    assert definition.job_type_version == KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION == 1
    assert definition.task_name == KNOWLEDGE_SOURCE_INGEST_TASK_NAME
    assert definition.workload_class == JobWorkloadClass.CONNECTOR
    assert definition.target_scope == JobTargetScope.WORKSPACE
    assert definition.visibility == JobVisibility.WORKSPACE
    assert definition.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED
    assert definition.required_permission is not None
    assert definition.required_permission.scope == JobPermissionScope.WORKSPACE
    assert definition.required_permission.action == "system:content:manage"
    assert definition.manage_permission == definition.required_permission
    assert definition.retry_class == JobRetryClass.TRANSIENT
    assert definition.target_schema is KnowledgeSourceIngestJobTarget
    assert definition.input_reference_schema is KnowledgeSourceIngestJobInput
    assert definition.result_reference_schema is KnowledgeSourceIngestJobResult
    assert definition.terminal_error_contracts


def test_builtin_registry_exposes_ingestion_to_the_producer_manifest() -> None:
    registry = build_builtin_job_type_registry(get_settings())

    definition = registry.require(
        job_type=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
        job_type_version=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
    )
    task = derive_durable_task_manifest(registry).definition_for_job(
        job_type=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
        job_type_version=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
    )

    assert task is not None
    assert definition.task_name == task.task_name == KNOWLEDGE_SOURCE_INGEST_TASK_NAME
    assert task.workload_class == JobWorkloadClass.CONNECTOR


def test_manual_ingestion_input_requires_content_bound_revision_and_candidate() -> None:
    source_id = uuid4()
    valid = KnowledgeSourceIngestJobInput(
        source_kind="manual",
        ingestion_mode="reparse",
        source_revision=_HASH_A,
        normalized_content_hash=_HASH_A,
        parser_name="manual-markdown",
    )
    target = KnowledgeSourceIngestJobTarget(
        workspace_id=uuid4(),
        knowledge_base_id=uuid4(),
        source_id=source_id,
        candidate_version_id=uuid4(),
        entity_id=source_id,
    )

    validate_knowledge_source_ingest_target_input(target, valid)

    with pytest.raises(ValidationError, match="immutable normalized content hash"):
        KnowledgeSourceIngestJobInput(
            source_kind="manual",
            ingestion_mode="initial",
            source_revision=_HASH_A,
            normalized_content_hash=_HASH_B,
            parser_name="manual-markdown",
        )

    with pytest.raises(ValueError, match="pre-existing candidateVersionId"):
        validate_knowledge_source_ingest_target_input(
            target.model_copy(update={"candidate_version_id": None}),
            valid,
        )


def test_url_ingestion_input_requires_locator_revision_without_candidate_or_content_hash() -> None:
    source_id = uuid4()
    valid = KnowledgeSourceIngestJobInput(
        source_kind="url",
        ingestion_mode="refresh",
        source_revision=_HASH_A,
        source_url="https://docs.example.com/start",
        parser_name="web-text",
    )
    target = KnowledgeSourceIngestJobTarget(
        workspace_id=uuid4(),
        knowledge_base_id=uuid4(),
        source_id=source_id,
        entity_id=source_id,
    )

    validate_knowledge_source_ingest_target_input(target, valid)

    with pytest.raises(ValidationError, match="normalized URL and locator revision"):
        KnowledgeSourceIngestJobInput(
            source_kind="url",
            ingestion_mode="initial",
            source_revision=_HASH_A,
            normalized_content_hash=_HASH_A,
            source_url="https://docs.example.com/start",
            parser_name="web-text",
        )

    with pytest.raises(ValueError, match="pre-existing candidateVersionId"):
        validate_knowledge_source_ingest_target_input(
            target.model_copy(update={"candidate_version_id": uuid4()}),
            valid,
        )


@pytest.mark.parametrize(
    ("source_kind", "ingestion_mode", "parser_name"),
    (
        ("manual", "refresh", "manual-markdown"),
        ("url", "reparse", "web-text"),
    ),
)
def test_ingestion_input_rejects_modes_outside_each_source_authority(
    source_kind: str,
    ingestion_mode: str,
    parser_name: str,
) -> None:
    values = {
        "source_kind": source_kind,
        "ingestion_mode": ingestion_mode,
        "source_revision": _HASH_A,
        "normalized_content_hash": _HASH_A if source_kind == "manual" else None,
        "source_url": "https://docs.example.com/start" if source_kind == "url" else None,
        "parser_name": parser_name,
    }

    with pytest.raises(ValidationError, match="supports"):
        KnowledgeSourceIngestJobInput.model_validate(values)
