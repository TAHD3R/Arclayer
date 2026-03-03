from __future__ import annotations

from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.modules.assets.models.asset import AssetRecord
from apps.api.src.modules.sites.models.site import SiteRecord
from apps.api.src.modules.workspaces.models.theme_package import ThemePackageRecord


class WorkspaceThemesRepository(BaseRepository):
    async def get_zip_asset(self, *, workspace_id: UUID, asset_id: UUID) -> AssetRecord | None:
        return await AssetRecord.get_or_none(id=asset_id, workspace_id=workspace_id, deleted_at=None)

    async def get_theme_package(self, *, workspace_id: UUID, theme_id: str, version: str) -> ThemePackageRecord | None:
        return await ThemePackageRecord.get_or_none(workspace_id=workspace_id, theme_id=theme_id, version=version)

    async def list_theme_packages(self, *, workspace_id: UUID) -> list[ThemePackageRecord]:
        return await ThemePackageRecord.filter(workspace_id=workspace_id).order_by("theme_id", "version").all()

    async def create_theme_package(
        self,
        *,
        workspace_id: UUID,
        theme_id: str,
        version: str,
        name: str | None,
        description: str | None,
        author: dict | None,
        manifest: dict,
        artifact_hash: str | None,
        artifact_asset_id: UUID | None,
        tokens_css_asset_id: UUID,
        base_css_asset_id: UUID | None,
        preview_image_asset_id: UUID | None,
        presets: dict | None,
        variants: dict | None,
        created_by: UUID | None,
    ) -> ThemePackageRecord:
        async with in_transaction() as conn:
            existing = (
                await ThemePackageRecord
                .filter(
                    workspace_id=workspace_id,
                    theme_id=theme_id,
                    version=version,
                )
                .using_db(conn)
                .first()
            )
            if existing is not None:
                # Service layer decides the error code; keep repo pure.
                return existing

            rec = ThemePackageRecord(
                workspace_id=workspace_id,
                theme_id=theme_id,
                version=version,
                name=name,
                description=description,
                author=author,
                manifest=manifest,
                artifact_hash=artifact_hash,
                artifact_asset_id=artifact_asset_id,
                tokens_css_asset_id=tokens_css_asset_id,
                base_css_asset_id=base_css_asset_id,
                preview_image_asset_id=preview_image_asset_id,
                presets=presets,
                variants=variants,
                created_by=created_by,
            )
            await rec.save(using_db=conn)
            return rec

    async def delete_theme_package(self, *, workspace_id: UUID, theme_id: str, version: str) -> int:
        return await ThemePackageRecord.filter(workspace_id=workspace_id, theme_id=theme_id, version=version).delete()

    async def list_sites_by_workspace(self, *, workspace_id: UUID) -> list[SiteRecord]:
        return await SiteRecord.filter(workspace_id=workspace_id).all()
