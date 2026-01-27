from __future__ import annotations

from contextvars import ContextVar
from uuid import UUID

# Request-scoped organization context used by authz/menu services.
#
# We intentionally keep this in core (not routers) so both authz engine and
# service-layer code can read it without importing FastAPI routers.
_current_org_id: ContextVar[UUID | None] = ContextVar("current_org_id", default=None)
_current_membership_id: ContextVar[UUID | None] = ContextVar("current_membership_id", default=None)


def set_current_org_context(*, org_id: UUID | None, membership_id: UUID | None = None) -> None:
    _current_org_id.set(org_id)
    _current_membership_id.set(membership_id)


def get_current_org_id() -> UUID | None:
    return _current_org_id.get()


def get_current_membership_id() -> UUID | None:
    return _current_membership_id.get()
