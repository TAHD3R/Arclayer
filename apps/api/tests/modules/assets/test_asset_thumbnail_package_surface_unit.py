from __future__ import annotations

import pytest

from src.modules.assets import jobs as asset_jobs

pytestmark = pytest.mark.unit


def test_asset_thumbnail_package_exposes_stable_composition_surface() -> None:
    expected_names = {
        "ASSET_THUMBNAIL_JOB_TYPE",
        "ASSET_THUMBNAIL_JOB_TYPE_VERSION",
        "ASSET_THUMBNAIL_MEDIA_UNSUPPORTED_CODE",
        "ASSET_THUMBNAIL_OUTCOME_INVALID_CODE",
        "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE",
        "ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY",
        "ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION",
        "ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE",
        "ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED_CODE",
        "ASSET_THUMBNAIL_RENDER_FAILED_CODE",
        "ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE",
        "ASSET_THUMBNAIL_SOURCE_NOT_FOUND_CODE",
        "ASSET_THUMBNAIL_SOURCE_STALE_CODE",
        "ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE_CODE",
        "ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED_CODE",
        "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE",
        "ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE",
        "ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE",
        "AssetThumbnailJobHandler",
        "AssetThumbnailProviderEffectCoordinator",
        "ExactAssetThumbnailProviderStorageResolver",
        "StorageAssetThumbnailPipeline",
        "TenantAssetThumbnailRepository",
        "build_asset_thumbnail_provider_effect_contract",
    }
    legacy_names = {
        "AssetThumbnailEffectManifest",
        "AssetThumbnailStorageProfileSnapshot",
        "ConfiguredAssetThumbnailStorageResolver",
    }

    assert expected_names <= set(asset_jobs.__all__)
    assert legacy_names.isdisjoint(asset_jobs.__all__)
    assert all(not hasattr(asset_jobs, name) for name in legacy_names)
