from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.feedback.feedback import FeedbackMessageKind
from src.models.organization.user import User
from src.models.system.notification_campaign import NotificationDeliveryState
from src.modules.feedback import service as feedback_service_module
from src.modules.feedback.schema import FeedbackMessageCreate
from src.modules.feedback.service import FeedbackService
from src.modules.system.admin.notifications.catalog import (
    NotificationRecordCreateDisposition,
    NotificationRecordCreateResult,
)
from src.modules.system.admin.notifications.schema import NotificationFeedbackTicketTarget


def _settings() -> Settings:
    return cast(Settings, SimpleNamespace())


def _author() -> User:
    return cast(
        User,
        SimpleNamespace(
            id=uuid4(),
            email="operator@example.test",
            username="operator",
            display_name="Platform operator",
            avatar_url=None,
        ),
    )


def _payload(*, body: str = "We have reproduced the issue.", revision: int = 1) -> FeedbackMessageCreate:
    return FeedbackMessageCreate(
        client_request_id="019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
        expected_revision=revision,
        kind=FeedbackMessageKind.REPLY,
        body=body,
    )


def _transaction() -> tuple[MagicMock, MagicMock]:
    connection = MagicMock()
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock(return_value=connection)
    transaction.__aexit__ = AsyncMock(return_value=None)
    return transaction, connection


def _ticket_query(ticket: object) -> MagicMock:
    query = MagicMock()
    query.using_db.return_value = query
    query.select_for_update.return_value = query
    query.first = AsyncMock(return_value=ticket)
    return query


def _message_query(message: object | None) -> MagicMock:
    query = MagicMock()
    query.using_db.return_value = query
    query.first = AsyncMock(return_value=message)
    return query


def _reply_dispatch_models() -> tuple[SimpleNamespace, SimpleNamespace, SimpleNamespace]:
    ticket = SimpleNamespace(
        id=uuid4(),
        workspace_id=uuid4(),
        reporter_user_id=uuid4(),
    )
    message = SimpleNamespace(id=uuid4(), body="We have reproduced the issue.")
    delivery = SimpleNamespace(
        id=uuid4(),
        idempotency_key=f"feedback-reply:{uuid4()}",
        state=NotificationDeliveryState.PENDING,
        attempt_count=0,
        failure_code=None,
        failure_message=None,
        is_retryable=False,
        notification_id=None,
        sent_at=None,
        delivered_at=None,
        save=AsyncMock(),
    )
    return ticket, message, delivery


def _notification_query(notification: object | None) -> MagicMock:
    query = MagicMock()
    query.first = AsyncMock(return_value=notification)
    return query


@pytest.mark.asyncio
async def test_feedback_message_retry_returns_existing_message_without_mutating_ticket() -> None:
    service = FeedbackService(_settings())
    ticket = SimpleNamespace(id=uuid4(), revision=2)
    existing = SimpleNamespace(request_fingerprint="")
    transaction, _ = _transaction()
    detail = object()
    payload = _payload()
    existing.request_fingerprint = service_module_fingerprint(payload)

    with (
        patch.object(service, "tx", return_value=transaction),
        patch("src.modules.feedback.service.FeedbackTicket.filter", return_value=_ticket_query(ticket)),
        patch("src.modules.feedback.service.FeedbackMessage.filter", return_value=_message_query(existing)),
        patch.object(service, "get_detail", new=AsyncMock(return_value=detail)),
    ):
        result = await service.add_message(ticket_id=ticket.id, payload=payload, author=_author())

    assert result is detail
    assert ticket.revision == 2


@pytest.mark.asyncio
async def test_feedback_message_rejects_revision_conflict_before_creating_source_message() -> None:
    service = FeedbackService(_settings())
    ticket = SimpleNamespace(id=uuid4(), revision=2)
    transaction, _ = _transaction()

    with (
        patch.object(service, "tx", return_value=transaction),
        patch("src.modules.feedback.service.FeedbackTicket.filter", return_value=_ticket_query(ticket)),
        patch("src.modules.feedback.service.FeedbackMessage.filter", return_value=_message_query(None)),
        patch("src.modules.feedback.service.FeedbackMessage.create", new=AsyncMock()) as create,
        pytest.raises(Conflict) as exc_info,
    ):
        await service.add_message(ticket_id=ticket.id, payload=_payload(revision=1), author=_author())

    assert exc_info.value.error == "FEEDBACK_REVISION_CONFLICT"
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_feedback_message_reused_id_with_different_body_is_rejected() -> None:
    service = FeedbackService(_settings())
    ticket = SimpleNamespace(id=uuid4(), revision=2)
    existing = SimpleNamespace(request_fingerprint="different")
    transaction, _ = _transaction()

    with (
        patch.object(service, "tx", return_value=transaction),
        patch("src.modules.feedback.service.FeedbackTicket.filter", return_value=_ticket_query(ticket)),
        patch("src.modules.feedback.service.FeedbackMessage.filter", return_value=_message_query(existing)),
        pytest.raises(Conflict) as exc_info,
    ):
        await service.add_message(ticket_id=ticket.id, payload=_payload(), author=_author())

    assert exc_info.value.error == "FEEDBACK_MESSAGE_IDEMPOTENCY_CONFLICT"


def service_module_fingerprint(payload: FeedbackMessageCreate) -> str:
    from hashlib import sha256

    import orjson

    return sha256(
        orjson.dumps({"kind": str(payload.kind), "body": payload.body}, option=orjson.OPT_SORT_KEYS)
    ).hexdigest()


@pytest.mark.asyncio
async def test_feedback_reply_dispatch_uses_a_typed_feedback_ticket_target() -> None:
    service = FeedbackService(_settings())
    ticket, message, delivery = _reply_dispatch_models()
    notification_id = uuid4()
    create = AsyncMock(
        return_value=NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.CREATED,
            record=SimpleNamespace(id=notification_id),
        )
    )

    with (
        patch.object(feedback_service_module.NotificationDeliveryRecord, "get", new=AsyncMock(return_value=delivery)),
        patch.object(feedback_service_module.FeedbackMessage, "get", new=AsyncMock(return_value=message)),
        patch.object(feedback_service_module.FeedbackTicket, "get", new=AsyncMock(return_value=ticket)),
        patch.object(feedback_service_module, "create_notification_record", new=create),
        patch.object(feedback_service_module, "t", return_value="New feedback reply"),
    ):
        await service._dispatch_feedback_reply(
            delivery_id=delivery.id,
            ticket_id=ticket.id,
            message_id=message.id,
            actor_user_id=uuid4(),
        )

    target = create.await_args.kwargs["target"]
    assert isinstance(target, NotificationFeedbackTicketTarget)
    assert target.ticket_id == ticket.id
    assert delivery.state is NotificationDeliveryState.DELIVERED
    assert delivery.notification_id == notification_id


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("disposition", "reason"),
    [
        (NotificationRecordCreateDisposition.GROUP_SUPPRESSED, "NOTIFICATION_SYSTEM_POLICY_DISABLED"),
        (NotificationRecordCreateDisposition.PREFERENCE_SUPPRESSED, "NOTIFICATION_IN_APP_PREFERENCE_DISABLED"),
    ],
)
async def test_feedback_reply_dispatch_persists_notification_suppression(
    disposition: NotificationRecordCreateDisposition,
    reason: str,
) -> None:
    service = FeedbackService(_settings())
    ticket, message, delivery = _reply_dispatch_models()
    create = AsyncMock(return_value=NotificationRecordCreateResult(disposition=disposition, record=None))

    with (
        patch.object(feedback_service_module.NotificationDeliveryRecord, "get", new=AsyncMock(return_value=delivery)),
        patch.object(feedback_service_module.FeedbackMessage, "get", new=AsyncMock(return_value=message)),
        patch.object(feedback_service_module.FeedbackTicket, "get", new=AsyncMock(return_value=ticket)),
        patch.object(feedback_service_module, "create_notification_record", new=create),
        patch.object(feedback_service_module, "t", return_value="New feedback reply"),
    ):
        await service._dispatch_feedback_reply(
            delivery_id=delivery.id,
            ticket_id=ticket.id,
            message_id=message.id,
            actor_user_id=uuid4(),
        )

    assert delivery.state is NotificationDeliveryState.SUPPRESSED
    assert delivery.failure_code == reason
    assert delivery.is_retryable is False


@pytest.mark.asyncio
async def test_feedback_reply_dispatch_marks_the_existing_notification_after_deduplication() -> None:
    service = FeedbackService(_settings())
    ticket, message, delivery = _reply_dispatch_models()
    notification_id = uuid4()
    create = AsyncMock(
        return_value=NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.DEDUPLICATED,
            record=None,
        )
    )

    with (
        patch.object(feedback_service_module.NotificationDeliveryRecord, "get", new=AsyncMock(return_value=delivery)),
        patch.object(feedback_service_module.FeedbackMessage, "get", new=AsyncMock(return_value=message)),
        patch.object(feedback_service_module.FeedbackTicket, "get", new=AsyncMock(return_value=ticket)),
        patch.object(feedback_service_module, "create_notification_record", new=create),
        patch.object(
            feedback_service_module.NotificationRecord,
            "filter",
            return_value=_notification_query(SimpleNamespace(id=notification_id)),
        ),
        patch.object(feedback_service_module, "t", return_value="New feedback reply"),
    ):
        await service._dispatch_feedback_reply(
            delivery_id=delivery.id,
            ticket_id=ticket.id,
            message_id=message.id,
            actor_user_id=uuid4(),
        )

    assert delivery.state is NotificationDeliveryState.DELIVERED
    assert delivery.notification_id == notification_id


@pytest.mark.asyncio
async def test_feedback_reply_dispatch_keeps_a_missing_deduplicated_notification_retryable() -> None:
    service = FeedbackService(_settings())
    ticket, message, delivery = _reply_dispatch_models()
    create = AsyncMock(
        return_value=NotificationRecordCreateResult(
            disposition=NotificationRecordCreateDisposition.DEDUPLICATED,
            record=None,
        )
    )

    with (
        patch.object(feedback_service_module.NotificationDeliveryRecord, "get", new=AsyncMock(return_value=delivery)),
        patch.object(feedback_service_module.FeedbackMessage, "get", new=AsyncMock(return_value=message)),
        patch.object(feedback_service_module.FeedbackTicket, "get", new=AsyncMock(return_value=ticket)),
        patch.object(feedback_service_module, "create_notification_record", new=create),
        patch.object(feedback_service_module.NotificationRecord, "filter", return_value=_notification_query(None)),
        patch.object(feedback_service_module, "t", return_value="New feedback reply"),
    ):
        await service._dispatch_feedback_reply(
            delivery_id=delivery.id,
            ticket_id=ticket.id,
            message_id=message.id,
            actor_user_id=uuid4(),
        )

    assert delivery.state is NotificationDeliveryState.FAILED
    assert delivery.failure_code == "FEEDBACK_REPLY_DELIVERY_FAILED"
    assert delivery.is_retryable is True
    assert "FEEDBACK_REPLY_DEDUPLICATED_NOTIFICATION_UNAVAILABLE" in delivery.failure_message
