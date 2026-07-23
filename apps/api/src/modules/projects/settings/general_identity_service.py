from __future__ import annotations

import hashlib
import json
from typing import Any, Literal
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.services import BaseService
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import WorkspaceIconMode
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.settings.general_identity_repository import ProjectGeneralIdentityRepository
from src.modules.projects.settings.general_identity_schema import (
    ProjectGeneralIdentity,
    ProjectGeneralIdentityDetail,
)

type ProjectGeneralIdentitySource = Literal["api", "agent"]

PROJECT_GENERAL_IDENTITY_UPDATED_EVENT = "project.general.identity.updated"
PROJECT_GENERAL_IDENTITY_ETAG_MISMATCH = "PROJECT_GENERAL_IDENTITY_ETAG_MISMATCH"
PROJECT_GENERAL_IDENTITY_INVALID = "PROJECT_GENERAL_IDENTITY_INVALID"

_IDENTITY_FIELDS = (
    "name",
    "description",
    "icon_mode",
    "icon_color",
    "icon_glyph",
    "icon_emoji",
    "icon_url",
)


def _active_icon_value(record: ProjectRecord, field: str) -> str | None:
    mode = WorkspaceIconMode(record.icon_mode)
    field_mode = {
        "icon_glyph": WorkspaceIconMode.GLYPH,
        "icon_emoji": WorkspaceIconMode.EMOJI,
        "icon_url": WorkspaceIconMode.IMAGE,
    }[field]
    if mode is not field_mode:
        return None
    value = getattr(record, field)
    return str(value) if value is not None else None


def _identity_from_record(record: ProjectRecord) -> ProjectGeneralIdentity:
    return ProjectGeneralIdentity(
        name=str(record.name),
        description=str(record.description) if record.description is not None else None,
        icon_mode=WorkspaceIconMode(record.icon_mode),
        icon_color=str(record.icon_color),
        icon_glyph=_active_icon_value(record, "icon_glyph"),
        icon_emoji=_active_icon_value(record, "icon_emoji"),
        icon_url=_active_icon_value(record, "icon_url"),
    )


def _identity_etag(value: ProjectGeneralIdentity) -> str:
    canonical = json.dumps(
        value.model_dump(mode="json", by_alias=True),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return f'"{hashlib.sha256(canonical).hexdigest()}"'


def _changed_fields(
    current: ProjectGeneralIdentity,
    replacement: ProjectGeneralIdentity,
) -> tuple[str, ...]:
    return tuple(field for field in _IDENTITY_FIELDS if getattr(current, field) != getattr(replacement, field))


def _replacement_values(
    replacement: ProjectGeneralIdentity,
    changed_fields: tuple[str, ...],
) -> dict[str, Any]:
    values = replacement.model_dump(mode="python")
    return {field: values[field] for field in changed_fields}


class ProjectGeneralIdentityService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: ProjectGeneralIdentityRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository or ProjectGeneralIdentityRepository()

    async def get_identity(self, *, project_id: UUID) -> ProjectGeneralIdentityDetail:
        project = await self.repository.get_identity(project_id=project_id)
        value = self._parse_identity(project)
        return ProjectGeneralIdentityDetail(value=value, etag=_identity_etag(value))

    async def replace_identity(
        self,
        *,
        project_id: UUID,
        replacement: ProjectGeneralIdentity,
        expected_etag: str,
        actor_user_id: UUID,
        source: ProjectGeneralIdentitySource = "api",
    ) -> ProjectGeneralIdentityDetail:
        async with self.tx() as conn:
            project = await self.repository.get_identity_for_update(project_id=project_id, conn=conn)
            current = self._parse_identity(project)
            current_etag = _identity_etag(current)
            self._require_matching_etag(expected_etag, current_etag)
            changed_fields = _changed_fields(current, replacement)
            if not changed_fields:
                return ProjectGeneralIdentityDetail(value=current, etag=current_etag)

            await self.repository.save_identity(
                project_id=project_id,
                values=_replacement_values(replacement, changed_fields),
                conn=conn,
            )
            replacement_etag = _identity_etag(replacement)
            await self._write_activity_event(
                project=project,
                actor_user_id=actor_user_id,
                source=source,
                changed_fields=changed_fields,
                previous_etag=current_etag,
                etag=replacement_etag,
                conn=conn,
            )
            return ProjectGeneralIdentityDetail(value=replacement, etag=replacement_etag)

    @staticmethod
    def _parse_identity(project: ProjectRecord) -> ProjectGeneralIdentity:
        try:
            return _identity_from_record(project)
        except (TypeError, ValueError) as exc:
            raise Conflict(
                "Stored project general identity is invalid",
                error=PROJECT_GENERAL_IDENTITY_INVALID,
            ) from exc

    @staticmethod
    def _require_matching_etag(expected_etag: str, current_etag: str) -> None:
        if expected_etag == current_etag:
            return
        raise Conflict(
            "Project general identity changed; reload before saving",
            error=PROJECT_GENERAL_IDENTITY_ETAG_MISMATCH,
            meta={"facade": "identity", "currentEtag": current_etag},
        )

    async def _write_activity_event(
        self,
        *,
        project: ProjectRecord,
        actor_user_id: UUID,
        source: ProjectGeneralIdentitySource,
        changed_fields: tuple[str, ...],
        previous_etag: str,
        etag: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        project_id = UUID(str(project.id))
        workspace_id = UUID(str(project.workspace_id))
        properties: JsonObject = {
            "project_id": str(project_id),
            "workspace_id": str(workspace_id),
            "facade": "identity",
            "paths": [f"project.{field}" for field in changed_fields],
            "previous_etag": previous_etag,
            "etag": etag,
        }
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=PROJECT_GENERAL_IDENTITY_UPDATED_EVENT,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                entity_type="project_general_identity",
                entity_id=project_id,
                source=source,
                properties=properties,
            ),
            conn=conn,
        )
