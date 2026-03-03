from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasWorkspaceId
from apps.api.src.common.utils.public_ids import decode_public_id, encode_uuid, is_public_id
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.assets.asset import AssetRecord
from apps.api.src.models.sites.site import SiteRecord


class DepsValidationRepositoryMixin:
    async def _list_missing_assets(
        self,
        *,
        workspace_id: UUID,
        asset_ids: list[UUID],
        conn,
    ) -> list[str]:
        """
        Best-effort deps validator for v0 (assets only).

        Returns missing asset id strings (UUID).
        """

        if not asset_ids:
            return []

        rows = (
            await AssetRecord
            .filter(
                id__in=asset_ids,
                workspace_id=workspace_id,
                deleted_at=None,
            )
            .using_db(conn)
            .values_list("id", flat=True)
        )
        existing = {UUID(str(x)) for x in rows}
        missing = [encode_uuid(aid) for aid in asset_ids if aid not in existing]
        return missing

    async def _validate_revision_deps_assets(
        self,
        *,
        site_id: UUID,
        deps: dict | None,
        conn,
    ) -> None:
        """
        Validate revision deps before publishing/rollback (v0: assets only).

        Contract:
        - deps.assetIds: list[str] of AssetRecord ids.
        """

        if not deps or not isinstance(deps, dict):
            return
        asset_ids_raw = deps.get("assetIds")
        if not isinstance(asset_ids_raw, list) or not asset_ids_raw:
            return

        parsed: list[UUID] = []
        invalid: list[str] = []
        for x in asset_ids_raw:
            if not isinstance(x, str) or not x.strip():
                invalid.append(str(x))
                continue
            raw = x.strip()
            if is_public_id(raw):
                try:
                    parsed.append(decode_public_id(raw))
                except ValueError:
                    invalid.append(raw)
                continue

            # Optional compatibility: allow raw UUID strings in dev/test (configurable).
            from apps.api.src.config import get_settings

            if not get_settings().public_id.accept_raw_uuid_input:
                invalid.append(raw)
                continue

            try:
                parsed.append(UUID(raw))
            except ValueError:
                invalid.append(raw)

        if not parsed and not invalid:
            return

        site_qs = SiteRecord.filter(id=site_id)
        if conn is not None:
            site_qs = site_qs.using_db(conn)
        site = await site_qs.first()
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")

        missing = await self._list_missing_assets(
            workspace_id=UUID(str(cast(HasWorkspaceId, site).workspace_id)),
            asset_ids=parsed,
            conn=conn,
        )
        if invalid or missing:
            raise Conflict(
                "Revision deps validation failed",
                error="REVISION_DEPS_MISSING",
                meta={"missingAssets": [*invalid, *missing]},
            )
