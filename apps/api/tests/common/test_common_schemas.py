from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from apps.api.src.common.schemas.base import BaseOut, BaseSchema, TimestampMixin


class DemoSchema(BaseSchema):
    name: str


class DemoOut(BaseOut, TimestampMixin):
    name: str


class Dummy(BaseSchema):
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime


def test_base_schema_strips() -> None:
    data = DemoSchema(name="  alice  ")
    assert data.name == "alice"


def test_base_out_from_attributes() -> None:
    now = datetime.now(UTC)
    dummy = Dummy(id=uuid4(), name="bob", created_at=now, updated_at=now)
    payload = DemoOut.model_validate(dummy)

    assert payload.id == dummy.id
    assert payload.name == "bob"
    assert payload.created_at == now
    assert payload.updated_at == now
