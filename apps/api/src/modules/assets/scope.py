from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TypedDict
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_PROJECT,
    ASSET_SCOPE_USER,
)
from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


@dataclass(frozen=True)
class AssetScope:
    type: str
    id: UUID


class ScopeFilterKwargs(TypedDict, total=False):
    project_id: UUID
    organization_id: UUID
    user_id: UUID


def scope_filter_kwargs(scope: AssetScope) -> ScopeFilterKwargs:
    tpe = (scope.type or "").strip().lower()
    if tpe == ASSET_SCOPE_PROJECT:
        return {"project_id": scope.id}
    if tpe == ASSET_SCOPE_ORGANIZATION:
        return {"organization_id": scope.id}
    if tpe == ASSET_SCOPE_USER:
        return {"user_id": scope.id}
    raise ValueError("invalid scope")


def is_project_asset_scope(scope: AssetScope) -> bool:
    return (scope.type or "").strip().lower() == ASSET_SCOPE_PROJECT


class AssetScopeDatabaseRouter:
    def __init__(self, tenant_context: TenantContext | None = None) -> None:
        self._project_router = TenantDatabaseRouter(tenant_context) if tenant_context is not None else None

    @asynccontextmanager
    async def connection(
        self,
        *,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> AsyncIterator[BaseDBAsyncClient | None]:
        if is_project_asset_scope(scope):
            if self._project_router is None:
                raise RuntimeError("TenantContext is required for project asset access")
            async with self._project_router.connection(conn) as tenant_conn:
                yield tenant_conn
            return
        yield conn


def resolve_asset_scope(
    *,
    project_id: UUID | None = None,
    organization_id: UUID | None = None,
    user_id: UUID | None = None,
) -> AssetScope:
    """
    Resolve asset scope from nullable scope columns.

    Contract:
    - Exactly one scope id must be set.
    - Used at service boundaries (do not silently infer or fallback).
    """

    candidates: list[AssetScope] = []
    if project_id is not None:
        candidates.append(AssetScope(type=ASSET_SCOPE_PROJECT, id=project_id))
    if organization_id is not None:
        candidates.append(AssetScope(type=ASSET_SCOPE_ORGANIZATION, id=organization_id))
    if user_id is not None:
        candidates.append(AssetScope(type=ASSET_SCOPE_USER, id=user_id))

    if len(candidates) == 1:
        return candidates[0]

    if len(candidates) == 0:
        raise BadRequest(
            message=_ts("ASSET_SCOPE_REQUIRED", "资源归属范围缺失"),
            error="ASSET_SCOPE_REQUIRED",
        )

    raise BadRequest(
        message=_ts("ASSET_SCOPE_CONFLICT", "资源归属范围冲突"),
        error="ASSET_SCOPE_CONFLICT",
    )
