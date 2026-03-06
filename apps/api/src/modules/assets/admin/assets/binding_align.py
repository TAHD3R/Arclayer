from __future__ import annotations

from uuid import UUID

from apps.api.src.config import Settings
from apps.api.src.models.assets.asset import AssetPurpose, AssetVisibility
from apps.api.src.modules.assets.admin.assets.repository import AdminAssetsRepository
from apps.api.src.modules.assets.admin.assets.schema import AdminAssetUpdateRequest
from apps.api.src.modules.assets.admin.assets.service import AdminAssetsService
from apps.api.src.modules.assets.scope import AssetScope


async def align_asset_for_binding(
    settings: Settings,
    *,
    scope: AssetScope,
    asset_id: UUID,
    purpose: AssetPurpose,
) -> bool:
    """
    Ensure an asset is aligned for a binding use-case (logo/icon/avatar).

    Alignment rules:
    - purpose: forced to the binding purpose
    - visibility: forced to public
    - indexable: forced to false

    Returns:
    - True if a normalization update was applied, otherwise False.
    """

    repo = AdminAssetsRepository()
    existing = await repo.get_asset(scope=scope, asset_id=asset_id)
    if existing is None:
        # Let the caller map to the right error; service.update_asset will raise NotFound too.
        await AdminAssetsService(settings).get_asset_detail(scope=scope, asset_id=asset_id)
        return False

    should_update = False
    if str(getattr(existing, "purpose", "") or "") != str(purpose):
        should_update = True
    if str(getattr(existing, "visibility", "") or "") != "public":
        should_update = True
    if bool(getattr(existing, "indexable", False)) is not False:
        should_update = True

    if not should_update:
        return False

    await AdminAssetsService(settings).update_asset(
        scope=scope,
        asset_id=asset_id,
        payload=AdminAssetUpdateRequest(
            visibility=AssetVisibility.PUBLIC,
            purpose=purpose,
            indexable=False,
        ),
    )
    return True
