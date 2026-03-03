from __future__ import annotations

from contextvars import ContextVar
from uuid import UUID

# Request-scoped workspace context used by workspace-scoped authz and providers (e.g. menu).
#
# v2 note:
# - Workspace is the admin governance boundary.
# - We keep the contextvars in core so both router-level dependencies and deeper services/providers
#   can read it without importing FastAPI router modules.
_current_workspace_id: ContextVar[UUID | None] = ContextVar("current_workspace_id", default=None)
_current_workspace_membership_id: ContextVar[UUID | None] = ContextVar("current_workspace_membership_id", default=None)
_current_organization_id: ContextVar[UUID | None] = ContextVar("current_workspace_org_id", default=None)


def set_current_workspace_context(
    *,
    workspace_id: UUID | None,
    workspace_membership_id: UUID | None = None,
    organization_id: UUID | None = None,
) -> None:
    _current_workspace_id.set(workspace_id)
    _current_workspace_membership_id.set(workspace_membership_id)
    _current_organization_id.set(organization_id)


def get_current_workspace_id() -> UUID | None:
    return _current_workspace_id.get()


def get_current_workspace_membership_id() -> UUID | None:
    return _current_workspace_membership_id.get()


def get_current_workspace_organization_id() -> UUID | None:
    return _current_organization_id.get()
