from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from asyncpg import exceptions as asyncpg_exceptions

from src.modules.jobs.execution_errors import TransientJobExecutionError
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.knowledge.ingestion_contract import KnowledgeSourceIngestJobTarget
from src.modules.workspaces.knowledge.ingestion_repository import TenantKnowledgeIngestionRepository

pytestmark = pytest.mark.unit


class _FailingConnection:
    def __init__(self, error: BaseException) -> None:
        self._error = error

    async def __aenter__(self) -> None:
        raise self._error

    async def __aexit__(self, *_args: object) -> None:
        return None


class _FailingTenantDatabaseRouter:
    def __init__(self, error: BaseException) -> None:
        self._error = error

    def connection(self, _conn: object = None) -> _FailingConnection:
        return _FailingConnection(self._error)


def _repository(*, workspace_id: UUID, error: BaseException) -> TenantKnowledgeIngestionRepository:
    context = cast(
        TenantContext,
        SimpleNamespace(workspace_id=workspace_id, project_id=None),
    )
    repository = TenantKnowledgeIngestionRepository(context)
    repository.tenant_db = cast(
        TenantDatabaseRouter,
        _FailingTenantDatabaseRouter(error),
    )
    return repository


def _target(*, workspace_id: UUID) -> KnowledgeSourceIngestJobTarget:
    source_id = uuid4()
    return KnowledgeSourceIngestJobTarget(
        workspace_id=workspace_id,
        knowledge_base_id=uuid4(),
        source_id=source_id,
        candidate_version_id=uuid4(),
        entity_id=source_id,
    )


async def test_repository_maps_only_retryable_postgres_failure_to_declared_transient_code() -> None:
    workspace_id = uuid4()
    repository = _repository(
        workspace_id=workspace_id,
        error=asyncpg_exceptions.ConnectionDoesNotExistError("connection lost"),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await repository.get_outcome_marker(
            target=_target(workspace_id=workspace_id),
            job_id=uuid4(),
        )

    assert exc_info.value.code == "KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None
    assert exc_info.value.provider_retry_after_seconds is None


async def test_repository_does_not_reclassify_programming_error_as_transient() -> None:
    workspace_id = uuid4()
    repository = _repository(
        workspace_id=workspace_id,
        error=ValueError("invalid repository invariant"),
    )

    with pytest.raises(ValueError, match="invalid repository invariant"):
        await repository.get_outcome_marker(
            target=_target(workspace_id=workspace_id),
            job_id=uuid4(),
        )
