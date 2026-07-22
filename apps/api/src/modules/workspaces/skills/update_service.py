from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.skills._enums import (
    SkillPackageScope,
    SkillUpdateRisk,
    SkillValidationStatus,
)
from src.models.skills.skill_installation import SkillInstallationRecord
from src.models.skills.skill_update import SkillUpdatePreviewRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.workspaces.skills.installation_policy import (
    require_declaration_acceptance_values,
    require_installable_version,
    require_tools_available,
)
from src.modules.workspaces.skills.lifecycle_repository import WorkspaceSkillLifecycleRepository
from src.modules.workspaces.skills.manifest import SkillManifestV1
from src.modules.workspaces.skills.official_catalog_service import WorkspaceOfficialSkillCatalogService
from src.modules.workspaces.skills.projection import (
    project_installation,
    project_resource,
    project_validation_result,
)
from src.modules.workspaces.skills.repository import WorkspaceSkillsRepository
from src.modules.workspaces.skills.update_repository import WorkspaceSkillUpdateRepository
from src.modules.workspaces.skills.update_review import (
    SkillUpdateComputation,
    SkillUpdateTarget,
    build_skill_update_preview,
)
from src.modules.workspaces.skills.update_schema import (
    SkillInstallationRepinOut,
    SkillInstallationRepinRequest,
    SkillUpdateDiffOut,
    SkillUpdatePreviewCreateRequest,
    SkillUpdatePreviewOut,
    SkillUpdateTargetOut,
)

SKILL_UPDATE_PREVIEWED = "workspace.skill.update.previewed"
SKILL_INSTALLATION_REPINNED = "workspace.skill.installation.repinned"
ActivityWriter = Callable[..., Awaitable[object]]


class WorkspaceSkillUpdateService(BaseService):
    def __init__(
        self,
        *,
        packages: WorkspaceSkillsRepository,
        lifecycle: WorkspaceSkillLifecycleRepository,
        updates: WorkspaceSkillUpdateRepository,
        official_catalog: WorkspaceOfficialSkillCatalogService,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._packages = packages
        self._lifecycle = lifecycle
        self._updates = updates
        self._official_catalog = official_catalog
        self._activity_writer = activity_writer

    async def create_preview(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillUpdatePreviewCreateRequest,
    ) -> SkillUpdatePreviewOut:
        key = _normalized_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "installationId": str(installation_id),
            **payload.model_dump(mode="json"),
        })
        try:
            return await self._create_preview_transaction(
                workspace_id=workspace_id,
                organization_id=organization_id,
                installation_id=installation_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                payload=payload,
            )
        except IntegrityError as exc:
            existing = await self._updates.get_by_preview_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
            )
            if existing is None:
                raise exc
            _require_fingerprint(existing.request_fingerprint, fingerprint)
            return _project_preview(existing)

    async def repin_installation(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: SkillInstallationRepinRequest,
    ) -> SkillInstallationRepinOut:
        key = _normalized_key(idempotency_key)
        fingerprint = _fingerprint({
            "workspaceId": str(workspace_id),
            "installationId": str(installation_id),
            **payload.model_dump(mode="json"),
        })
        try:
            return await self._repin_transaction(
                workspace_id=workspace_id,
                organization_id=organization_id,
                installation_id=installation_id,
                actor_user_id=actor_user_id,
                key=key,
                fingerprint=fingerprint,
                payload=payload,
            )
        except IntegrityError as exc:
            existing = await self._updates.get_by_acceptance_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
            )
            if existing is None:
                raise exc
            return _project_repin_replay(existing, fingerprint=fingerprint)

    async def _create_preview_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        payload: SkillUpdatePreviewCreateRequest,
    ) -> SkillUpdatePreviewOut:
        async with self.tx() as conn:
            existing = await self._updates.get_by_preview_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if existing is not None:
                _require_fingerprint(existing.request_fingerprint, fingerprint)
                return _project_preview(existing)
            installation = await self._require_installation_for_update(
                workspace_id=workspace_id,
                installation_id=installation_id,
                conn=conn,
            )
            _require_current_preview_evidence(installation=installation, payload=payload)
            if payload.candidate_version_id == installation.version_id:
                _raise_preview_required()
            current = await self._resolve_target(
                workspace_id=workspace_id,
                installation=installation,
                version_id=installation.version_id,
                validation_finding_hash=installation.validation_finding_hash,
                require_latest_validation=False,
                conn=conn,
            )
            candidate = await self._resolve_target(
                workspace_id=workspace_id,
                installation=installation,
                version_id=payload.candidate_version_id,
                validation_finding_hash=None,
                require_latest_validation=True,
                conn=conn,
            )
            computation = build_skill_update_preview(
                installation_id=installation.id,
                expected_revision=installation.metadata_revision,
                current=current,
                candidate=candidate,
            )
            record = await self._updates.create_preview(
                values=_preview_values(
                    workspace_id=workspace_id,
                    installation=installation,
                    actor_user_id=actor_user_id,
                    key=key,
                    fingerprint=fingerprint,
                    current=current,
                    candidate=candidate,
                    computation=computation,
                ),
                conn=conn,
            )
            await self._write_activity(
                event_name=SKILL_UPDATE_PREVIEWED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                installation_id=installation.id,
                properties={
                    "previewId": str(record.id),
                    "currentVersionId": str(current.version_id),
                    "candidateVersionId": str(candidate.version_id),
                    "risk": str(computation.risk),
                },
                conn=conn,
            )
            return _project_preview(record)

    async def _repin_transaction(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        installation_id: UUID,
        actor_user_id: UUID,
        key: str,
        fingerprint: str,
        payload: SkillInstallationRepinRequest,
    ) -> SkillInstallationRepinOut:
        async with self.tx() as conn:
            replay = await self._updates.get_by_acceptance_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                return _project_repin_replay(replay, fingerprint=fingerprint)
            installation = await self._require_installation_for_update(
                workspace_id=workspace_id,
                installation_id=installation_id,
                conn=conn,
            )
            preview = await self._updates.get_for_update(
                workspace_id=workspace_id,
                preview_id=payload.preview_id,
                installation_id=installation_id,
                conn=conn,
            )
            if preview is None or preview.accepted_at is not None:
                _raise_preview_required()
            _require_current_repin_evidence(installation=installation, payload=payload)
            _require_preview_candidate_evidence(preview=preview, payload=payload)
            current = await self._resolve_target(
                workspace_id=workspace_id,
                installation=installation,
                version_id=installation.version_id,
                validation_finding_hash=installation.validation_finding_hash,
                require_latest_validation=False,
                conn=conn,
            )
            candidate = await self._resolve_target(
                workspace_id=workspace_id,
                installation=installation,
                version_id=payload.candidate_version_id,
                validation_finding_hash=payload.candidate_validation_finding_hash,
                require_latest_validation=True,
                conn=conn,
            )
            computation = build_skill_update_preview(
                installation_id=installation.id,
                expected_revision=installation.metadata_revision,
                current=current,
                candidate=candidate,
            )
            _require_preview_hashes(preview=preview, payload=payload, computation=computation)
            require_declaration_acceptance_values(
                manifest=candidate.manifest,
                accepted_required_tools=payload.accepted_required_tools,
                accepted_permissions=payload.accepted_permissions,
                accepted_data_egress=payload.accepted_data_egress,
            )
            require_tools_available(candidate.manifest.required_tools)
            _apply_candidate_pin(
                installation=installation,
                candidate=candidate,
                actor_user_id=actor_user_id,
                payload=payload,
            )
            await self._lifecycle.save_installation(
                installation=installation,
                update_fields=(
                    "version_id",
                    "package_checksum",
                    "validation_finding_hash",
                    "accepted_required_tools",
                    "accepted_permissions",
                    "accepted_data_egress",
                    "available_update_version_id",
                    "update_risk",
                    "update_risk_summary",
                    "metadata_revision",
                    "updated_by_user_id",
                ),
                conn=conn,
            )
            result = SkillInstallationRepinOut(
                preview_id=preview.id,
                installation=project_installation(installation),
            )
            _apply_acceptance_result(
                preview=preview,
                key=key,
                fingerprint=fingerprint,
                actor_user_id=actor_user_id,
                result=result,
            )
            await self._updates.save(
                preview=preview,
                update_fields=(
                    "acceptance_idempotency_key",
                    "acceptance_fingerprint",
                    "accepted_by_user_id",
                    "accepted_at",
                    "resulting_installation_revision",
                    "resulting_version_id",
                    "result_snapshot",
                ),
                conn=conn,
            )
            await self._write_activity(
                event_name=SKILL_INSTALLATION_REPINNED,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                installation_id=installation.id,
                properties={
                    "previewId": str(preview.id),
                    "fromVersionId": str(current.version_id),
                    "toVersionId": str(candidate.version_id),
                    "revision": installation.metadata_revision,
                    "risk": str(computation.risk),
                },
                conn=conn,
            )
            return result

    async def _require_installation_for_update(
        self,
        *,
        workspace_id: UUID,
        installation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> SkillInstallationRecord:
        installation = await self._lifecycle.get_installation_for_update(
            workspace_id=workspace_id,
            installation_id=installation_id,
            conn=conn,
        )
        if installation is None:
            _raise_not_found()
        return installation

    async def _resolve_target(
        self,
        *,
        workspace_id: UUID,
        installation: SkillInstallationRecord,
        version_id: UUID,
        validation_finding_hash: str | None,
        require_latest_validation: bool,
        conn: BaseDBAsyncClient,
    ) -> SkillUpdateTarget:
        scope = SkillPackageScope(installation.package_scope)
        if scope == SkillPackageScope.SYSTEM:
            target = await self._official_catalog.resolve_update_target(
                package_id=installation.package_id,
                version_id=version_id,
            )
            if validation_finding_hash is not None and target.validation_finding_hash != validation_finding_hash:
                _raise_preview_required()
            return target
        version = await self._packages.get_version(
            workspace_id=workspace_id,
            package_id=installation.package_id,
            version_id=version_id,
            conn=conn,
        )
        if version is None:
            _raise_not_found()
        validation = (
            await self._lifecycle.get_latest_validation(
                workspace_id=workspace_id,
                version_id=version.id,
                conn=conn,
            )
            if require_latest_validation
            else await self._lifecycle.get_validation(
                workspace_id=workspace_id,
                version_id=version.id,
                finding_hash=validation_finding_hash or "",
                conn=conn,
            )
        )
        if validation is None:
            raise Conflict(t("errors", "SKILL_VERSION_NOT_INSTALLABLE"), error="SKILL_VERSION_NOT_INSTALLABLE")
        require_installable_version(version_status=str(version.status))
        if str(validation.status) not in {
            SkillValidationStatus.VALID.value,
            SkillValidationStatus.WARNING.value,
        }:
            raise Conflict(t("errors", "SKILL_VERSION_NOT_INSTALLABLE"), error="SKILL_VERSION_NOT_INSTALLABLE")
        if validation_finding_hash is not None and validation.finding_hash != validation_finding_hash:
            _raise_preview_required()
        resources = await self._packages.list_resources(
            workspace_id=workspace_id,
            version_id=version.id,
            conn=conn,
        )
        return SkillUpdateTarget(
            package_scope=scope,
            package_id=installation.package_id,
            version_id=version.id,
            version_number=version.version_number,
            semantic_version=version.semantic_version,
            package_checksum=version.package_checksum,
            manifest=SkillManifestV1.model_validate(version.manifest),
            resources=tuple(project_resource(resource) for resource in resources),
            validation_policy_version=validation.validator_policy_version,
            validation_status=str(validation.status),
            validation_finding_hash=validation.finding_hash,
            validation_findings=project_validation_result(validation).findings,
            source_provenance=version.source_provenance or {},
        )

    async def _write_activity(
        self,
        *,
        event_name: str,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        installation_id: UUID,
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
                entity_type="skill_installation",
                entity_id=installation_id,
                properties=properties,
            ),
            conn=conn,
        )


def _preview_values(
    *,
    workspace_id: UUID,
    installation: SkillInstallationRecord,
    actor_user_id: UUID,
    key: str,
    fingerprint: str,
    current: SkillUpdateTarget,
    candidate: SkillUpdateTarget,
    computation: SkillUpdateComputation,
) -> dict[str, object]:
    return {
        "workspace_id": workspace_id,
        "installation_id": installation.id,
        "expected_installation_revision": installation.metadata_revision,
        "current_version_id": current.version_id,
        "current_package_checksum": current.package_checksum,
        "current_validation_finding_hash": current.validation_finding_hash,
        "candidate_version_id": candidate.version_id,
        "candidate_package_checksum": candidate.package_checksum,
        "candidate_validation_finding_hash": candidate.validation_finding_hash,
        "current_target": _target_out(current).model_dump(mode="json"),
        "candidate_target": _target_out(candidate).model_dump(mode="json"),
        "risk": computation.risk,
        "risk_categories": [str(item) for item in computation.risk_categories],
        "diff": computation.diff.model_dump(mode="json"),
        "preview_hash": computation.preview_hash,
        "created_by_user_id": actor_user_id,
        "request_idempotency_key": key,
        "request_fingerprint": fingerprint,
    }


def _project_preview(record: SkillUpdatePreviewRecord) -> SkillUpdatePreviewOut:
    return SkillUpdatePreviewOut(
        id=record.id,
        installation_id=record.installation_id,
        expected_revision=record.expected_installation_revision,
        current=SkillUpdateTargetOut.model_validate(record.current_target),
        candidate=SkillUpdateTargetOut.model_validate(record.candidate_target),
        risk=SkillUpdateRisk(record.risk),
        risk_categories=tuple(SkillUpdateRisk(item) for item in (record.risk_categories or [])),
        diff=SkillUpdateDiffOut.model_validate(record.diff),
        preview_hash=record.preview_hash,
        created_by_user_id=record.created_by_user_id,
        created_at=record.created_at,
    )


def _target_out(target: SkillUpdateTarget) -> SkillUpdateTargetOut:
    return SkillUpdateTargetOut(
        version_id=target.version_id,
        version_number=target.version_number,
        semantic_version=target.semantic_version,
        package_checksum=target.package_checksum,
        validation_policy_version=target.validation_policy_version,
        validation_status=target.validation_status,
        validation_finding_hash=target.validation_finding_hash,
    )


def _require_current_preview_evidence(
    *,
    installation: SkillInstallationRecord,
    payload: SkillUpdatePreviewCreateRequest,
) -> None:
    if installation.metadata_revision != payload.expected_revision:
        _raise_revision_conflict()
    if (
        installation.version_id != payload.current_version_id
        or installation.package_checksum != payload.current_package_checksum
        or installation.validation_finding_hash != payload.current_validation_finding_hash
    ):
        _raise_preview_required()


def _require_current_repin_evidence(
    *,
    installation: SkillInstallationRecord,
    payload: SkillInstallationRepinRequest,
) -> None:
    if installation.metadata_revision != payload.expected_revision:
        _raise_revision_conflict()
    if (
        installation.version_id != payload.current_version_id
        or installation.package_checksum != payload.current_package_checksum
        or installation.validation_finding_hash != payload.current_validation_finding_hash
    ):
        _raise_preview_required()


def _require_preview_candidate_evidence(
    *,
    preview: SkillUpdatePreviewRecord,
    payload: SkillInstallationRepinRequest,
) -> None:
    if (
        preview.expected_installation_revision != payload.expected_revision
        or preview.current_version_id != payload.current_version_id
        or preview.current_package_checksum != payload.current_package_checksum
        or preview.current_validation_finding_hash != payload.current_validation_finding_hash
        or preview.candidate_version_id != payload.candidate_version_id
        or preview.candidate_package_checksum != payload.candidate_package_checksum
        or preview.candidate_validation_finding_hash != payload.candidate_validation_finding_hash
    ):
        _raise_preview_required()


def _require_preview_hashes(
    *,
    preview: SkillUpdatePreviewRecord,
    payload: SkillInstallationRepinRequest,
    computation: SkillUpdateComputation,
) -> None:
    if (
        preview.preview_hash != payload.preview_hash
        or preview.preview_hash != computation.preview_hash
        or preview.diff != computation.diff.model_dump(mode="json")
    ):
        _raise_preview_required()


def _apply_candidate_pin(
    *,
    installation: SkillInstallationRecord,
    candidate: SkillUpdateTarget,
    actor_user_id: UUID,
    payload: SkillInstallationRepinRequest,
) -> None:
    installation.version_id = candidate.version_id
    installation.package_checksum = candidate.package_checksum
    installation.validation_finding_hash = candidate.validation_finding_hash
    installation.accepted_required_tools = sorted(payload.accepted_required_tools)
    installation.accepted_permissions = sorted(payload.accepted_permissions)
    installation.accepted_data_egress = sorted(payload.accepted_data_egress)
    installation.available_update_version_id = None
    installation.update_risk = SkillUpdateRisk.NONE
    installation.update_risk_summary = {}
    installation.metadata_revision += 1
    installation.updated_by_user_id = actor_user_id


def _apply_acceptance_result(
    *,
    preview: SkillUpdatePreviewRecord,
    key: str,
    fingerprint: str,
    actor_user_id: UUID,
    result: SkillInstallationRepinOut,
) -> None:
    preview.acceptance_idempotency_key = key
    preview.acceptance_fingerprint = fingerprint
    preview.accepted_by_user_id = actor_user_id
    preview.accepted_at = datetime.now(UTC)
    preview.resulting_installation_revision = result.installation.metadata_revision
    preview.resulting_version_id = result.installation.version_id
    preview.result_snapshot = result.model_dump(mode="json")


def _project_repin_replay(
    preview: SkillUpdatePreviewRecord,
    *,
    fingerprint: str,
) -> SkillInstallationRepinOut:
    _require_fingerprint(preview.acceptance_fingerprint or "", fingerprint)
    if preview.result_snapshot is None:
        raise RuntimeError("Accepted Skill update preview is missing its result snapshot")
    return SkillInstallationRepinOut.model_validate(preview.result_snapshot)


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


def _raise_revision_conflict() -> NoReturn:
    raise Conflict(t("errors", "SKILL_REVISION_CONFLICT"), error="SKILL_REVISION_CONFLICT")


def _raise_preview_required() -> NoReturn:
    raise Conflict(t("errors", "SKILL_UPDATE_PREVIEW_REQUIRED"), error="SKILL_UPDATE_PREVIEW_REQUIRED")


def _raise_not_found() -> NoReturn:
    raise NotFound(t("errors", "SKILL_NOT_FOUND"), error="SKILL_NOT_FOUND")
