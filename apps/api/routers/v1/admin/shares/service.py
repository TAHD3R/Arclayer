from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.models.asset import AssetRecord
from apps.api.models.asset_share import AssetShareLinkRecord
from apps.api.routers.v1.admin.shares.repository import AdminSharesRepository
from apps.api.routers.v1.admin.shares.schema import AdminShareLinkOut


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


def generate_share_token() -> str:
    # URL-safe, path-friendly, and long enough for brute-force resistance.
    # token_urlsafe(16) => ~22 chars.
    return secrets.token_urlsafe(16)


class AdminSharesService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = AdminSharesRepository()

    async def _ensure_asset_exists(self, *, workspace_id: UUID, asset_id: UUID) -> AssetRecord:
        asset = await AssetRecord.get_or_none(id=asset_id, workspace_id=workspace_id, deleted_at=None)
        if asset is None:
            raise NotFound(message=_ts("ASSET_NOT_FOUND", "资源不存在"), error="ASSET_NOT_FOUND")
        return asset

    async def create_share_link(
        self,
        *,
        workspace_id: UUID,
        asset_id: UUID,
        created_by_user_id: UUID | None,
        expires_in_seconds: int | None,
    ) -> AssetShareLinkRecord:
        _ = await self._ensure_asset_exists(workspace_id=workspace_id, asset_id=asset_id)

        expires_at: datetime | None = None
        if expires_in_seconds is not None:
            if expires_in_seconds < 60:
                raise BadRequest(message=_ts("SHARE_EXPIRES_INVALID", "过期时间不合法"), error="SHARE_EXPIRES_INVALID")
            expires_at = datetime.now(tz=UTC) + timedelta(seconds=int(expires_in_seconds))

        # Token collision is extremely unlikely, but keep a bounded retry loop.
        for _i in range(5):
            token = generate_share_token()
            exists = await AssetShareLinkRecord.filter(token=token).exists()
            if not exists:
                return await self.repo.create_share_link(
                    workspace_id=workspace_id,
                    asset_id=asset_id,
                    token=token,
                    expires_at=expires_at,
                    created_by_user_id=created_by_user_id,
                )

        raise BadRequest(
            message=_ts("SHARE_TOKEN_GENERATE_FAILED", "生成分享链接失败"), error="SHARE_TOKEN_GENERATE_FAILED"
        )

    async def list_share_links(
        self, *, workspace_id: UUID, asset_id: UUID, params: PageParams
    ) -> PageData[AdminShareLinkOut]:
        _ = await self._ensure_asset_exists(workspace_id=workspace_id, asset_id=asset_id)
        qs = self.repo.query_links(workspace_id=workspace_id, asset_id=asset_id)
        return await paginate_queryset(qs, params=params, out_schema=AdminShareLinkOut)

    async def revoke_share_link(self, *, workspace_id: UUID, link_id: UUID) -> AssetShareLinkRecord:
        link = await self.repo.get_link(workspace_id=workspace_id, link_id=link_id)
        if link is None:
            raise NotFound(message=_ts("SHARE_LINK_NOT_FOUND", "分享链接不存在"), error="SHARE_LINK_NOT_FOUND")
        return await self.repo.revoke(link, revoked_at=datetime.now(tz=UTC))
