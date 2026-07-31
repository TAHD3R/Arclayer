from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Forbidden
from src.modules.workspaces import service as workspace_service_module
from src.modules.workspaces.service import WorkspaceService


class _Query:
    def __init__(self, result: object) -> None:
        self.result = result
        self.connections: list[BaseDBAsyncClient] = []

    def using_db(self, conn: BaseDBAsyncClient) -> _Query:
        self.connections.append(conn)
        return self

    def select_for_update(self) -> _Query:
        return self

    async def first(self) -> object:
        return self.result


def _build_service(
    *,
    monkeypatch: pytest.MonkeyPatch,
    workspace_owner_id: UUID,
    participant: object,
) -> tuple[WorkspaceService, SimpleNamespace, BaseDBAsyncClient, _Query, _Query]:
    workspace = SimpleNamespace(owner_user_id=workspace_owner_id)
    membership = SimpleNamespace(
        id=uuid4(),
        updated_at=datetime(2026, 7, 31, tzinfo=UTC),
        delete=AsyncMock(),
    )
    workspace_query = _Query(workspace)
    membership_query = _Query(membership)
    transaction_connection = cast(BaseDBAsyncClient, object())
    service = WorkspaceService(
        Settings(),
        membership_end_participant=cast(Any, participant),
    )

    monkeypatch.setattr(workspace_service_module.Workspace, "filter", Mock(return_value=workspace_query))
    monkeypatch.setattr(
        workspace_service_module.WorkspaceMembership,
        "filter",
        Mock(return_value=membership_query),
    )

    @asynccontextmanager
    async def tx(*, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        _ = conn
        yield transaction_connection

    monkeypatch.setattr(service, "tx", tx)
    return service, membership, transaction_connection, workspace_query, membership_query


@pytest.mark.asyncio
async def test_leave_workspace_releases_membership_and_deletes_using_same_transaction_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    participant = SimpleNamespace(release_for_membership_end=AsyncMock())
    service, membership, conn, workspace_query, membership_query = _build_service(
        monkeypatch=monkeypatch,
        workspace_owner_id=uuid4(),
        participant=participant,
    )

    result = await service.leave_workspace(
        organization_id=uuid4(),
        workspace_id=workspace_id,
        user_id=user_id,
        confirm_text="LEAVE",
    )

    participant.release_for_membership_end.assert_awaited_once_with(
        workspace_id=workspace_id,
        membership_id=membership.id,
        lifecycle_idempotency_key=(f"workspace-membership:{membership.id}:leave:{membership.updated_at.isoformat()}"),
        conn=conn,
    )
    membership.delete.assert_awaited_once_with(using_db=conn)
    assert workspace_query.connections == [conn]
    assert membership_query.connections == [conn]
    assert result.membership_id == membership.id
    assert result.left is True


@pytest.mark.asyncio
async def test_leave_workspace_does_not_delete_membership_when_release_participant_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    participant = SimpleNamespace(
        release_for_membership_end=AsyncMock(side_effect=RuntimeError("membership release failed")),
    )
    service, membership, conn, _workspace_query, _membership_query = _build_service(
        monkeypatch=monkeypatch,
        workspace_owner_id=uuid4(),
        participant=participant,
    )

    with pytest.raises(RuntimeError, match="membership release failed"):
        await service.leave_workspace(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            user_id=user_id,
            confirm_text="LEAVE",
        )

    participant.release_for_membership_end.assert_awaited_once_with(
        workspace_id=workspace_id,
        membership_id=membership.id,
        lifecycle_idempotency_key=(f"workspace-membership:{membership.id}:leave:{membership.updated_at.isoformat()}"),
        conn=conn,
    )
    membership.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_leave_workspace_rejects_owner_before_membership_release(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    owner_user_id = uuid4()
    participant = SimpleNamespace(release_for_membership_end=AsyncMock())
    service, membership, _conn, _workspace_query, _membership_query = _build_service(
        monkeypatch=monkeypatch,
        workspace_owner_id=owner_user_id,
        participant=participant,
    )

    with pytest.raises(Forbidden) as exc_info:
        await service.leave_workspace(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            user_id=owner_user_id,
            confirm_text="LEAVE",
        )

    assert exc_info.value.error == "WORKSPACE_OWNER_TRANSFER_REQUIRED"
    participant.release_for_membership_end.assert_not_awaited()
    membership.delete.assert_not_awaited()
