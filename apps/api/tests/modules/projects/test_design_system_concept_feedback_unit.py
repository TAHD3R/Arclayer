from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from src.core.exceptions import Conflict
from src.modules.projects.design_systems.concept_schema import (
    DesignSystemConceptGenerationFeedbackRequest,
)
from src.modules.projects.design_systems.concept_service import _project_feedback
from src.modules.projects.design_systems.router import router

pytestmark = pytest.mark.unit


def test_concept_feedback_route_exposes_the_write_contract() -> None:
    api_routes = [route for route in router.routes if isinstance(route, APIRoute)]
    routes = {(route.path, method): route for route in api_routes for method in route.methods}
    feedback = "/projects/{project_id}/design-system/{system_id}/concept-generations/{generation_id}/feedback"

    assert (feedback, "POST") in routes
    route = routes[(feedback, "POST")]
    assert route.endpoint.__name__ == "submit_project_design_system_concept_feedback"
    assert route.dependencies, "feedback must stay behind a project permission dependency"


def test_concept_feedback_request_rejects_blank_comments() -> None:
    with pytest.raises(ValidationError):
        DesignSystemConceptGenerationFeedbackRequest(concept_index=0, comment="   ")
    with pytest.raises(ValidationError):
        DesignSystemConceptGenerationFeedbackRequest(concept_index=-1, comment="Looks strong.")

    payload = DesignSystemConceptGenerationFeedbackRequest(
        concept_index=1,
        comment="  Keep the calm motion, drop the serif body.  ",
    )
    assert payload.concept_index == 1
    assert payload.comment.strip() == "Keep the calm motion, drop the serif body."


def test_project_feedback_projects_stored_entries_and_ignores_absent_history() -> None:
    actor_user_id = uuid4()
    stored = [
        {
            "comment": "First note",
            "actorUserId": str(actor_user_id),
            "createdAt": "2026-08-15T10:00:00+00:00",
        }
    ]

    projected = _project_feedback(stored)
    assert len(projected) == 1
    assert projected[0].comment == "First note"
    assert projected[0].actor_user_id == actor_user_id
    assert projected[0].created_at.year == 2026

    assert _project_feedback(None) == ()
    assert _project_feedback([]) == ()


def test_project_feedback_rejects_malformed_entries() -> None:
    with pytest.raises(Conflict):
        _project_feedback([{"comment": "Missing actor and timestamp"}])
