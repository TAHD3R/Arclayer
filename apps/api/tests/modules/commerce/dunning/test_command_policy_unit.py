from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest


def _projection(*, workspace_id: UUID, state: str = "payment_restricted"):
    from src.modules.commerce.access_state.schema import CommercialAccessProjection, CommercialAccessState

    return CommercialAccessProjection(
        workspace_id=workspace_id,
        subscription_revision_id=uuid4(),
        provider="stripe",
        provider_mode="test",
        provider_period_id="period-4",
        state=CommercialAccessState(state),
        recovery_deadline=None,
        access_revision=4,
        source_event_id="invoice-final-4",
        effective_at=datetime(2026, 7, 31, tzinfo=UTC),
    )


class _Reader:
    def __init__(self, projection) -> None:
        self.projection = projection
        self.workspace_ids: list[UUID] = []

    async def get_projection(self, *, workspace_id: UUID):
        self.workspace_ids.append(workspace_id)
        return self.projection


@pytest.mark.asyncio
async def test_policy_reads_once_and_rejects_restricted_value_expansion_before_dispatch() -> None:
    from src.core.exceptions import APIError
    from src.modules.commerce.dunning.command_policy import RestrictedRecoveryCommandPolicy
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    workspace_id = uuid4()
    reader = _Reader(_projection(workspace_id=workspace_id))

    with pytest.raises(APIError) as exc:
        await RestrictedRecoveryCommandPolicy(reader=reader).authorize(
            workspace_id=workspace_id,
            effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
        )

    assert reader.workspace_ids == [workspace_id]
    assert exc.value.status_code == 402
    assert exc.value.error == "WORKSPACE_PAYMENT_RESTRICTED"
    assert exc.value.meta == {
        "commercialAccessState": "payment_restricted",
        "explanationKey": "commerce:PAYMENT_RESTRICTED",
        "permittedRecoveryAction": "open_payment_recovery",
    }


@pytest.mark.asyncio
async def test_policy_allows_preserved_security_and_lifecycle_effects() -> None:
    from src.modules.commerce.dunning.command_policy import RestrictedRecoveryCommandPolicy
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    workspace_id = uuid4()
    reader = _Reader(_projection(workspace_id=workspace_id))
    policy = RestrictedRecoveryCommandPolicy(reader=reader)

    for effect in (
        RestrictedRecoveryEffect.DOWNLOAD_EXISTING,
        RestrictedRecoveryEffect.REVOKE_API_KEY,
        RestrictedRecoveryEffect.WORKSPACE_LIFECYCLE,
    ):
        decision = await policy.authorize(workspace_id=workspace_id, effects={effect})
        assert decision.allowed is True


@pytest.mark.asyncio
async def test_policy_rejects_mixed_effects_as_one_atomic_command() -> None:
    from src.core.exceptions import Conflict
    from src.modules.commerce.dunning.command_policy import RestrictedRecoveryCommandPolicy
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    workspace_id = uuid4()
    reader = _Reader(_projection(workspace_id=workspace_id))

    with pytest.raises(Conflict, match="WORKSPACE_PAYMENT_RESTRICTED_MIXED_COMMAND"):
        await RestrictedRecoveryCommandPolicy(reader=reader).authorize(
            workspace_id=workspace_id,
            effects={RestrictedRecoveryEffect.EXPORT_EXISTING, RestrictedRecoveryEffect.CONTENT_MUTATION},
        )


@pytest.mark.parametrize(
    ("actions", "expected"),
    [
        (("read_project_source",), {"read_existing"}),
        (("create_project", "update_site_settings"), {"content_mutation"}),
        (("refine_plan",), {"metered_external_effect"}),
    ],
)
def test_workspace_ai_action_effects_are_server_owned(
    actions: tuple[str, ...],
    expected: set[str],
) -> None:
    from src.modules.commerce.dunning.command_policy import workspace_ai_action_effects

    assert {effect.value for effect in workspace_ai_action_effects(actions=actions)} == expected


def test_workspace_ai_action_effects_reject_unknown_actions() -> None:
    from src.core.exceptions import Conflict
    from src.modules.commerce.dunning.command_policy import workspace_ai_action_effects

    with pytest.raises(Conflict, match="COMMERCIAL_COMMAND_EFFECT_UNCLASSIFIED"):
        workspace_ai_action_effects(actions=("unclassified_action",))


@pytest.mark.asyncio
async def test_workspace_ai_tool_guard_rejects_before_tool_dispatch() -> None:
    from src.core.exceptions import APIError
    from src.modules.ai.workspace_actions import (
        WorkspaceAIPlannerToolCall,
        _authorize_workspace_ai_tool_calls,
    )
    from src.modules.commerce.dunning.command_policy import RestrictedRecoveryCommandPolicy

    workspace_id = uuid4()
    reader = _Reader(_projection(workspace_id=workspace_id))

    with pytest.raises(APIError) as exc:
        await _authorize_workspace_ai_tool_calls(
            workspace_id=workspace_id,
            tool_calls=[WorkspaceAIPlannerToolCall(tool_name="create_project", arguments={})],
            policy=RestrictedRecoveryCommandPolicy(reader=reader),
        )

    assert exc.value.status_code == 402
    assert reader.workspace_ids == [workspace_id]


@pytest.mark.asyncio
async def test_job_authorizer_converts_the_restricted_402_to_a_terminal_error() -> None:
    from src.modules.commerce.dunning.command_policy import (
        CommercialAccessJobAuthorizer,
        RestrictedRecoveryCommandPolicy,
    )
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
    from src.modules.jobs.execution_errors import PermanentJobExecutionError

    workspace_id = uuid4()
    reader = _Reader(_projection(workspace_id=workspace_id))
    authorizer = CommercialAccessJobAuthorizer(policy=RestrictedRecoveryCommandPolicy(reader=reader))

    with pytest.raises(PermanentJobExecutionError) as exc:
        await authorizer.authorize(
            workspace_id=workspace_id,
            effects={RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT},
        )

    assert exc.value.code == "WORKSPACE_PAYMENT_RESTRICTED"
    assert exc.value.metadata == {
        "commercialAccessState": "payment_restricted",
        "explanationKey": "commerce:PAYMENT_RESTRICTED",
        "permittedRecoveryAction": "open_payment_recovery",
    }
