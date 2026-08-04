from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.services import BaseService
from src.models.skills._enums import (
    SkillPackageScope,
    SkillPackageStatus,
    SkillSourceKind,
    SkillTrustLevel,
    SkillValidationStatus,
    SkillVersionStatus,
)
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import SkillVersionRecord
from src.modules.workspaces.skills.official_catalog_integrity import verify_persisted_official_skill_version
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_source import (
    OFFICIAL_SKILL_CATALOG_REVISION,
    OFFICIAL_SKILL_PUBLISHER_ID,
    OFFICIAL_SKILL_PUBLISHER_NAME,
    OfficialSkillBundle,
    OfficialSkillCatalogSource,
    build_official_skill_bundles,
)
from src.modules.workspaces.skills.validation import build_skill_validation_finding_hash


class OfficialSkillCatalogSyncResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    packages_created: int
    versions_created: int
    packages_archived: int


class OfficialSkillCatalogSyncService(BaseService):
    def __init__(
        self,
        *,
        repository: OfficialSkillCatalogRepository,
        source: OfficialSkillCatalogSource,
        supported_tool_ids: frozenset[str],
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._source = source
        self._supported_tool_ids = supported_tool_ids

    async def sync(self) -> OfficialSkillCatalogSyncResult:
        bundles = build_official_skill_bundles(self._source.load())
        self._require_supported_tools(bundles)
        packages_created = 0
        versions_created = 0
        async with self.tx() as conn:
            await self._repository.lock_catalog_sync(conn=conn)
            for bundle in bundles:
                package, package_created = await self._upsert_package(bundle=bundle, conn=conn)
                version_created = await self._sync_version(package=package, bundle=bundle, conn=conn)
                packages_created += int(package_created)
                versions_created += int(version_created)
        return OfficialSkillCatalogSyncResult(
            packages_created=packages_created,
            versions_created=versions_created,
            packages_archived=0,
        )

    async def _upsert_package(
        self,
        *,
        bundle: OfficialSkillBundle,
        conn: BaseDBAsyncClient,
    ) -> tuple[SkillPackageRecord, bool]:
        asset = bundle.asset
        package = await self._repository.get_package_by_stable_key(stable_key=asset.stable_key, conn=conn)
        descriptor = {
            "kind": "builtin",
            "authority": "packaged_seed",
            "catalogRevision": OFFICIAL_SKILL_CATALOG_REVISION,
            "displayNameKey": asset.display_name_key,
            "descriptionKey": asset.description_key,
        }
        verification = {
            "verified": True,
            "authority": OFFICIAL_SKILL_PUBLISHER_ID,
            "source": "packaged_catalog",
            "catalogRevision": OFFICIAL_SKILL_CATALOG_REVISION,
        }
        if package is None:
            return (
                await self._repository.create_package(
                    values={
                        "workspace_id": None,
                        "stable_key": asset.stable_key,
                        "scope": SkillPackageScope.SYSTEM,
                        "source_kind": SkillSourceKind.BUILTIN,
                        "slug": asset.slug,
                        "normalized_slug": asset.slug,
                        "display_name": asset.name,
                        "description": asset.description,
                        "publisher_id": OFFICIAL_SKILL_PUBLISHER_ID,
                        "publisher_name": OFFICIAL_SKILL_PUBLISHER_NAME,
                        "trust_level": SkillTrustLevel.OFFICIAL_VERIFIED,
                        "publisher_verification": verification,
                        "status": SkillPackageStatus.ACTIVE,
                        "metadata_revision": 1,
                        "source_descriptor": descriptor,
                    },
                    conn=conn,
                ),
                True,
            )
        self._require_official_package(package)
        return package, False

    async def _sync_version(
        self,
        *,
        package: SkillPackageRecord,
        bundle: OfficialSkillBundle,
        conn: BaseDBAsyncClient,
    ) -> bool:
        manifest = bundle.manifest
        version = await self._repository.get_version_by_checksum(
            package_id=package.id,
            package_checksum=manifest.checksum,
            conn=conn,
        )
        if version is None:
            version = await self._create_version(package=package, bundle=bundle, conn=conn)
            created = True
        else:
            await verify_persisted_official_skill_version(
                repository=self._repository,
                version=version,
                bundle=bundle,
                conn=conn,
            )
            created = False
        if str(package.status) == SkillPackageStatus.ACTIVE.value and package.latest_valid_version_id != version.id:
            package.latest_valid_version_id = version.id
            await self._repository.save_package(
                package=package,
                update_fields=("latest_valid_version_id",),
                conn=conn,
            )
        return created

    async def _create_version(
        self,
        *,
        package: SkillPackageRecord,
        bundle: OfficialSkillBundle,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord:
        manifest = bundle.manifest
        version = await self._repository.create_version(
            values={
                "package_id": package.id,
                "workspace_id": None,
                "version_number": await self._repository.next_version_number(package_id=package.id, conn=conn),
                "semantic_version": bundle.asset.semantic_version,
                "manifest_version": manifest.manifest_version,
                "manifest": manifest.model_dump(mode="json", by_alias=True),
                "package_checksum": manifest.checksum,
                "source_provenance": {
                    "kind": "builtin",
                    "stableKey": bundle.asset.stable_key,
                    "catalogRevision": OFFICIAL_SKILL_CATALOG_REVISION,
                },
                "compatibility": manifest.compatibility.model_dump(mode="json", by_alias=True),
                "required_tools": [item.model_dump(mode="json", by_alias=True) for item in manifest.required_tools],
                "permissions": [item.model_dump(mode="json", by_alias=True) for item in manifest.permissions],
                "data_egress": [item.model_dump(mode="json", by_alias=True) for item in manifest.data_egress],
                "capability_tags": list(manifest.capability_tags),
                "validation_policy_version": 1,
                "status": SkillVersionStatus.VALID,
                "request_idempotency_key": f"official:{manifest.checksum}",
                "request_fingerprint": manifest.checksum.removeprefix("sha256:"),
            },
            conn=conn,
        )
        await self._repository.create_resources(
            values=tuple(
                {
                    "skill_version_id": version.id,
                    "workspace_id": None,
                    "normalized_path": resource.path,
                    "role": resource.role,
                    "mime_type": resource.mime_type,
                    "byte_size": resource.byte_size,
                    "content_digest": resource.digest,
                    "inline_content": resource.content,
                    "storage_reference": {},
                }
                for resource in bundle.resources
            ),
            conn=conn,
        )
        finding_hash = build_skill_validation_finding_hash(
            package_checksum=manifest.checksum,
            policy_version=1,
            status=SkillValidationStatus.VALID,
            findings=(),
        )
        await self._repository.create_validation(
            values={
                "skill_version_id": version.id,
                "workspace_id": None,
                "validator_policy_version": 1,
                "status": SkillValidationStatus.VALID,
                "findings": [],
                "finding_hash": finding_hash,
                "request_idempotency_key": f"official-validation:{manifest.checksum.removeprefix('sha256:')}",
                "request_fingerprint": manifest.checksum.removeprefix("sha256:"),
            },
            conn=conn,
        )
        return version

    def _require_supported_tools(self, bundles: tuple[OfficialSkillBundle, ...]) -> None:
        missing = sorted({
            requirement.tool_id
            for bundle in bundles
            for requirement in bundle.manifest.required_tools
            if requirement.tool_id not in self._supported_tool_ids
        })
        if missing:
            raise ValueError(f"Official Skill catalog references unavailable Tools: {', '.join(missing)}")

    @staticmethod
    def _require_official_package(package: SkillPackageRecord) -> None:
        if (
            package.workspace_id is not None
            or str(package.scope) != SkillPackageScope.SYSTEM.value
            or str(package.source_kind) != SkillSourceKind.BUILTIN.value
            or str(package.trust_level) != SkillTrustLevel.OFFICIAL_VERIFIED.value
            or package.publisher_id != OFFICIAL_SKILL_PUBLISHER_ID
        ):
            raise RuntimeError(f"Official Skill stable key collides with another authority: {package.stable_key}")
