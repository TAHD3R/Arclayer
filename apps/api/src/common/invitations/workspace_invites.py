from __future__ import annotations

WORKSPACE_EMAIL_INVITE_PREFIX_MEMBER = "ei"
WORKSPACE_EMAIL_INVITE_PREFIX_GUEST = "eig"
WORKSPACE_INVITE_LINK_PREFIX_MEMBER = "il"
WORKSPACE_INVITE_LINK_PREFIX_GUEST = "ilg"

_WORKSPACE_INVITE_LINK_PREFIXES: tuple[str, ...] = (
    WORKSPACE_INVITE_LINK_PREFIX_MEMBER,
    WORKSPACE_INVITE_LINK_PREFIX_GUEST,
)

_WORKSPACE_EMAIL_INVITE_PREFIXES: tuple[str, ...] = (
    WORKSPACE_EMAIL_INVITE_PREFIX_MEMBER,
    WORKSPACE_EMAIL_INVITE_PREFIX_GUEST,
)


def is_workspace_invite_link_code(code: str) -> bool:
    raw = (code or "").strip()
    if not raw:
        return False
    return any(raw.startswith(f"{p}_") for p in _WORKSPACE_INVITE_LINK_PREFIXES)


def is_workspace_email_invite_code(code: str) -> bool:
    raw = (code or "").strip()
    if not raw:
        return False
    return any(raw.startswith(f"{p}_") for p in _WORKSPACE_EMAIL_INVITE_PREFIXES)


def is_workspace_guest_invite_code(code: str) -> bool:
    """
    Return true when the invite code indicates workspace-only guest join mode.

    Implementation detail:
    - Invite tokens sign only the `code`.
    - We encode join mode in the code prefix to avoid database migrations.
    """

    raw = (code or "").strip()
    if not raw:
        return False
    return raw.startswith(f"{WORKSPACE_EMAIL_INVITE_PREFIX_GUEST}_") or raw.startswith(
        f"{WORKSPACE_INVITE_LINK_PREFIX_GUEST}_"
    )
