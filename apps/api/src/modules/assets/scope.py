from __future__ import annotations

from dataclasses import dataclass
from typing import TypedDict
from uuid import UUID

from src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_USER,
    ASSET_SCOPE_WORKSPACE,
)
from src.core.exceptions import BadRequest
from src.core.i18n import t


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


@dataclass(frozen=True)
class AssetScope:
    type: str
    id: UUID


class ScopeFilterKwargs(TypedDict, total=False):
    workspace_id: UUID
    organization_id: UUID
    user_id: UUID


def scope_filter_kwargs(scope: AssetScope) -> ScopeFilterKwargs:
    tpe = (scope.type or "").strip().lower()
    if tpe == ASSET_SCOPE_WORKSPACE:
        return {"workspace_id": scope.id}
    if tpe == ASSET_SCOPE_ORGANIZATION:
        return {"organization_id": scope.id}
    if tpe == ASSET_SCOPE_USER:
        return {"user_id": scope.id}
    raise ValueError("invalid scope")


def resolve_asset_scope(
    *,
    workspace_id: UUID | None,
    organization_id: UUID | None,
    user_id: UUID | None,
) -> AssetScope:
    """
    Resolve asset scope from nullable scope columns.

    Contract:
    - Exactly one scope id must be set.
    - Used at service boundaries (do not silently infer or fallback).
    """

    candidates: list[AssetScope] = []
    if workspace_id is not None:
        candidates.append(AssetScope(type=ASSET_SCOPE_WORKSPACE, id=workspace_id))
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
