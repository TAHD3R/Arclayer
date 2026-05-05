from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from pydantic import ValidationError

from src.modules.analytics.audit import (
    ActivityAuditPayload,
    activity_properties_from_payload,
    write_required_activity_event,
)


def test_activity_audit_payload_is_frozen_and_json_serializable() -> None:
    org_id = uuid4()
    workspace_id = uuid4()
    actor_user_id = uuid4()
    entity_id = uuid4()
    occurred_at = datetime.now(UTC)

    payload = ActivityAuditPayload(
        event_name="workspace.member.roles.updated",
        actor_user_id=actor_user_id,
        organization_id=org_id,
        workspace_id=workspace_id,
        entity_type="workspace_membership",
        entity_id=entity_id,
        occurred_at=occurred_at,
        properties={"role_codes_after": ["admin"]},
    )

    dumped = payload.model_dump(mode="json")
    assert dumped["event_name"] == "workspace.member.roles.updated"
    assert dumped["actor_user_id"] == str(actor_user_id)
    assert dumped["organization_id"] == str(org_id)
    assert dumped["workspace_id"] == str(workspace_id)
    assert dumped["entity_id"] == str(entity_id)
    assert dumped["properties"] == {"role_codes_after": ["admin"]}

    try:
        payload.event_name = "workspace.member.status.updated"
    except ValidationError:
        pass
    else:
        raise AssertionError("ActivityAuditPayload must be frozen")


def test_activity_audit_payload_rejects_blank_event_name() -> None:
    try:
        ActivityAuditPayload(event_name="")
    except ValidationError as exc:
        assert "event_name" in str(exc)
    else:
        raise AssertionError("blank event name should fail validation")


def test_activity_properties_from_payload_removes_envelope_fields() -> None:
    payload = {
        "organization_id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "subject_user_id": str(uuid4()),
        "entity_type": "workspace_membership",
        "entity_id": str(uuid4()),
        "changed_fields": ["email"],
        "password": "should be sanitized at persistence boundary",
    }

    properties = activity_properties_from_payload(payload)

    assert "organization_id" not in properties
    assert "workspace_id" not in properties
    assert "subject_user_id" not in properties
    assert "entity_type" not in properties
    assert "entity_id" not in properties
    assert properties["changed_fields"] == ["email"]
    assert properties["password"] == "should be sanitized at persistence boundary"


async def test_write_required_activity_event_persists_sanitized_row(db_schema) -> None:
    from src.config import get_settings
    from src.models.analytics.audit_event import AuditEvent

    org_id = uuid4()
    workspace_id = uuid4()
    actor_user_id = uuid4()
    subject_user_id = uuid4()
    entity_id = uuid4()

    row = await write_required_activity_event(
        settings=get_settings(),
        payload=ActivityAuditPayload(
            event_name="workspace.member.password.reset",
            actor_user_id=actor_user_id,
            organization_id=org_id,
            workspace_id=workspace_id,
            subject_user_id=subject_user_id,
            entity_type="workspace_membership",
            entity_id=entity_id,
            properties={
                "membership_id": str(entity_id),
                "password": "raw-password",
                "token": "raw-token",
                "safe": "ok",
            },
        ),
    )

    persisted = await AuditEvent.get(id=row.id)
    assert persisted.event_name == "workspace.member.password.reset"
    assert persisted.organization_id == org_id
    assert persisted.workspace_id == workspace_id
    assert persisted.actor_user_id == actor_user_id
    assert persisted.subject_user_id == subject_user_id
    assert persisted.entity_type == "workspace_membership"
    assert persisted.entity_id == entity_id
    assert isinstance(persisted.properties, dict)
    assert persisted.properties["safe"] == "ok"
    assert "password" not in persisted.properties
    assert "token" not in persisted.properties


async def test_write_required_activity_event_rolls_back_with_transaction(db_schema) -> None:
    from tortoise.transactions import in_transaction

    from src.config import get_settings
    from src.models.analytics.audit_event import AuditEvent

    entity_id = uuid4()

    try:
        async with in_transaction() as conn:
            await write_required_activity_event(
                settings=get_settings(),
                payload=ActivityAuditPayload(
                    event_name="asset.uploaded",
                    actor_user_id=uuid4(),
                    entity_type="asset",
                    entity_id=entity_id,
                    source="core",
                    properties={"safe": "ok"},
                ),
                conn=conn,
            )
            raise RuntimeError("force rollback")
    except RuntimeError as exc:
        assert str(exc) == "force rollback"

    assert not await AuditEvent.filter(event_name="asset.uploaded", entity_id=entity_id).exists()
