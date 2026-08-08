from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from math import ceil
from typing import Any, NoReturn
from uuid import UUID

import orjson
from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
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
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.system.agents.definition_service import SUPPORTED_TOOL_GRANTS
from src.modules.system.skills.catalog import (
    CAPABILITY_TAGS,
    DATA_CLASSES,
    EGRESS_DESTINATIONS,
    PERMISSIONS,
    REFERENCE_MIME_TYPES,
)
from src.modules.system.skills.catalog import (
    ids as catalog_ids,
)
from src.modules.system.skills.projection import (
    project_platform_skill_summary,
    project_platform_skill_version,
)
from src.modules.system.skills.schema import (
    PlatformSkillGitHubImportRequest,
    PlatformSkillPackageCreateRequest,
    PlatformSkillPackageDetailOut,
    PlatformSkillPackageReplaceRequest,
    PlatformSkillPackageSummaryOut,
    PlatformSkillPackageUpdateRequest,
    PlatformSkillVersionCreateRequest,
    PlatformSkillVersionOut,
)
from src.modules.workspaces.skills.authoring import (
    VALIDATION_POLICY_VERSION,
    InlineSkillVersion,
    build_skill_version,
)
from src.modules.workspaces.skills.github_fetcher import PublicGitHubSkillFetcher
from src.modules.workspaces.skills.github_source import (
    GitHubSkillSnapshot,
    GitHubSourceError,
    build_github_request_revision,
    normalize_github_ref,
    normalize_github_repository_url,
    normalize_github_subpath,
)
from src.modules.workspaces.skills.manifest import SkillManifestV1, normalize_skill_slug
from src.modules.workspaces.skills.official_catalog_repository import OfficialSkillCatalogRepository
from src.modules.workspaces.skills.official_catalog_source import (
    OFFICIAL_SKILL_PUBLISHER_ID,
    OFFICIAL_SKILL_PUBLISHER_NAME,
)
from src.modules.workspaces.skills.schema import SkillInlineReferenceInput
from src.modules.workspaces.skills.validation import validate_persisted_skill_version
from src.modules.workspaces.skills.zip_import import ParsedSkillZip

ActivityWriter = Callable[..., Awaitable[object]]

SKILL_PACKAGE_CREATED = "platform.skill.package.created"
SKILL_PACKAGE_UPDATED = "platform.skill.package.updated"
SKILL_PACKAGE_ARCHIVED = "platform.skill.package.archived"
SKILL_PACKAGE_RESTORED = "platform.skill.package.restored"
SKILL_VERSION_PUBLISHED = "platform.skill.version.published"


class PlatformSkillCatalogService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: OfficialSkillCatalogRepository,
        github_fetcher: PublicGitHubSkillFetcher,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._github_fetcher = github_fetcher
        self._activity_writer = activity_writer

    async def list_packages(
        self,
        *,
        params: PageParams,
        query: str | None,
        status: str | None,
    ) -> PageData[PlatformSkillPackageSummaryOut]:
        packages, total = await self._repository.list_platform_packages(
            params=params,
            query=_optional_text(query),
            status=status,
        )
        counts = await self._repository.package_version_counts(
            package_ids=tuple(package.id for package in packages),
        )
        return _page_data(
            items=tuple(
                project_platform_skill_summary(package, version_count=counts.get(package.id, 0)) for package in packages
            ),
            total=total,
            params=params,
        )

    async def get_package(self, *, package_id: UUID) -> PlatformSkillPackageDetailOut:
        package = await self._require_package(package_id=package_id)
        versions = await self._repository.list_versions(package_id=package.id)
        projected_versions = []
        for version in versions:
            resources = await self._repository.list_resources(version_id=version.id)
            validation = await self._repository.get_latest_validation(version_id=version.id)
            if validation is None:
                raise RuntimeError("Official Skill version is missing validation evidence")
            projected_versions.append(
                project_platform_skill_version(
                    version,
                    resources=resources,
                    validation=validation,
                )
            )
        summary = project_platform_skill_summary(package, version_count=len(versions))
        return PlatformSkillPackageDetailOut(
            **summary.model_dump(),
            versions=tuple(projected_versions),
        )

    async def create_package(
        self,
        *,
        payload: PlatformSkillPackageCreateRequest,
        idempotency_key: str,
        actor_user_id: UUID,
        source_descriptor: dict[str, object] | None = None,
        source_provenance: dict[str, object] | None = None,
        request_fingerprint: str | None = None,
    ) -> PlatformSkillPackageDetailOut:
        key = _require_idempotency_key(idempotency_key)
        slug = _normalize_slug(payload.slug)
        fingerprint = request_fingerprint or _fingerprint(payload.model_dump(mode="json"))
        authored = _build_official_version(
            slug=slug,
            display_name=payload.display_name,
            description=payload.description,
            payload=payload,
        )
        async with self.tx() as conn:
            await self._repository.lock_catalog_sync(conn=conn)
            existing = await self._repository.get_platform_package_by_idempotency_key(
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint or "", fingerprint)
                package_id = existing.id
            else:
                if await self._repository.get_platform_package_by_slug(normalized_slug=slug, conn=conn):
                    _raise_conflict("SKILL_SLUG_EXISTS")
                package = await self._repository.create_package(
                    values=_package_values(
                        slug=slug,
                        payload=payload,
                        key=key,
                        fingerprint=fingerprint,
                        actor_user_id=actor_user_id,
                        source_descriptor=source_descriptor,
                    ),
                    conn=conn,
                )
                await self._persist_version(
                    package=package,
                    authored=authored,
                    semantic_version=payload.semantic_version,
                    key=key,
                    fingerprint=fingerprint,
                    actor_user_id=actor_user_id,
                    source_provenance=source_provenance,
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_PACKAGE_CREATED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_package",
                    entity_id=package.id,
                    properties={
                        "slug": slug,
                        "sourceKind": (source_descriptor or {}).get("kind", "builtin"),
                    },
                    conn=conn,
                )
                package_id = package.id
        return await self.get_package(package_id=package_id)

    async def import_zip_package(
        self,
        *,
        parsed: ParsedSkillZip,
        filename: str,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> PlatformSkillPackageDetailOut:
        payload = PlatformSkillPackageCreateRequest.model_validate(parsed.payload.model_dump())
        source: dict[str, object] = {
            "kind": "archive",
            "authority": "platform-upload",
            "filename": filename,
            "archiveChecksum": parsed.archive_checksum,
        }
        return await self.create_package(
            payload=payload,
            idempotency_key=idempotency_key,
            actor_user_id=actor_user_id,
            source_descriptor=source,
            source_provenance=source,
            request_fingerprint=_fingerprint({"archiveChecksum": parsed.archive_checksum}),
        )

    async def import_github_package(
        self,
        *,
        payload: PlatformSkillGitHubImportRequest,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> PlatformSkillPackageDetailOut:
        key = _require_idempotency_key(idempotency_key)
        try:
            repository_url = normalize_github_repository_url(payload.repository_url).repository_url
            requested_ref = normalize_github_ref(payload.requested_ref)
            subpath = normalize_github_subpath(payload.subpath)
        except ValueError as exc:
            raise BadRequest(str(exc), error="SKILL_GITHUB_SOURCE_INVALID") from exc
        fingerprint = build_github_request_revision(
            operation="platform-import",
            repository_url=repository_url,
            requested_ref=requested_ref,
            subpath=subpath,
            slug=payload.slug,
            display_name=payload.display_name,
            description=payload.description,
        )
        existing = await self._repository.get_platform_package_by_idempotency_key(
            idempotency_key=key,
        )
        if existing is not None:
            _require_matching_fingerprint(existing.request_fingerprint or "", fingerprint)
            return await self.get_package(package_id=existing.id)
        try:
            snapshot = await self._github_fetcher.fetch(
                repository_url=repository_url,
                requested_ref=requested_ref,
                subpath=subpath,
            )
        except GitHubSourceError as exc:
            error_type = ServiceUnavailable if exc.transient else BadRequest
            raise error_type(exc.safe_message, error=exc.code) from exc
        create_payload = _platform_payload_from_snapshot(payload=payload, snapshot=snapshot)
        source_descriptor = {
            "kind": "github",
            "authority": "platform-import",
            "repositoryUrl": snapshot.repository_url,
            "requestedRef": snapshot.requested_ref,
            "subpath": snapshot.subpath,
            "resolvedCommit": snapshot.resolved_commit,
            "resolvedTree": snapshot.resolved_tree,
        }
        return await self.create_package(
            payload=create_payload,
            idempotency_key=key,
            actor_user_id=actor_user_id,
            source_descriptor=source_descriptor,
            source_provenance=source_descriptor,
            request_fingerprint=fingerprint,
        )

    async def replace_package(
        self,
        *,
        package_id: UUID,
        payload: PlatformSkillPackageReplaceRequest,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> PlatformSkillPackageDetailOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({"packageId": str(package_id), **payload.model_dump(mode="json")})
        async with self.tx() as conn:
            package = await self._require_package_for_update(package_id=package_id, conn=conn)
            existing = await self._repository.get_version_by_idempotency_key(
                package_id=package.id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
            else:
                _require_revision(package=package, expected=payload.expected_revision)
                if str(package.status) != SkillPackageStatus.ACTIVE.value:
                    _raise_conflict("SKILL_PACKAGE_ARCHIVED")
                changed_fields = []
                package_update_fields = []
                if package.display_name != payload.display_name:
                    package.display_name = payload.display_name
                    changed_fields.append("displayName")
                    package_update_fields.append("display_name")
                if package.description != payload.description:
                    package.description = payload.description
                    changed_fields.append("description")
                    package_update_fields.append("description")
                package.updated_by_user_id = actor_user_id
                package.metadata_revision += 1
                await self._repository.save_package(
                    package=package,
                    update_fields=(*package_update_fields, "updated_by_user_id", "metadata_revision"),
                    conn=conn,
                )
                authored = _build_official_version(
                    slug=package.slug,
                    display_name=payload.display_name,
                    description=payload.description,
                    payload=payload,
                )
                version = await self._persist_version(
                    package=package,
                    authored=authored,
                    semantic_version=payload.semantic_version,
                    key=key,
                    fingerprint=fingerprint,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_PACKAGE_UPDATED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_package",
                    entity_id=package.id,
                    properties={"changedFields": [*changed_fields, "content"]},
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_VERSION_PUBLISHED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_version",
                    entity_id=version.id,
                    properties={"packageId": str(package.id), "versionNumber": version.version_number},
                    conn=conn,
                )
        return await self.get_package(package_id=package_id)

    async def update_package(
        self,
        *,
        package_id: UUID,
        payload: PlatformSkillPackageUpdateRequest,
        actor_user_id: UUID,
    ) -> PlatformSkillPackageDetailOut:
        async with self.tx() as conn:
            package = await self._require_package_for_update(package_id=package_id, conn=conn)
            _require_revision(package=package, expected=payload.expected_revision)
            changes = {
                field: value
                for field, value in {
                    "display_name": payload.display_name,
                    "description": payload.description,
                }.items()
                if value is not None and getattr(package, field) != value
            }
            if changes:
                for field, value in changes.items():
                    setattr(package, field, value)
                package.updated_by_user_id = actor_user_id
                package.metadata_revision += 1
                await self._repository.save_package(
                    package=package,
                    update_fields=(*changes, "updated_by_user_id", "metadata_revision"),
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_PACKAGE_UPDATED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_package",
                    entity_id=package.id,
                    properties={"changedFields": sorted(changes)},
                    conn=conn,
                )
        return await self.get_package(package_id=package_id)

    async def create_version(
        self,
        *,
        package_id: UUID,
        payload: PlatformSkillVersionCreateRequest,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> PlatformSkillVersionOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({"packageId": str(package_id), **payload.model_dump(mode="json")})
        async with self.tx() as conn:
            package = await self._require_package_for_update(package_id=package_id, conn=conn)
            if str(package.status) != SkillPackageStatus.ACTIVE.value:
                _raise_conflict("SKILL_PACKAGE_ARCHIVED")
            existing = await self._repository.get_version_by_idempotency_key(
                package_id=package.id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                version = existing
            else:
                authored = _build_official_version(
                    slug=package.slug,
                    display_name=package.display_name,
                    description=package.description,
                    payload=payload,
                )
                version = await self._persist_version(
                    package=package,
                    authored=authored,
                    semantic_version=payload.semantic_version,
                    key=key,
                    fingerprint=fingerprint,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_VERSION_PUBLISHED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_version",
                    entity_id=version.id,
                    properties={"packageId": str(package.id), "versionNumber": version.version_number},
                    conn=conn,
                )
        detail = await self.get_package(package_id=package_id)
        return next(item for item in detail.versions if item.id == version.id)

    async def archive_package(
        self,
        *,
        package_id: UUID,
        expected_revision: int,
        actor_user_id: UUID,
    ) -> PlatformSkillPackageDetailOut:
        async with self.tx() as conn:
            package = await self._require_package_for_update(package_id=package_id, conn=conn)
            _require_revision(package=package, expected=expected_revision)
            if str(package.status) != SkillPackageStatus.ARCHIVED.value:
                package.status = SkillPackageStatus.ARCHIVED
                package.archived_at = datetime.now(UTC)
                package.archived_by_user_id = actor_user_id
                package.updated_by_user_id = actor_user_id
                package.metadata_revision += 1
                await self._repository.save_package(
                    package=package,
                    update_fields=(
                        "status",
                        "archived_at",
                        "archived_by_user_id",
                        "updated_by_user_id",
                        "metadata_revision",
                    ),
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_PACKAGE_ARCHIVED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_package",
                    entity_id=package.id,
                    properties={"latestValidVersionId": str(package.latest_valid_version_id)},
                    conn=conn,
                )
        return await self.get_package(package_id=package_id)

    async def restore_package(
        self,
        *,
        package_id: UUID,
        expected_revision: int,
        actor_user_id: UUID,
    ) -> PlatformSkillPackageDetailOut:
        async with self.tx() as conn:
            package = await self._require_package_for_update(package_id=package_id, conn=conn)
            _require_revision(package=package, expected=expected_revision)
            if str(package.status) == SkillPackageStatus.ARCHIVED.value:
                package.status = SkillPackageStatus.ACTIVE
                package.archived_at = None
                package.archived_by_user_id = None
                package.updated_by_user_id = actor_user_id
                package.metadata_revision += 1
                await self._repository.save_package(
                    package=package,
                    update_fields=(
                        "status",
                        "archived_at",
                        "archived_by_user_id",
                        "updated_by_user_id",
                        "metadata_revision",
                    ),
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_PACKAGE_RESTORED,
                    actor_user_id=actor_user_id,
                    entity_type="official_skill_package",
                    entity_id=package.id,
                    properties={"latestValidVersionId": str(package.latest_valid_version_id)},
                    conn=conn,
                )
        return await self.get_package(package_id=package_id)

    async def _persist_version(
        self,
        *,
        package: SkillPackageRecord,
        authored: InlineSkillVersion,
        semantic_version: str | None,
        key: str,
        fingerprint: str,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
        source_provenance: dict[str, object] | None = None,
    ) -> SkillVersionRecord:
        manifest = authored.manifest
        required_tool_ids = {item.tool_id for item in manifest.required_tools}
        if not required_tool_ids.issubset(SUPPORTED_TOOL_GRANTS):
            raise BadRequest(
                t("errors", "SKILL_REQUIRED_TOOL_UNAVAILABLE"),
                error="SKILL_REQUIRED_TOOL_UNAVAILABLE",
            )
        _validate_catalog_declarations(manifest)
        version = await self._repository.create_version(
            values={
                "package_id": package.id,
                "workspace_id": None,
                "version_number": await self._repository.next_version_number(package_id=package.id, conn=conn),
                "semantic_version": semantic_version,
                "manifest_version": manifest.manifest_version,
                "manifest": manifest.model_dump(mode="json", by_alias=True),
                "package_checksum": manifest.checksum,
                "source_provenance": source_provenance or {"kind": "builtin", "authority": "platform"},
                "compatibility": manifest.compatibility.model_dump(mode="json", by_alias=True),
                "required_tools": [item.model_dump(mode="json", by_alias=True) for item in manifest.required_tools],
                "permissions": [item.model_dump(mode="json", by_alias=True) for item in manifest.permissions],
                "data_egress": [item.model_dump(mode="json", by_alias=True) for item in manifest.data_egress],
                "capability_tags": list(manifest.capability_tags),
                "validation_policy_version": VALIDATION_POLICY_VERSION,
                "status": SkillVersionStatus.CANDIDATE,
                "provenance_actor_user_id": actor_user_id,
                "correlation_id": correlation_id.get(None),
                "request_idempotency_key": key,
                "request_fingerprint": fingerprint,
            },
            conn=conn,
        )
        resources = await self._repository.create_resources(
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
                for resource in authored.resources
            ),
            conn=conn,
        )
        outcome = validate_persisted_skill_version(
            version=version,
            resources=resources,
            policy_version=VALIDATION_POLICY_VERSION,
        )
        await self._repository.create_validation(
            values={
                "skill_version_id": version.id,
                "workspace_id": None,
                "validator_policy_version": VALIDATION_POLICY_VERSION,
                "status": outcome.status,
                "findings": [finding.model_dump(mode="json", by_alias=True) for finding in outcome.findings],
                "finding_hash": outcome.finding_hash,
                "actor_user_id": actor_user_id,
                "correlation_id": correlation_id.get(None),
                "request_idempotency_key": f"{key}:validation",
                "request_fingerprint": fingerprint,
            },
            conn=conn,
        )
        version.status = SkillVersionStatus(outcome.status.value)
        await self._repository.save_version(version=version, update_fields=("status",), conn=conn)
        if outcome.status in {SkillValidationStatus.VALID, SkillValidationStatus.WARNING}:
            package.latest_valid_version_id = version.id
            await self._repository.save_package(
                package=package,
                update_fields=("latest_valid_version_id",),
                conn=conn,
            )
        return version

    async def _require_package(self, *, package_id: UUID) -> SkillPackageRecord:
        package = await self._repository.get_platform_package(package_id=package_id)
        if package is None:
            _raise_not_found()
        return package

    async def _require_package_for_update(
        self,
        *,
        package_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillPackageRecord:
        package = await self._repository.get_platform_package(
            package_id=package_id,
            conn=conn,
            for_update=True,
        )
        if package is None:
            _raise_not_found()
        return package

    async def _write_activity(
        self,
        *,
        event_name: str,
        actor_user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        properties: dict[str, Any],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                source="api",
                properties=properties,
            ),
            conn=conn,
        )


def _package_values(
    *,
    slug: str,
    payload: PlatformSkillPackageCreateRequest,
    key: str,
    fingerprint: str,
    actor_user_id: UUID,
    source_descriptor: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "workspace_id": None,
        "stable_key": f"arclayer.{slug}",
        "scope": SkillPackageScope.SYSTEM,
        "source_kind": SkillSourceKind.BUILTIN,
        "slug": slug,
        "normalized_slug": slug,
        "display_name": payload.display_name,
        "description": payload.description,
        "publisher_id": OFFICIAL_SKILL_PUBLISHER_ID,
        "publisher_name": OFFICIAL_SKILL_PUBLISHER_NAME,
        "trust_level": SkillTrustLevel.OFFICIAL_VERIFIED,
        "publisher_verification": {
            "verified": True,
            "authority": OFFICIAL_SKILL_PUBLISHER_ID,
            "source": "platform",
        },
        "status": SkillPackageStatus.ACTIVE,
        "metadata_revision": 1,
        "source_descriptor": source_descriptor or {"kind": "builtin", "authority": "platform"},
        "created_by_user_id": actor_user_id,
        "updated_by_user_id": actor_user_id,
        "request_idempotency_key": key,
        "request_fingerprint": fingerprint,
    }


def _build_official_version(
    *,
    slug: str,
    display_name: str,
    description: str,
    payload: (
        PlatformSkillPackageCreateRequest | PlatformSkillPackageReplaceRequest | PlatformSkillVersionCreateRequest
    ),
) -> InlineSkillVersion:
    try:
        return build_skill_version(
            skill_id=f"arclayer.{slug}",
            publisher_id=OFFICIAL_SKILL_PUBLISHER_ID,
            publisher_name=OFFICIAL_SKILL_PUBLISHER_NAME,
            publisher_verified=True,
            display_name=display_name,
            description=description,
            payload=payload,
        )
    except (TypeError, ValueError) as exc:
        raise BadRequest(t("errors", "SKILL_RESOURCE_INVALID"), error="SKILL_RESOURCE_INVALID") from exc


def _validate_catalog_declarations(manifest: SkillManifestV1) -> None:
    declarations = (
        (
            {item.action for item in manifest.permissions},
            catalog_ids(PERMISSIONS),
            "SKILL_PERMISSION_UNREGISTERED",
        ),
        (
            {item.destination for item in manifest.data_egress},
            catalog_ids(EGRESS_DESTINATIONS),
            "SKILL_EGRESS_DESTINATION_UNREGISTERED",
        ),
        (
            {data_class for item in manifest.data_egress for data_class in item.data_classes},
            catalog_ids(DATA_CLASSES),
            "SKILL_DATA_CLASS_UNREGISTERED",
        ),
        (set(manifest.capability_tags), catalog_ids(CAPABILITY_TAGS), "SKILL_CAPABILITY_TAG_UNREGISTERED"),
        (
            {resource.mime_type for resource in manifest.resources if resource.role == "reference"},
            catalog_ids(REFERENCE_MIME_TYPES),
            "SKILL_REFERENCE_MIME_TYPE_UNREGISTERED",
        ),
    )
    for requested, registered, error in declarations:
        if requested - registered:
            raise BadRequest(t("errors", error), error=error)


def _platform_payload_from_snapshot(
    *,
    payload: PlatformSkillGitHubImportRequest,
    snapshot: GitHubSkillSnapshot,
) -> PlatformSkillPackageCreateRequest:
    instructions = next(
        (resource.content for resource in snapshot.resources if resource.path == "SKILL.md"),
        None,
    )
    if instructions is None:
        raise BadRequest("GitHub Skill package is missing SKILL.md", error="SKILL_GITHUB_SOURCE_INVALID")
    references = tuple(
        SkillInlineReferenceInput(
            path=resource.path,
            content=resource.content,
            mime_type=resource.mime_type,
        )
        for resource in snapshot.resources
        if resource.path != "SKILL.md"
    )
    return PlatformSkillPackageCreateRequest(
        slug=payload.slug,
        display_name=payload.display_name,
        description=payload.description,
        instructions=instructions,
        references=references,
    )


def _normalize_slug(value: str) -> str:
    try:
        return normalize_skill_slug(value)
    except ValueError as exc:
        raise BadRequest(t("errors", "SKILL_SLUG_INVALID"), error="SKILL_SLUG_INVALID") from exc


def _require_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise BadRequest(t("errors", "SKILL_IDEMPOTENCY_INVALID"), error="SKILL_IDEMPOTENCY_INVALID")
    return normalized


def _require_matching_fingerprint(actual: str, expected: str) -> None:
    if actual != expected:
        _raise_conflict("SKILL_IDEMPOTENCY_CONFLICT")


def _require_revision(*, package: SkillPackageRecord, expected: int) -> None:
    if package.metadata_revision != expected:
        _raise_conflict("SKILL_REVISION_CONFLICT")


def _fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _page_data[T](*, items: tuple[T, ...], total: int, params: PageParams) -> PageData[T]:
    pages = ceil(total / params.size) if total else 0
    return PageData[T](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=params.page + 1 if params.page < pages else None,
        prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
    )


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(t("errors", code), error=code)
