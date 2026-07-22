from __future__ import annotations

from typing import NoReturn

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.projects._enums import ProjectAuthoringMode, ProjectAuthoringState
from src.models.projects.project import ProjectRecord


def require_builder_authority(project: ProjectRecord, *, expected_revision: int | None = None) -> None:
    if expected_revision is not None and int(project.authoring_revision) != expected_revision:
        _raise_conflict("PROJECT_AUTHORING_REVISION_CONFLICT")
    if ProjectAuthoringState(project.authoring_state) is not ProjectAuthoringState.READY:
        _raise_conflict("PROJECT_AUTHORING_MODE_REQUIRED")
    if (
        project.authoring_mode is None
        or ProjectAuthoringMode(project.authoring_mode) is not ProjectAuthoringMode.BUILDER_MANAGED
    ):
        _raise_conflict("PROJECT_AUTHORING_MODE_MISMATCH")


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))
