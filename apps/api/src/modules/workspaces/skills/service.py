from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from typing import Any, NoReturn
from uuid import UUID

import orjson
from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.skills._enums import (
    SkillPackageScope,
    SkillPackageStatus,
    SkillSourceKind,
    SkillTrustLevel,
    SkillVersionStatus,
)
from src.models.skills.skill_package import SkillPackageRecord
from src.models.skills.skill_version import SkillVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.workspaces.skills.authoring import (
    VALIDATION_POLICY_VERSION,
    InlineSkillVersion,
    build_inline_skill_version,
)
from src.modules.workspaces.skills.manifest import normalize_skill_slug
from src.modules.workspaces.skills.projection import (
    project_package_detail,
    project_package_summary,
    project_version_detail,
    project_version_summary,
)
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import (
    SkillCursorPage,
    SkillPackageCreateOut,
    SkillPackageCreateRequest,
    SkillPackageDetailOut,
    SkillPackageSummaryOut,
    SkillVersionCreateRequest,
    SkillVersionDetailOut,
    SkillVersionSummaryOut,
    WorkspaceSkillsCapabilitiesOut,
)
from src.modules.workspaces.skills.zip_import import SkillZipImportError, parse_workspace_skill_zip

ActivityWriter = Callable[..., Awaitable[object]]

SKILL_PACKAGE_CREATED = "workspace.skill.package.created"
SKILL_VERSION_CREATED = "workspace.skill.version.created"


def workspace_skills_capabilities(settings: Settings) -> WorkspaceSkillsCapabilitiesOut:
    return WorkspaceSkillsCapabilitiesOut(
        inline_authoring_available=True,
        immutable_versions=True,
        official_catalog_available=True,
        github_import_available=settings.skill_github_fetch.enabled,
        validation_available=True,
        installation_available=True,
        agent_skill_grants_available=True,
    )


class WorkspaceSkillsService(BaseService):
    def __init__(
        self,
        *,
        repository: WorkspaceSkillsRepository,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._activity_writer = activity_writer

    async def list_packages(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        query: str | None,
        status: str | None,
    ) -> SkillCursorPage[SkillPackageSummaryOut]:
        records, next_cursor = await self._repository.list_packages(
            workspace_id=workspace_id,
            limit=limit,
            cursor=cursor,
            query=_optional_text(query),
            status=status,
        )
        counts = await self._repository.package_version_counts(
            workspace_id=workspace_id,
            package_ids=tuple(record.id for record in records),
        )
        return SkillCursorPage[SkillPackageSummaryOut](
            items=tuple(project_package_summary(record, version_count=counts.get(record.id, 0)) for record in records),
            next_cursor=next_cursor,
        )

    async def get_package(self, *, workspace_id: UUID, package_id: UUID) -> SkillPackageDetailOut:
        package = await self._require_package(workspace_id=workspace_id, package_id=package_id)
        latest = await self._repository.get_latest_version(
            workspace_id=workspace_id,
            package_id=package.id,
        )
        counts = await self._repository.package_version_counts(
            workspace_id=workspace_id,
            package_ids=(package.id,),
        )
        return project_package_detail(
            package,
            version_count=counts.get(package.id, 0),
            latest_version=latest,
        )

    async def create_package(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillPackageCreateRequest,
        source_kind: SkillSourceKind = SkillSourceKind.INLINE,
        source_descriptor: dict[str, object] | None = None,
        source_provenance: dict[str, object] | None = None,
    ) -> SkillPackageCreateOut:
        key = _require_idempotency_key(idempotency_key)
        slug = _normalize_slug(payload.slug)
        resolved_descriptor: dict[str, object] = (
            source_descriptor if source_descriptor is not None else {"kind": source_kind.value}
        )
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "sourceKind": source_kind.value,
            "sourceDescriptor": resolved_descriptor,
            **payload.model_dump(mode="json"),
        })
        resolved_provenance: dict[str, object] = (
            source_provenance
            if source_provenance is not None
            else {"kind": source_kind.value, "actorUserId": str(actor_user_id)}
        )
        authored = _build_authored(
            workspace_id=workspace_id,
            slug=slug,
            display_name=payload.display_name,
            description=payload.description,
            payload=payload,
        )
        try:
            package, version = await self._create_package_transaction(
                workspace_id=workspace_id,
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                slug=slug,
                payload=payload,
                authored=authored,
                source_kind=source_kind,
                source_descriptor=resolved_descriptor,
                source_provenance=resolved_provenance,
            )
        except IntegrityError as exc:
            package, version = await self._resolve_package_create_race(
                workspace_id=workspace_id,
                key=key,
                fingerprint=fingerprint,
                slug=slug,
                error=exc,
            )
        return await self._project_create_out(package=package, version=version)

    async def create_zip_package(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        filename: str,
        archive: bytes,
    ) -> SkillPackageCreateOut:
        try:
            parsed = parse_workspace_skill_zip(archive)
        except SkillZipImportError as exc:
            raise BadRequest(message=t("errors", exc.code), error=exc.code) from exc
        return await self.create_package(
            workspace_id=workspace_id,
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            payload=parsed.payload,
            source_kind=SkillSourceKind.ARCHIVE,
            source_descriptor={
                "kind": "archive",
                "filename": filename,
                "archiveChecksum": parsed.archive_checksum,
            },
            source_provenance={
                "kind": "archive",
                "filename": filename,
                "archiveChecksum": parsed.archive_checksum,
                "actorUserId": str(actor_user_id),
            },
        )

    async def list_versions(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        limit: int,
        cursor: UUID | None,
    ) -> SkillCursorPage[SkillVersionSummaryOut]:
        await self._require_package(workspace_id=workspace_id, package_id=package_id)
        records, next_cursor = await self._repository.list_versions(
            workspace_id=workspace_id,
            package_id=package_id,
            limit=limit,
            cursor=cursor,
        )
        return SkillCursorPage[SkillVersionSummaryOut](
            items=tuple(project_version_summary(record) for record in records),
            next_cursor=next_cursor,
        )

    async def get_version(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        version_id: UUID,
    ) -> SkillVersionDetailOut:
        record = await self._repository.get_version(
            workspace_id=workspace_id,
            package_id=package_id,
            version_id=version_id,
        )
        if record is None:
            _raise_not_found()
        resources = await self._repository.list_resources(
            workspace_id=workspace_id,
            version_id=record.id,
        )
        return project_version_detail(record, resources=resources)

    async def create_version(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        package_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillVersionCreateRequest,
    ) -> SkillVersionDetailOut:
        key = _require_idempotency_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "packageId": str(package_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            package = await self._repository.get_package_for_update(
                workspace_id=workspace_id,
                package_id=package_id,
                conn=conn,
            )
            if package is None:
                _raise_not_found()
            existing = await self._repository.get_version_by_idempotency_key(
                package_id=package.id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint, fingerprint)
                version = existing
            else:
                if str(package.status) != SkillPackageStatus.ACTIVE.value:
                    _raise_archived()
                authored = _build_authored(
                    workspace_id=workspace_id,
                    slug=package.normalized_slug,
                    display_name=package.display_name,
                    description=package.description,
                    payload=payload,
                )
                version = await self._create_version(
                    workspace_id=workspace_id,
                    package=package,
                    actor_user_id=actor_user_id,
                    key=key,
                    fingerprint=fingerprint,
                    authored=authored,
                    semantic_version=payload.semantic_version,
                    source_provenance={"kind": "inline", "actorUserId": str(actor_user_id)},
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_VERSION_CREATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="skill_version",
                    entity_id=version.id,
                    properties={"packageId": str(package.id), "versionNumber": version.version_number},
                    conn=conn,
                )
        return await self.get_version(
            workspace_id=workspace_id,
            package_id=package_id,
            version_id=version.id,
        )

    async def _create_package_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        slug: str,
        payload: SkillPackageCreateRequest,
        authored: InlineSkillVersion,
        source_kind: SkillSourceKind,
        source_descriptor: dict[str, object],
        source_provenance: dict[str, object],
    ) -> tuple[SkillPackageRecord, SkillVersionRecord]:
        async with self.tx() as conn:
            existing = await self._repository.get_package_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_matching_fingerprint(existing.request_fingerprint or "", fingerprint)
                version = await self._require_idempotent_version(package=existing, key=key, conn=conn)
                return existing, version
            package = await self._repository.create_package(
                values={
                    "workspace_id": workspace_id,
                    "stable_key": f"workspace:{workspace_id}:{slug}",
                    "scope": SkillPackageScope.WORKSPACE,
                    "source_kind": source_kind,
                    "slug": slug,
                    "normalized_slug": slug,
                    "display_name": payload.display_name,
                    "description": payload.description,
                    "publisher_id": f"workspace:{workspace_id}",
                    "publisher_name": "Workspace",
                    "trust_level": (
                        SkillTrustLevel.WORKSPACE_AUTHORED
                        if source_kind == SkillSourceKind.INLINE
                        else SkillTrustLevel.IMPORTED_UNVERIFIED
                    ),
                    "publisher_verification": {"verified": False, "source": "workspace"},
                    "status": SkillPackageStatus.ACTIVE,
                    "metadata_revision": 1,
                    "source_descriptor": source_descriptor,
                    "created_by_user_id": actor_user_id,
                    "updated_by_user_id": actor_user_id,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            version = await self._create_version(
                workspace_id=workspace_id,
                package=package,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                authored=authored,
                semantic_version=payload.semantic_version,
                source_provenance=source_provenance,
                conn=conn,
            )
            await self._write_activity(
                event_name=SKILL_PACKAGE_CREATED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="skill_package",
                entity_id=package.id,
                properties={"sourceKind": source_kind.value, "versionId": str(version.id)},
                conn=conn,
            )
            return package, version

    async def _create_version(
        self,
        *,
        workspace_id: UUID,
        package: SkillPackageRecord,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        authored: InlineSkillVersion,
        semantic_version: str | None,
        source_provenance: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord:
        version_number = await self._repository.next_version_number(package_id=package.id, conn=conn)
        manifest = authored.manifest
        version = await self._repository.create_version(
            values={
                "package_id": package.id,
                "workspace_id": workspace_id,
                "version_number": version_number,
                "semantic_version": semantic_version,
                "manifest_version": manifest.manifest_version,
                "manifest": manifest.model_dump(mode="json", by_alias=True),
                "package_checksum": manifest.checksum,
                "source_provenance": source_provenance,
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
        await self._repository.create_resources(
            values=tuple(
                {
                    "skill_version_id": version.id,
                    "workspace_id": workspace_id,
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
        return version

    async def _resolve_package_create_race(
        self,
        *,
        workspace_id: UUID,
        key: str,
        fingerprint: str,
        slug: str,
        error: IntegrityError,
    ) -> tuple[SkillPackageRecord, SkillVersionRecord]:
        existing = await self._repository.get_package_by_idempotency_key(
            workspace_id=workspace_id,
            idempotency_key=key,
        )
        if existing is not None:
            _require_matching_fingerprint(existing.request_fingerprint or "", fingerprint)
            async with self.tx() as conn:
                version = await self._require_idempotent_version(package=existing, key=key, conn=conn)
            return existing, version
        duplicate = await self._repository.get_package_by_slug(
            workspace_id=workspace_id,
            normalized_slug=slug,
        )
        if duplicate is not None:
            raise Conflict(t("errors", "SKILL_SLUG_EXISTS"), error="SKILL_SLUG_EXISTS")
        raise error

    async def _require_idempotent_version(
        self,
        *,
        package: SkillPackageRecord,
        key: str,
        conn: BaseDBAsyncClient,
    ) -> SkillVersionRecord:
        version = await self._repository.get_version_by_idempotency_key(
            package_id=package.id,
            idempotency_key=key,
            conn=conn,
        )
        if version is None:
            raise RuntimeError("Skill package idempotency record is missing its first version")
        return version

    async def _project_create_out(
        self,
        *,
        package: SkillPackageRecord,
        version: SkillVersionRecord,
    ) -> SkillPackageCreateOut:
        if package.workspace_id is None:
            raise RuntimeError("Workspace Skill package is missing workspace identity")
        resources = await self._repository.list_resources(
            workspace_id=package.workspace_id,
            version_id=version.id,
        )
        counts = await self._repository.package_version_counts(
            workspace_id=package.workspace_id,
            package_ids=(package.id,),
        )
        latest = await self._repository.get_latest_version(
            workspace_id=package.workspace_id,
            package_id=package.id,
        )
        return SkillPackageCreateOut(
            package=project_package_detail(
                package,
                version_count=counts.get(package.id, 0),
                latest_version=latest,
            ),
            version=project_version_detail(version, resources=resources),
        )

    async def _require_package(self, *, workspace_id: UUID, package_id: UUID) -> SkillPackageRecord:
        record = await self._repository.get_package(workspace_id=workspace_id, package_id=package_id)
        if record is None:
            _raise_not_found()
        return record

    async def _write_activity(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
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
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                properties=properties,
            ),
            conn=conn,
        )


def _build_authored(
    *,
    workspace_id: UUID,
    slug: str,
    display_name: str,
    description: str,
    payload: SkillPackageCreateRequest | SkillVersionCreateRequest,
) -> InlineSkillVersion:
    try:
        return build_inline_skill_version(
            workspace_id=workspace_id,
            slug=slug,
            display_name=display_name,
            description=description,
            payload=payload,
        )
    except (ValueError, TypeError) as exc:
        raise BadRequest(t("errors", "SKILL_RESOURCE_INVALID"), error="SKILL_RESOURCE_INVALID") from exc


def _fingerprint(value: dict[str, Any]) -> str:
    canonical = orjson.dumps(value, option=orjson.OPT_SORT_KEYS)
    return hashlib.sha256(canonical).hexdigest()


def _require_idempotency_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise BadRequest(t("errors", "SKILL_IDEMPOTENCY_INVALID"), error="SKILL_IDEMPOTENCY_INVALID")
    return normalized


def _require_matching_fingerprint(actual: str, expected: str) -> None:
    if actual != expected:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")


def _normalize_slug(value: str) -> str:
    try:
        return normalize_skill_slug(value)
    except ValueError as exc:
        raise BadRequest(t("errors", "SKILL_SLUG_INVALID"), error="SKILL_SLUG_INVALID") from exc


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")


def _raise_archived() -> NoReturn:
    raise Conflict(t("errors", "SKILL_PACKAGE_ARCHIVED"), error="SKILL_PACKAGE_ARCHIVED")
