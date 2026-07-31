from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest


def _projection(*, state="payment_restricted"):
    from src.modules.commerce.access_state.schema import CommercialAccessProjection, CommercialAccessState

    access_state = CommercialAccessState(state)
    return CommercialAccessProjection(
        workspace_id=uuid4(),
        subscription_revision_id=uuid4(),
        provider="stripe",
        provider_period_id="period-4",
        state=access_state,
        recovery_deadline=(
            datetime(2026, 8, 5, tzinfo=UTC) if access_state == CommercialAccessState.PAYMENT_GRACE else None
        ),
        access_revision=4,
        source_event_id="invoice-final-4",
        effective_at=datetime(2026, 7, 31, tzinfo=UTC),
    )


def test_restricted_recovery_allows_preserved_commands_but_rejects_value_expansion() -> None:
    from src.core.exceptions import APIError
    from src.modules.commerce.dunning.restricted_recovery import RestrictedRecoveryService
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    service = RestrictedRecoveryService()

    decision = service.classify(
        projection=_projection(),
        effects={RestrictedRecoveryEffect.EXPORT_EXISTING},
    )

    assert decision.allowed is True
    assert decision.command_class == "preserved"

    with pytest.raises(APIError) as exc:
        service.classify(
            projection=_projection(),
            effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
        )

    assert exc.value.status_code == 402
    assert exc.value.error == "WORKSPACE_PAYMENT_RESTRICTED"
    assert exc.value.meta is not None
    assert exc.value.meta["commercialAccessState"] == "payment_restricted"


def test_restricted_recovery_rejects_mixed_command_as_a_whole() -> None:
    from src.core.exceptions import Conflict
    from src.modules.commerce.dunning.restricted_recovery import RestrictedRecoveryService
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    with pytest.raises(Conflict, match="WORKSPACE_PAYMENT_RESTRICTED_MIXED_COMMAND"):
        RestrictedRecoveryService().classify(
            projection=_projection(),
            effects={RestrictedRecoveryEffect.EXPORT_EXISTING, RestrictedRecoveryEffect.CONTENT_MUTATION},
        )


@pytest.mark.parametrize(
    ("effect", "command_class"),
    [
        ("complete_payment_recovery", "recovery"),
        ("revoke_api_key", "security"),
        ("workspace_lifecycle", "lifecycle"),
    ],
)
def test_restricted_recovery_allows_recovery_security_and_lifecycle_commands(
    effect: str,
    command_class: str,
) -> None:
    from src.modules.commerce.dunning.restricted_recovery import RestrictedRecoveryService
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    decision = RestrictedRecoveryService().classify(
        projection=_projection(),
        effects={RestrictedRecoveryEffect(effect)},
    )

    assert decision.allowed is True
    assert decision.command_class == command_class
    assert decision.permitted_recovery_action == "open_payment_recovery"


@pytest.mark.parametrize("state", ["normal", "payment_grace"])
def test_non_restricted_access_does_not_block_value_expansion(state: str) -> None:
    from src.modules.commerce.dunning.restricted_recovery import RestrictedRecoveryService
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    decision = RestrictedRecoveryService().classify(
        projection=_projection(state=state),
        effects={RestrictedRecoveryEffect.CONTENT_MUTATION},
    )

    assert decision.allowed is True
    assert decision.command_class == "value_expansion"
    assert decision.explanation_key is None


def test_restricted_recovery_requires_a_commercial_access_projection() -> None:
    from src.core.exceptions import ServiceUnavailable
    from src.modules.commerce.dunning.restricted_recovery import RestrictedRecoveryService
    from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect

    with pytest.raises(ServiceUnavailable, match="COMMERCIAL_ACCESS_STATE_UNAVAILABLE"):
        RestrictedRecoveryService().classify(
            projection=None,
            effects={RestrictedRecoveryEffect.EXPORT_EXISTING},
        )
