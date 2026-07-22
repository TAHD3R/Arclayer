from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.modules.assets.jobs.thumbnail_recovery_repository import (
    RoutedAssetThumbnailRecoveryOutcomeRepository,
)
from src.modules.tenancy.context import get_current_tenant_context, require_current_tenant_context
from src.modules.tenancy.schema import (
    TenantContext,
    TenantIdentity,
    TenantIsolationMode,
    TenantScope,
)

pytestmark = pytest.mark.unit


class _ProjectResolver:
    def __init__(self, *, context: TenantContext) -> None:
        self.context = context
        self.calls: list[tuple[UUID, UUID]] = []

    async def resolve_for_reconciliation(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
    ) -> TenantContext:
        self.calls.append((workspace_id, project_id))
        return self.context


class _TenantRepository:
    def __init__(self, *, expected_context: TenantContext) -> None:
        self.expected_context = expected_context
        self.calls: list[tuple[UUID, UUID]] = []

    async def get_outcome_marker(self, *, project_id: UUID, asset_id: UUID):  # type: ignore[no-untyped-def]
        assert require_current_tenant_context() == self.expected_context
        self.calls.append((project_id, asset_id))
        return None


@pytest.mark.asyncio
async def test_marker_read_binds_the_exact_recovery_project_scope_and_restores_context() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    context = TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            schema_name="workspace_0123456789abcdef0123",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.JOB,
    )
    resolver = _ProjectResolver(context=context)
    tenant_repository = _TenantRepository(expected_context=context)
    subject = RoutedAssetThumbnailRecoveryOutcomeRepository(
        project_resolver=resolver,
        tenant_repository=tenant_repository,
    )

    assert get_current_tenant_context() is None
    assert (
        await subject.get_outcome_marker(
            workspace_id=workspace_id,
            project_id=project_id,
            asset_id=asset_id,
        )
        is None
    )
    assert get_current_tenant_context() is None
    assert resolver.calls == [(workspace_id, project_id)]
    assert tenant_repository.calls == [(project_id, asset_id)]
