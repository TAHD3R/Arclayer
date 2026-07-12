from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict
from src.models.feedback.feedback import FeedbackCategory, FeedbackContextType, FeedbackSource
from src.models.organization.user import User
from src.modules.feedback.schema import FeedbackSubmitRequest
from src.modules.feedback.service import FeedbackService


def _settings() -> Settings:
    audit = SimpleNamespace(max_property_keys=32, max_string_length=1_000, max_depth=4)
    return cast(Settings, SimpleNamespace(analytics=SimpleNamespace(audit_log=audit)))


def _payload(message: str = "The publish confirmation needs a clearer status.") -> FeedbackSubmitRequest:
    return FeedbackSubmitRequest(
        client_request_id="019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
        source=FeedbackSource.HEADER,
        context_type=FeedbackContextType.GLOBAL,
        category=FeedbackCategory.USABILITY,
        message=message,
        context_url="/system/overview",
        context={"route": "/system/overview"},
    )


def _reporter() -> User:
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


def _transaction() -> tuple[MagicMock, MagicMock]:
    connection = MagicMock()
    transaction = MagicMock()
    transaction.__aenter__ = AsyncMock(return_value=connection)
    transaction.__aexit__ = AsyncMock(return_value=None)
    return transaction, connection


@pytest.mark.asyncio
async def test_same_client_request_and_payload_returns_existing_ticket_without_duplicate_audit() -> None:
    service = FeedbackService(_settings())
    resolve_scope = AsyncMock(return_value=(None, None))
    detail = MagicMock()
    get_detail = AsyncMock(return_value=detail)
    reporter = _reporter()
    ticket = SimpleNamespace(id=uuid4(), submission_fingerprint="")
    calls = 0

    async def get_or_create(**kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            ticket.submission_fingerprint = kwargs["defaults"]["submission_fingerprint"]
            return ticket, True
        return ticket, False

    transaction, _ = _transaction()
    audit = AsyncMock()
    with (
        patch("src.modules.feedback.service.in_transaction", return_value=transaction),
        patch("src.modules.feedback.service.FeedbackTicket.get_or_create", side_effect=get_or_create),
        patch("src.modules.feedback.service.write_required_activity_event", audit),
        patch.object(service, "_resolve_scope", resolve_scope),
        patch.object(service, "get_detail", get_detail),
    ):
        first = await service.submit(payload=_payload(), reporter=reporter)
        second = await service.submit(payload=_payload(), reporter=reporter)

    assert first is detail
    assert second is detail
    assert calls == 2
    audit.assert_awaited_once()


@pytest.mark.asyncio
async def test_reused_client_request_with_different_payload_returns_conflict() -> None:
    service = FeedbackService(_settings())
    resolve_scope = AsyncMock(return_value=(None, None))
    reporter = _reporter()
    ticket = SimpleNamespace(id=uuid4(), submission_fingerprint="different")
    transaction, _ = _transaction()

    with (
        patch("src.modules.feedback.service.in_transaction", return_value=transaction),
        patch.object(service, "_resolve_scope", resolve_scope),
        patch(
            "src.modules.feedback.service.FeedbackTicket.get_or_create",
            new=AsyncMock(return_value=(ticket, False)),
        ),
        pytest.raises(Conflict) as exc_info,
    ):
        await service.submit(payload=_payload("A different feedback message."), reporter=reporter)

    assert exc_info.value.error == "FEEDBACK_IDEMPOTENCY_CONFLICT"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "context",
    [
        {"route": "/system/overview", "accessToken": "secret"},
        {"route": "x" * 1_001},
        {"one": {"two": {"three": {"four": "too deep"}}}},
    ],
)
async def test_feedback_rejects_context_that_would_be_silently_sanitized(context: JsonObject) -> None:
    service = FeedbackService(_settings())
    payload = _payload()
    payload.context = context

    with (
        patch.object(service, "_resolve_scope", new=AsyncMock(return_value=(None, None))),
        pytest.raises(BadRequest) as exc_info,
    ):
        await service.submit(payload=payload, reporter=_reporter())

    assert exc_info.value.error == "FEEDBACK_CONTEXT_INVALID"
