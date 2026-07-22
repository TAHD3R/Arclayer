from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.projects.builder.composition_saga_schema import (
    BuilderCompositionSagaCreateRequest,
    BuilderCompositionSagaPhaseTransitionRequest,
)


def test_plan_first_request_preserves_the_ordered_typed_target_scope() -> None:
    reusable_section_id = uuid4()
    page_id = uuid4()
    agent_id = uuid4()

    request = BuilderCompositionSagaCreateRequest.model_validate({
        "baseRevisionId": str(uuid4()),
        "baseEtag": f"sha256:{'a' * 64}",
        "agentId": str(agent_id),
        "objective": "Plan the missing reusable header and home page, then compose them together.",
        "locale": "en-US",
        "candidateCount": 2,
        "targets": [
            {"kind": "global_section", "itemId": str(reusable_section_id)},
            {"kind": "page", "itemId": str(page_id)},
        ],
    })

    assert request.agent_id == agent_id
    assert request.agent_run_id is None
    assert tuple((target.kind, target.item_id) for target in request.targets) == (
        ("global_section", reusable_section_id),
        ("page", page_id),
    )


@pytest.mark.parametrize(
    "invalid_update",
    [
        {"agentId": None},
        {"agentRunId": str(uuid4())},
        {"targets": []},
        {
            "targets": [
                {"kind": "page", "itemId": "page-id"},
                {"kind": "page", "itemId": "page-id"},
            ]
        },
    ],
)
def test_plan_first_request_rejects_ambiguous_authority_and_invalid_scope(invalid_update: dict) -> None:
    payload = {
        "baseRevisionId": str(uuid4()),
        "baseEtag": f"sha256:{'b' * 64}",
        "agentId": str(uuid4()),
        "objective": "Plan before composition.",
        "targets": [{"kind": "page", "itemId": str(uuid4())}],
        **invalid_update,
    }

    with pytest.raises(ValidationError):
        BuilderCompositionSagaCreateRequest.model_validate(payload)


def test_phase_transition_binds_one_applied_child_to_its_exact_result_revision() -> None:
    change_set_id = uuid4()
    site_revision_id = uuid4()

    request = BuilderCompositionSagaPhaseTransitionRequest.model_validate({
        "expectedPhase": "planning",
        "appliedChangeSetId": str(change_set_id),
        "appliedSiteRevisionId": str(site_revision_id),
    })

    assert request.expected_phase == "planning"
    assert request.applied_change_set_id == change_set_id
    assert request.applied_site_revision_id == site_revision_id
