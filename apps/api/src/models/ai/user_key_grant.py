"""User Key Workspace Grant model.

R3 audit requirement: precise grant authorization contract.
    - approval_state enum with defined transitions
    - Grant lifecycle: pending → approved/denied/revoked
    - Auto-revoke when user leaves workspace
    - Cascade disable when key is rotated/revoked

FK notes:
    - user_id, workspace_id, api_key_id are *not* foreign-key-constrained.
      These references cross module boundaries (users, workspaces, ai_api_keys)
      and cleanup is handled by application-level hooks, not DB cascades.

Cleanup scenarios (handled by application hooks):
    - User removed from workspace -> revoke all grants for user+workspace
    - API key disabled/rotated -> revoke all grants referencing that key_id
    - Workspace deleted -> revoke all grants in the workspace

Grant resolution (Workspace-First):
    1. Workspace own Key -> workspace/{id}
    2. User Key with active grant -> user/{uid}:ws/{wid}
    3. Platform shared Key -> platform/shared
"""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class GrantApprovalState(StrEnum):
    """Approval state for user key workspace grants.

    Transitions:
        PENDING → APPROVED  (workspace admin approves)
        PENDING → DENIED    (workspace admin denies)
        APPROVED → REVOKED  (admin revokes, or user leaves workspace)
        DENIED → PENDING    (re-submission)
    """

    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    REVOKED = "revoked"


# Valid state transitions.
_GRANT_TRANSITIONS: dict[GrantApprovalState, set[GrantApprovalState]] = {
    GrantApprovalState.PENDING: {GrantApprovalState.APPROVED, GrantApprovalState.DENIED},
    GrantApprovalState.APPROVED: {GrantApprovalState.REVOKED},
    GrantApprovalState.DENIED: {GrantApprovalState.PENDING},
    GrantApprovalState.REVOKED: set(),  # Terminal
}

# Terminal states (no further transitions).
_GRANT_TERMINAL = {GrantApprovalState.REVOKED}


def can_transition_grant(
    current: GrantApprovalState,
    target: GrantApprovalState,
) -> bool:
    """Check if a grant state transition is valid."""
    return target in _GRANT_TRANSITIONS.get(current, set())


def is_grant_active(state: GrantApprovalState) -> bool:
    """A grant is active (usable for LLM calls) only when APPROVED."""
    return state == GrantApprovalState.APPROVED


class UserKeyWorkspaceGrant(BaseModel):
    """Grants a user's personal API key access to a workspace.

    Created when a user wants to use their own LLM key for a workspace.
    Requires workspace admin approval (or bring_own_key permission).
    """

    user_id = fields.UUIDField(db_index=True)
    workspace_id = fields.UUIDField(db_index=True)
    api_key_id = fields.UUIDField(db_index=True)
    approval_state = fields.CharEnumField(GrantApprovalState, default=GrantApprovalState.PENDING, db_index=True)
    approved_by = fields.UUIDField(null=True)
    approved_at = fields.DatetimeField(null=True)
    revoked_at = fields.DatetimeField(null=True)
    notes = fields.TextField(null=True)

    @property
    def is_active(self) -> bool:
        """A grant is only valid if APPROVED and not revoked."""
        return self.approval_state == GrantApprovalState.APPROVED and self.revoked_at is None

    class Meta(BaseModel.Meta):
        table = "user_key_workspace_grants"
        abstract = False
        unique_together = (("user_id", "workspace_id", "api_key_id"),)
