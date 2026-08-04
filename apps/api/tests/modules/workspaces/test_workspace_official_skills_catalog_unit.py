from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

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

    assert len(bundles) == 6
    assert all(bundle.manifest.publisher.verified for bundle in bundles)
    assert all(bundle.manifest.checksum == bundle.asset.expected_checksum for bundle in bundles)
    assert all(bundle.resources[0].path == "SKILL.md" for bundle in bundles)
    creator = next(bundle for bundle in bundles if bundle.asset.stable_key == "arclayer.skill-creator")
    assert creator.asset.slug == "skill-creator"
    assert [tool.tool_id for tool in creator.manifest.required_tools] == ["workspace.skill.create"]
    assert "Call `workspace_skill_create` exactly once" in creator.resources[0].content


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


async def test_official_catalog_bootstrap_does_not_overwrite_platform_metadata_or_lifecycle() -> None:
    bundle = build_official_skill_bundles((OFFICIAL_SKILL_ASSETS[0],))[0]
    package = SimpleNamespace(
        id=bundle.asset.stable_key,
        workspace_id=None,
        stable_key=bundle.asset.stable_key,
        scope="system",
        source_kind="builtin",
        trust_level="official_verified",
        publisher_id="arclayer",
        display_name="Platform-managed name",
        description="Platform-managed description",
        status="archived",
        metadata_revision=7,
    )

    class _Repository:
        async def get_package_by_stable_key(self, **_kwargs):
            return package

        async def save_package(self, **_kwargs):
            raise AssertionError("Bootstrap must not rewrite a Platform-managed package")

    service = OfficialSkillCatalogSyncService(
        repository=_Repository(),  # type: ignore[arg-type]
        source=StaticOfficialSkillSource((bundle.asset,)),
        supported_tool_ids=frozenset(tool.tool_id for tool in bundle.manifest.required_tools),
    )

    resolved, created = await service._upsert_package(
        bundle=bundle,
        conn=object(),  # type: ignore[arg-type]
    )

    assert resolved is package
    assert created is False
    assert package.display_name == "Platform-managed name"
    assert package.status == "archived"
    assert package.metadata_revision == 7


async def test_official_catalog_version_counts_binds_connection_before_values(monkeypatch) -> None:
    package_id = uuid4()
    connection = object()
    events: list[str] = []

    class _QuerySet:
        def using_db(self, conn):
            assert conn is connection
            events.append("using_db")
            return self

        def group_by(self, *_fields):
            events.append("group_by")
            return self

        def annotate(self, **_annotations):
            events.append("annotate")
            return self

        async def values(self, *_fields):
            events.append("values")
            return [{"package_id": package_id, "total": 2}]

    queryset = _QuerySet()
    monkeypatch.setattr(
        "src.modules.workspaces.skills.official_catalog_repository.SkillVersionRecord.filter",
        lambda **_filters: queryset,
    )
    repository = OfficialSkillCatalogRepository()
    monkeypatch.setattr(repository, "public_connection", lambda: connection)

    counts = await repository.package_version_counts(package_ids=(package_id,))

    assert counts == {package_id: 2}
    assert events == ["using_db", "group_by", "annotate", "values"]
