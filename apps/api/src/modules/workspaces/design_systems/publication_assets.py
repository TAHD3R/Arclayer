from __future__ import annotations

from collections.abc import Sequence
from typing import Final
from uuid import UUID

import orjson
from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.assets import ASSET_SCOPE_WORKSPACE
from src.common.schemas import BaseSchema
from src.models.assets.asset import AssetRecord
from src.modules.assets.admin.assets.repository import AdminAssetsRepository
from src.modules.assets.scope import AssetScope
from src.modules.workspaces.design_systems.manifest import (
    DesignAssetReferenceV1,
    DesignSystemManifestV1,
    design_system_content_digest,
)

_FONT_MIME_TYPES: Final = frozenset({
    "application/font-sfnt",
    "application/font-woff",
    "application/font-woff2",
    "application/vnd.ms-fontobject",
    "application/x-font-opentype",
    "application/x-font-ttf",
    "font/otf",
    "font/ttf",
    "font/woff",
    "font/woff2",
})


class DesignSystemAssetPin(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    asset_id: UUID
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    kind: str = Field(pattern=r"^(font|image|icon|logo)$")
    mime: str = Field(min_length=1, max_length=128)
    font_family: str | None = Field(default=None, max_length=256)


class DesignSystemAssetPinningError(ValueError):
    pass


class DesignSystemAssetPinResolver:
    """Resolve immutable Workspace-scoped Asset pins through the canonical Asset repository."""

    def __init__(self, *, repository: AdminAssetsRepository) -> None:
        self._repository = repository

    async def resolve(
        self,
        *,
        workspace_id: UUID,
        manifest: DesignSystemManifestV1,
        conn: BaseDBAsyncClient,
    ) -> tuple[DesignSystemAssetPin, ...]:
        references = manifest.asset_references
        if not references:
            return ()
        scope = AssetScope(type=ASSET_SCOPE_WORKSPACE, id=workspace_id)
        ids = [UUID(str(reference.asset_id)) for reference in references]
        assets = await self._repository.get_assets_by_ids(scope=scope, asset_ids=ids, conn=conn)
        by_id = {asset.id: asset for asset in assets}
        pins = tuple(
            self._pin_reference(reference=reference, asset=by_id.get(UUID(str(reference.asset_id))))
            for reference in references
        )
        return tuple(sorted(pins, key=lambda pin: str(pin.asset_id)))

    @staticmethod
    def _pin_reference(
        *,
        reference: DesignAssetReferenceV1,
        asset: AssetRecord | None,
    ) -> DesignSystemAssetPin:
        if asset is None:
            raise DesignSystemAssetPinningError("Referenced Workspace Asset is unavailable")
        checksum = str(asset.checksum_sha256 or "").strip().lower()
        if checksum != reference.checksum_sha256:
            raise DesignSystemAssetPinningError("Referenced Workspace Asset checksum changed")
        mime = str(asset.mime or "").strip().lower()
        if not _mime_matches(kind=reference.kind, mime=mime):
            raise DesignSystemAssetPinningError("Referenced Workspace Asset MIME type is incompatible")
        return DesignSystemAssetPin(
            asset_id=asset.id,
            checksum_sha256=checksum,
            kind=reference.kind,
            mime=mime,
            font_family=reference.font_family,
        )


def design_system_asset_pins_hash(pins: Sequence[DesignSystemAssetPin]) -> str:
    payload = [pin.model_dump(mode="json", by_alias=True) for pin in sorted(pins, key=lambda item: str(item.asset_id))]
    return design_system_content_digest(orjson.dumps(payload, option=orjson.OPT_SORT_KEYS))


def _mime_matches(*, kind: str, mime: str) -> bool:
    if kind == "font":
        return mime in _FONT_MIME_TYPES
    return mime.startswith("image/")
