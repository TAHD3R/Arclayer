from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.skills._enums import SkillValidationStatus, SkillVersionStatus
from src.models.skills.skill_version import SkillVersionRecord
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_source import OfficialSkillBundle
from src.modules.workspaces.skills.validation import build_skill_validation_finding_hash


async def verify_persisted_official_skill_version(
    *,
    repository: OfficialSkillCatalogRepository,
    version: SkillVersionRecord,
    bundle: OfficialSkillBundle,
    conn: BaseDBAsyncClient,
) -> None:
    resources = await repository.list_resources(version_id=version.id, conn=conn)
    validation = await repository.get_latest_validation(version_id=version.id, conn=conn)
    expected_resources = tuple(
        (item.path, item.role, item.mime_type, item.byte_size, item.digest, item.content) for item in bundle.resources
    )
    persisted_resources = tuple(
        (
            item.normalized_path,
            str(item.role),
            item.mime_type,
            item.byte_size,
            item.content_digest,
            item.inline_content,
        )
        for item in resources
    )
    expected_hash = build_skill_validation_finding_hash(
        package_checksum=bundle.manifest.checksum,
        policy_version=1,
        status=SkillValidationStatus.VALID,
        findings=(),
    )
    if (
        version.manifest != bundle.manifest.model_dump(mode="json", by_alias=True)
        or version.semantic_version != bundle.asset.semantic_version
        or str(version.status) != SkillVersionStatus.VALID.value
        or persisted_resources != expected_resources
        or validation is None
        or str(validation.status) != SkillValidationStatus.VALID.value
        or validation.findings
        or validation.finding_hash != expected_hash
    ):
        raise RuntimeError(f"Persisted official Skill version is not canonical: {bundle.asset.stable_key}")
