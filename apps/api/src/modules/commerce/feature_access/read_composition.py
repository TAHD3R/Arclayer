from __future__ import annotations

from src.config import Settings
from src.modules.commerce.feature_access.composition import TortoiseFeatureAccessActorAuthority
from src.modules.commerce.feature_access.read_contracts import (
    EMPTY_FEATURE_ACCESS_METADATA_REGISTRY,
    FeatureAccessMetadataRegistry,
)
from src.modules.commerce.feature_access.read_repository import TortoiseFeatureAccessReadRepository
from src.modules.commerce.feature_access.read_service import FeatureAccessReadService


def build_feature_access_read_service(
    settings: Settings,
    *,
    metadata_registry: FeatureAccessMetadataRegistry = EMPTY_FEATURE_ACCESS_METADATA_REGISTRY,
) -> FeatureAccessReadService:
    return FeatureAccessReadService(
        settings,
        persistence=TortoiseFeatureAccessReadRepository(metadata_registry),
        actor_authority=TortoiseFeatureAccessActorAuthority(),
    )
