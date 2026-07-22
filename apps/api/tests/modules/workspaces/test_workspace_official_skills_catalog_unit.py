from __future__ import annotations

import pytest

from src.modules.workspaces.skills.manifest import SkillToolRequirementV1
from src.modules.workspaces.skills.official_catalog_assets import OFFICIAL_SKILL_ASSETS
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_source import (
    OfficialSkillAsset,
    build_official_skill_bundles,
)
from src.modules.workspaces.skills.official_catalog_sync import OfficialSkillCatalogSyncService


class StaticOfficialSkillSource:
    def __init__(self, assets: tuple[OfficialSkillAsset, ...]) -> None:
        self._assets = assets

    def load(self) -> tuple[OfficialSkillAsset, ...]:
        return self._assets


def test_packaged_official_skill_catalog_has_pinned_canonical_bundles() -> None:
    bundles = build_official_skill_bundles(OFFICIAL_SKILL_ASSETS)

    assert len(bundles) == 5
    assert all(bundle.manifest.publisher.verified for bundle in bundles)
    assert all(bundle.manifest.checksum == bundle.asset.expected_checksum for bundle in bundles)
    assert all(bundle.resources[0].path == "SKILL.md" for bundle in bundles)


def test_official_skill_catalog_rejects_duplicate_identity_checksum_drift_and_secrets() -> None:
    base = OFFICIAL_SKILL_ASSETS[0]
    with pytest.raises(ValueError, match="duplicate"):
        build_official_skill_bundles((base, base))

    with pytest.raises(ValueError, match="checksum mismatch"):
        build_official_skill_bundles((base.model_copy(update={"expected_checksum": "sha256:" + ("f" * 64)}),))

    secret_asset = base.model_copy(
        update={
            "stable_key": "arclayer.secret-test",
            "slug": "secret-test",
            "display_name_key": "SECRET_TEST_NAME",
            "description_key": "SECRET_TEST_DESC",
            "instructions": "api_key=abcdefghijklmnop1234567890",
        }
    )
    with pytest.raises(ValueError, match="credential-like"):
        build_official_skill_bundles(
            (secret_asset,),
            verify_expected_checksums=False,
        )


async def test_official_catalog_sync_fails_before_database_for_unavailable_tool() -> None:
    base = OFFICIAL_SKILL_ASSETS[0]
    asset = base.model_copy(
        update={
            "required_tools": (
                SkillToolRequirementV1(
                    tool_id="knowledge.search",
                    version_range=">=1",
                    intended_use="Search workspace knowledge.",
                ),
            ),
        }
    )
    computed = build_official_skill_bundles((asset,), verify_expected_checksums=False)[0]
    asset = asset.model_copy(update={"expected_checksum": computed.manifest.checksum})
    service = OfficialSkillCatalogSyncService(
        repository=OfficialSkillCatalogRepository(),
        source=StaticOfficialSkillSource((asset,)),
        supported_tool_ids=frozenset({"human.request_input"}),
    )

    with pytest.raises(ValueError, match="unavailable Tools"):
        await service.sync()
