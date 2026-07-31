from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.common.utils.public_ids import decode_public_id
from src.config import get_settings
from src.core.exceptions import Conflict, Forbidden
from src.models.analytics.audit_event import AuditEvent
from src.models.system.access_restriction import (
    AccessRestrictionCommandRecord,
    AccessRestrictionEntityType,
    AccessRestrictionReasonCategory,
    AccessRestrictionRecord,
    AccessRestrictionState,
    AccessRestrictionType,
)
from src.modules.access_restrictions.repository import AccessRestrictionRepository
from src.modules.access_restrictions.schema import (
    AccessRestrictionEnforceRequest,
    AccessRestrictionLiftRequest,
)
from src.modules.access_restrictions.service import AccessRestrictionAuthority, AccessRestrictionService
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _enforce_request(expected_revision: int, note: str) -> AccessRestrictionEnforceRequest:
    return AccessRestrictionEnforceRequest(
        expected_revision=expected_revision,
        reason_category=AccessRestrictionReasonCategory.SECURITY_RISK,
        reason_code="security_risk",
        operator_note=note,
    )


@pytest.mark.usefixtures("db")
async def test_access_restriction_revision_idempotency_and_public_boundary() -> None:
    repository = AccessRestrictionRepository()
    service = AccessRestrictionService(get_settings(), repository=repository)
    authority = AccessRestrictionAuthority(repository)
    actor_user_id = uuid4()
    entity_id = uuid4()

    created = await service.enforce(
        entity_type=AccessRestrictionEntityType.PROJECT,
        entity_id=entity_id,
        restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
        actor_user_id=actor_user_id,
        idempotency_key="restriction-create",
        payload=_enforce_request(0, "Security investigation opened."),
    )
    replayed = await service.enforce(
        entity_type=AccessRestrictionEntityType.PROJECT,
        entity_id=entity_id,
        restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
        actor_user_id=actor_user_id,
        idempotency_key="restriction-create",
        payload=_enforce_request(0, "Security investigation opened."),
    )

    assert created.revision == 1
    assert created.state == AccessRestrictionState.ACTIVE
    assert replayed == created
    assert await AccessRestrictionCommandRecord.all().count() == 1

    with pytest.raises(Conflict) as idempotency_conflict:
        await service.enforce(
            entity_type=AccessRestrictionEntityType.PROJECT,
            entity_id=entity_id,
            restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
            actor_user_id=actor_user_id,
            idempotency_key="restriction-create",
            payload=_enforce_request(0, "Different request using the same key."),
        )
    assert idempotency_conflict.value.error == "ACCESS_RESTRICTION_IDEMPOTENCY_CONFLICT"

    with pytest.raises(Conflict) as revision_conflict:
        await service.enforce(
            entity_type=AccessRestrictionEntityType.PROJECT,
            entity_id=entity_id,
            restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
            actor_user_id=actor_user_id,
            idempotency_key="restriction-stale",
            payload=_enforce_request(0, "Stale revision must not overwrite state."),
        )
    assert revision_conflict.value.error == "ACCESS_RESTRICTION_REVISION_CONFLICT"
    assert revision_conflict.value.meta is not None
    assert revision_conflict.value.meta["currentRevision"] == 1

    lifted = await service.lift(
        entity_type=AccessRestrictionEntityType.PROJECT,
        entity_id=entity_id,
        restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
        actor_user_id=actor_user_id,
        idempotency_key="restriction-lift",
        payload=AccessRestrictionLiftRequest(
            expected_revision=1,
            operator_note="Security investigation completed.",
        ),
    )
    reenforced = await service.enforce(
        entity_type=AccessRestrictionEntityType.PROJECT,
        entity_id=entity_id,
        restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
        actor_user_id=actor_user_id,
        idempotency_key="restriction-reenforce",
        payload=_enforce_request(2, "A new security incident was confirmed."),
    )

    assert lifted.revision == 2
    assert lifted.state == AccessRestrictionState.LIFTED
    assert reenforced.revision == 3
    assert reenforced.state == AccessRestrictionState.ACTIVE
    assert await AccessRestrictionCommandRecord.all().count() == 3
    assert await AuditEvent.filter(event_name="access_restriction.enforced").count() == 2
    assert await AuditEvent.filter(event_name="access_restriction.lifted").count() == 1

    with pytest.raises(Forbidden) as denied:
        await authority.require_unrestricted(
            entity_type=AccessRestrictionEntityType.PROJECT,
            entity_id=entity_id,
            restriction_types=[AccessRestrictionType.PROJECT_SUSPENDED],
        )
    assert denied.value.error == "PROJECT_SUSPENDED"
    assert denied.value.meta is not None
    public_restriction = denied.value.meta["restriction"]
    assert public_restriction["revision"] == 3
    assert "operatorNote" not in public_restriction
    assert "actorUserId" not in public_restriction


async def test_workspace_and_project_routes_return_stable_restriction_403(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        client,
        workspace_id,
        project_id,
    ):
        workspace_uuid = decode_public_id(workspace_id)
        project_uuid = decode_public_id(project_id)
        effective_at = datetime.now(UTC)
        workspace_restriction = await AccessRestrictionRecord.create(
            entity_type=AccessRestrictionEntityType.WORKSPACE,
            entity_id=workspace_uuid,
            restriction_type=AccessRestrictionType.WORKSPACE_SUSPENDED,
            state=AccessRestrictionState.ACTIVE,
            reason_category=AccessRestrictionReasonCategory.SECURITY_RISK,
            reason_code="security_risk",
            operator_note="Workspace route restriction integration test.",
            effective_at=effective_at,
        )

        workspace_response = await client.get(f"/api/v1/workspaces/{workspace_id}")
        workspace_project_response = await client.get(f"/api/v1/projects/{project_id}")

        assert workspace_response.status_code == 403, workspace_response.text
        assert workspace_response.json()["error"] == "WORKSPACE_SUSPENDED"
        assert workspace_project_response.status_code == 403, workspace_project_response.text
        assert workspace_project_response.json()["error"] == "WORKSPACE_SUSPENDED"

        workspace_restriction.state = AccessRestrictionState.LIFTED
        workspace_restriction.lifted_at = datetime.now(UTC)
        workspace_restriction.lift_note = "Continue with the project restriction assertion."
        workspace_restriction.revision = 2
        await workspace_restriction.save(update_fields=["state", "lifted_at", "lift_note", "revision", "updated_at"])
        await AccessRestrictionRecord.create(
            entity_type=AccessRestrictionEntityType.PROJECT,
            entity_id=project_uuid,
            restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
            state=AccessRestrictionState.ACTIVE,
            reason_category=AccessRestrictionReasonCategory.POLICY_VIOLATION,
            reason_code="policy_violation",
            operator_note="Project route restriction integration test.",
            effective_at=datetime.now(UTC),
        )

        workspace_after_lift = await client.get(f"/api/v1/workspaces/{workspace_id}")
        project_response = await client.get(f"/api/v1/projects/{project_id}")

        assert workspace_after_lift.status_code == 200, workspace_after_lift.text
        assert project_response.status_code == 403, project_response.text
        assert project_response.json()["error"] == "PROJECT_SUSPENDED"
