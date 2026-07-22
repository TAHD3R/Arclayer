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
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.skills._enums import (
    SkillInstallationStatus,
    SkillPackageScope,
    SkillPackageStatus,
    SkillValidationStatus,
    SkillVersionStatus,
)
from src.models.skills.skill_installation import SkillInstallationRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.workspaces.skills.installation_policy import (
    require_declaration_acceptance_values,
    require_installable_version,
    require_tools_available,
)
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.official_catalog_service import (
    ResolvedOfficialSkillTarget,
    WorkspaceOfficialSkillCatalogService,
)
from src.modules.workspaces.skills.projection import project_installation, project_validation_result
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.schema import (
    SkillCursorPage,
    SkillInstallationCreateRequest,
    SkillInstallationOut,
    SkillInstallationUpdateRequest,
    SkillValidationCreateRequest,
    SkillValidationResultOut,
)
from src.modules.workspaces.skills.validation import validate_persisted_skill_version

ActivityWriter = Callable[..., Awaitable[object]]

SKILL_VERSION_VALIDATED = "workspace.skill.version.validated"
SKILL_INSTALLED = "workspace.skill.installed"
SKILL_INSTALLATION_UPDATED = "workspace.skill.installation.updated"


class WorkspaceSkillLifecycleService(BaseService):
    def __init__(
        self,
        *,
        packages: WorkspaceSkillsRepository,
        lifecycle: WorkspaceSkillLifecycleRepository,
        official_catalog: WorkspaceOfficialSkillCatalogService,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._packages = packages
        self._lifecycle = lifecycle
        self._official_catalog = official_catalog
        self._activity_writer = activity_writer

    async def create_validation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        package_id: UUID,
        version_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillValidationCreateRequest,
    ) -> SkillValidationResultOut:
        key = _normalized_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "packageId": str(package_id),
            "versionId": str(version_id),
            **payload.model_dump(mode="json"),
        })
        async with self.tx() as conn:
            package = await self._packages.get_package_for_update(
                workspace_id=workspace_id,
                package_id=package_id,
                conn=conn,
            )
            version = await self._packages.get_version_for_update(
                workspace_id=workspace_id,
                package_id=package_id,
                version_id=version_id,
                conn=conn,
            )
            if package is None or version is None:
                _raise_not_found()
            existing = await self._lifecycle.get_validation_by_idempotency_key(
                version_id=version.id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_fingerprint(existing.request_fingerprint, fingerprint)
                return project_validation_result(existing)
            if str(package.status) != SkillPackageStatus.ACTIVE.value:
                raise Conflict(t("errors", "SKILL_PACKAGE_ARCHIVED"), error="SKILL_PACKAGE_ARCHIVED")
            resources = await self._packages.list_resources(
                workspace_id=workspace_id,
                version_id=version.id,
                conn=conn,
            )
            outcome = validate_persisted_skill_version(
                version=version,
                resources=resources,
                policy_version=payload.policy_version,
            )
            record = await self._lifecycle.create_validation(
                values={
                    "skill_version_id": version.id,
                    "workspace_id": workspace_id,
                    "validator_policy_version": payload.policy_version,
                    "status": outcome.status,
                    "findings": [finding.model_dump(mode="json", by_alias=True) for finding in outcome.findings],
                    "finding_hash": outcome.finding_hash,
                    "actor_user_id": actor_user_id,
                    "correlation_id": correlation_id.get(None),
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            version.status = SkillVersionStatus(outcome.status.value)
            await self._lifecycle.save_version_status(version=version, conn=conn)
            latest_installable = await self._packages.get_latest_installable_version(
                workspace_id=workspace_id,
                package_id=package.id,
                conn=conn,
            )
            package.latest_valid_version_id = latest_installable.id if latest_installable is not None else None
            await self._packages.save_package(
                package=package,
                update_fields=("latest_valid_version_id",),
                conn=conn,
            )
            await self._write_activity(
                event_name=SKILL_VERSION_VALIDATED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="skill_validation",
                entity_id=record.id,
                properties={
                    "packageId": str(package_id),
                    "versionId": str(version.id),
                    "status": outcome.status.value,
                    "findingHash": outcome.finding_hash,
                },
                conn=conn,
            )
            return project_validation_result(record)

    async def list_validations(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        version_id: UUID,
    ) -> tuple[SkillValidationResultOut, ...]:
        version = await self._packages.get_version(
            workspace_id=workspace_id,
            package_id=package_id,
            version_id=version_id,
        )
        if version is None:
            _raise_not_found()
        records = await self._lifecycle.list_validations(
            workspace_id=workspace_id,
            version_id=version_id,
        )
        return tuple(project_validation_result(record) for record in records)

    async def list_installations(
        self,
        *,
        workspace_id: UUID,
        limit: int,
        cursor: UUID | None,
        status: str | None,
    ) -> SkillCursorPage[SkillInstallationOut]:
        records, next_cursor = await self._lifecycle.list_installations(
            workspace_id=workspace_id,
            limit=limit,
            cursor=cursor,
            status=status,
        )
        return SkillCursorPage[SkillInstallationOut](
            items=tuple(project_installation(record) for record in records),
            next_cursor=next_cursor,
        )

    async def get_installation(
        self,
        *,
        workspace_id: UUID,
        installation_id: UUID,
    ) -> SkillInstallationOut:
        record = await self._lifecycle.get_installation(
            workspace_id=workspace_id,
            installation_id=installation_id,
        )
        if record is None:
            _raise_not_found()
        return project_installation(record)

    async def create_installation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillInstallationCreateRequest,
    ) -> SkillInstallationOut:
        key = _normalized_key(idempotency_key)
        fingerprint = _fingerprint({"workspaceId": str(workspace_id), **payload.model_dump(mode="json")})
        package_scope = SkillPackageScope(payload.package_scope)
        official_target = (
            await self._official_catalog.resolve_installation_target(
                package_id=payload.package_id,
                version_id=payload.version_id,
            )
            if package_scope == SkillPackageScope.SYSTEM
            else None
        )
        try:
            record = await self._create_installation_transaction(
                workspace_id=workspace_id,
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                payload=payload,
                package_scope=package_scope,
                official_target=official_target,
            )
        except IntegrityError as exc:
            record = await self._resolve_installation_race(
                workspace_id=workspace_id,
                key=key,
                fingerprint=fingerprint,
                package_id=payload.package_id,
                package_scope=package_scope,
                error=exc,
            )
        return project_installation(record)

    async def update_installation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        payload: SkillInstallationUpdateRequest,
    ) -> SkillInstallationOut:
        current = await self._lifecycle.get_installation(
            workspace_id=workspace_id,
            installation_id=installation_id,
        )
        if current is None:
            _raise_not_found()
        if current.metadata_revision != payload.expected_revision:
            raise Conflict(t("errors", "SKILL_REVISION_CONFLICT"), error="SKILL_REVISION_CONFLICT")
        next_status = SkillInstallationStatus.ENABLED if payload.enabled else SkillInstallationStatus.DISABLED
        official_target = await self._resolve_official_reenable_target(
            installation=current,
            next_status=next_status,
        )
        async with self.tx() as conn:
            record = await self._lifecycle.get_installation_for_update(
                workspace_id=workspace_id,
                installation_id=installation_id,
                conn=conn,
            )
            if record is None:
                _raise_not_found()
            if record.metadata_revision != payload.expected_revision:
                raise Conflict(t("errors", "SKILL_REVISION_CONFLICT"), error="SKILL_REVISION_CONFLICT")
            if record.status != next_status:
                if next_status == SkillInstallationStatus.ENABLED:
                    await self._revalidate_installation(
                        workspace_id=workspace_id,
                        installation=record,
                        official_target=official_target,
                        conn=conn,
                    )
                record.status = next_status
                record.metadata_revision += 1
                record.updated_by_user_id = actor_user_id
                await self._lifecycle.save_installation(
                    installation=record,
                    update_fields=("status", "metadata_revision", "updated_by_user_id"),
                    conn=conn,
                )
                await self._write_activity(
                    event_name=SKILL_INSTALLATION_UPDATED,
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    entity_type="skill_installation",
                    entity_id=record.id,
                    properties={"status": next_status.value, "revision": record.metadata_revision},
                    conn=conn,
                )
            return project_installation(record)

    async def _resolve_official_reenable_target(
        self,
        *,
        installation: SkillInstallationRecord,
        next_status: SkillInstallationStatus,
    ) -> ResolvedOfficialSkillTarget | None:
        if (
            next_status != SkillInstallationStatus.ENABLED
            or installation.status == SkillInstallationStatus.ENABLED
            or SkillPackageScope(installation.package_scope) != SkillPackageScope.SYSTEM
        ):
            return None
        try:
            return await self._official_catalog.resolve_installation_target(
                package_id=installation.package_id,
                version_id=installation.version_id,
            )
        except NotFound as exc:
            raise Conflict(
                t("errors", "SKILL_VERSION_NOT_INSTALLABLE"),
                error="SKILL_VERSION_NOT_INSTALLABLE",
            ) from exc

    async def _revalidate_installation(
        self,
        *,
        workspace_id: UUID,
        installation: SkillInstallationRecord,
        official_target: ResolvedOfficialSkillTarget | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        scope = SkillPackageScope(installation.package_scope)
        if scope == SkillPackageScope.SYSTEM:
            if official_target is None:
                raise RuntimeError("Official Skill re-enable target was not resolved")
            checksum = official_target.package_checksum
            finding_hash = official_target.validation_finding_hash
            manifest = official_target.manifest
        else:
            checksum, finding_hash, manifest = await self._resolve_installed_workspace_target(
                workspace_id=workspace_id,
                installation=installation,
                conn=conn,
            )
        if checksum != installation.package_checksum or finding_hash != installation.validation_finding_hash:
            raise Conflict(
                t("errors", "SKILL_VERSION_NOT_INSTALLABLE"),
                error="SKILL_VERSION_NOT_INSTALLABLE",
            )
        require_declaration_acceptance_values(
            manifest=manifest,
            accepted_required_tools=tuple(installation.accepted_required_tools or []),
            accepted_permissions=tuple(installation.accepted_permissions or []),
            accepted_data_egress=tuple(installation.accepted_data_egress or []),
        )
        require_tools_available(manifest.required_tools)

    async def _resolve_installed_workspace_target(
        self,
        *,
        workspace_id: UUID,
        installation: SkillInstallationRecord,
        conn: BaseDBAsyncClient,
    ) -> tuple[str, str, SkillManifestV1]:
        package = await self._packages.get_package_for_update(
            workspace_id=workspace_id,
            package_id=installation.package_id,
            conn=conn,
        )
        version = await self._packages.get_version(
            workspace_id=workspace_id,
            package_id=installation.package_id,
            version_id=installation.version_id,
            conn=conn,
        )
        validation = await self._lifecycle.get_latest_validation(
            workspace_id=workspace_id,
            version_id=installation.version_id,
            conn=conn,
        )
        if (
            package is None
            or str(package.status) != "active"
            or version is None
            or validation is None
            or validation.finding_hash != installation.validation_finding_hash
            or str(validation.status) not in {SkillValidationStatus.VALID.value, SkillValidationStatus.WARNING.value}
        ):
            raise Conflict(
                t("errors", "SKILL_VERSION_NOT_INSTALLABLE"),
                error="SKILL_VERSION_NOT_INSTALLABLE",
            )
        require_installable_version(version_status=str(version.status))
        return (
            version.package_checksum,
            validation.finding_hash,
            SkillManifestV1.model_validate(version.manifest),
        )

    async def _create_installation_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        payload: SkillInstallationCreateRequest,
        package_scope: SkillPackageScope,
        official_target: ResolvedOfficialSkillTarget | None,
    ) -> SkillInstallationRecord:
        async with self.tx() as conn:
            existing = await self._lifecycle.get_installation_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_fingerprint(existing.request_fingerprint, fingerprint)
                return existing
            if package_scope == SkillPackageScope.SYSTEM:
                if official_target is None:
                    raise RuntimeError("Official Skill installation target was not resolved")
                package_id = official_target.package_id
                version_id = official_target.version_id
                package_checksum = official_target.package_checksum
                validation_finding_hash = official_target.validation_finding_hash
                manifest = official_target.manifest
            else:
                (
                    package_id,
                    version_id,
                    package_checksum,
                    validation_finding_hash,
                    manifest,
                ) = await self._resolve_workspace_target(
                    workspace_id=workspace_id,
                    payload=payload,
                    conn=conn,
                )
            if package_checksum != payload.expected_package_checksum:
                raise Conflict(t("errors", "SKILL_CHECKSUM_MISMATCH"), error="SKILL_CHECKSUM_MISMATCH")
            if validation_finding_hash != payload.validation_finding_hash:
                raise Conflict(t("errors", "SKILL_VERSION_NOT_INSTALLABLE"), error="SKILL_VERSION_NOT_INSTALLABLE")
            _require_declaration_acceptance(manifest=manifest, payload=payload)
            require_tools_available(manifest.required_tools)
            duplicate = await self._lifecycle.get_installation_by_package(
                workspace_id=workspace_id,
                package_scope=package_scope.value,
                package_id=package_id,
                conn=conn,
            )
            if duplicate is not None:
                raise Conflict(t("errors", "SKILL_ALREADY_INSTALLED"), error="SKILL_ALREADY_INSTALLED")
            record = await self._lifecycle.create_installation(
                values={
                    "workspace_id": workspace_id,
                    "package_scope": package_scope,
                    "package_id": package_id,
                    "version_id": version_id,
                    "package_checksum": package_checksum,
                    "status": SkillInstallationStatus.ENABLED,
                    "accepted_required_tools": sorted(payload.accepted_required_tools),
                    "accepted_permissions": sorted(payload.accepted_permissions),
                    "accepted_data_egress": sorted(payload.accepted_data_egress),
                    "validation_finding_hash": validation_finding_hash,
                    "metadata_revision": 1,
                    "installed_by_user_id": actor_user_id,
                    "updated_by_user_id": actor_user_id,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                },
                conn=conn,
            )
            await self._write_activity(
                event_name=SKILL_INSTALLED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="skill_installation",
                entity_id=record.id,
                properties={
                    "packageScope": package_scope.value,
                    "packageId": str(package_id),
                    "versionId": str(version_id),
                },
                conn=conn,
            )
            return record

    async def _resolve_workspace_target(
        self,
        *,
        workspace_id: UUID,
        payload: SkillInstallationCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> tuple[UUID, UUID, str, str, SkillManifestV1]:
        package = await self._packages.get_package_for_update(
            workspace_id=workspace_id,
            package_id=payload.package_id,
            conn=conn,
        )
        version = await self._packages.get_version(
            workspace_id=workspace_id,
            package_id=payload.package_id,
            version_id=payload.version_id,
            conn=conn,
        )
        if package is None or version is None:
            _raise_not_found()
        if str(package.status) != SkillPackageStatus.ACTIVE.value:
            raise Conflict(t("errors", "SKILL_PACKAGE_ARCHIVED"), error="SKILL_PACKAGE_ARCHIVED")
        require_installable_version(version_status=str(version.status))
        validation = await self._lifecycle.get_validation(
            workspace_id=workspace_id,
            version_id=version.id,
            finding_hash=payload.validation_finding_hash,
            conn=conn,
        )
        latest_validation = await self._lifecycle.get_latest_validation(
            workspace_id=workspace_id,
            version_id=version.id,
            conn=conn,
        )
        if (
            validation is None
            or str(validation.status) not in {SkillValidationStatus.VALID.value, SkillValidationStatus.WARNING.value}
            or latest_validation is None
            or latest_validation.id != validation.id
        ):
            raise Conflict(t("errors", "SKILL_VERSION_NOT_INSTALLABLE"), error="SKILL_VERSION_NOT_INSTALLABLE")
        return (
            package.id,
            version.id,
            version.package_checksum,
            validation.finding_hash,
            SkillManifestV1.model_validate(version.manifest),
        )

    async def _resolve_installation_race(
        self,
        *,
        workspace_id: UUID,
        key: str,
        fingerprint: str,
        package_id: UUID,
        package_scope: SkillPackageScope,
        error: IntegrityError,
    ) -> SkillInstallationRecord:
        existing = await self._lifecycle.get_installation_by_idempotency_key(
            workspace_id=workspace_id,
            idempotency_key=key,
        )
        if existing is not None:
            _require_fingerprint(existing.request_fingerprint, fingerprint)
            return existing
        duplicate = await self._lifecycle.get_installation_by_package(
            workspace_id=workspace_id,
            package_scope=package_scope.value,
            package_id=package_id,
        )
        if duplicate is not None:
            raise Conflict(t("errors", "SKILL_ALREADY_INSTALLED"), error="SKILL_ALREADY_INSTALLED")
        raise error

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


def _require_declaration_acceptance(
    *,
    manifest: SkillManifestV1,
    payload: SkillInstallationCreateRequest,
) -> None:
    require_declaration_acceptance_values(
        manifest=manifest,
        accepted_required_tools=payload.accepted_required_tools,
        accepted_permissions=payload.accepted_permissions,
        accepted_data_egress=payload.accepted_data_egress,
    )


def _normalized_key(value: str) -> str:
    normalized = value.strip()
    if not normalized or normalized != value:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")
    return normalized


def _fingerprint(value: dict[str, Any]) -> str:
    return hashlib.sha256(orjson.dumps(value, option=orjson.OPT_SORT_KEYS)).hexdigest()


def _require_fingerprint(actual: str, expected: str) -> None:
    if actual != expected:
        raise Conflict(t("errors", "SKILL_IDEMPOTENCY_CONFLICT"), error="SKILL_IDEMPOTENCY_CONFLICT")


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")
