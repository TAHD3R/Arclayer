from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.projects._enums import ProjectAuthoringMode
from src.modules.projects.schema import ProjectCreateRequest


def test_project_create_requires_explicit_authoring_mode() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ProjectCreateRequest.model_validate({
            "workspaceId": "00000000-0000-0000-0000-000000000001",
            "name": "Explicit authority",
        })

    assert exc_info.value.errors()[0]["loc"] == ("authoringMode",)


@pytest.mark.parametrize("mode", tuple(ProjectAuthoringMode))
def test_project_create_accepts_each_canonical_authoring_mode(mode: ProjectAuthoringMode) -> None:
    payload = ProjectCreateRequest.model_validate({
        "workspaceId": "00000000-0000-0000-0000-000000000001",
        "authoringMode": mode.value,
        "name": "Explicit authority",
    })

    assert payload.authoring_mode == mode.value
