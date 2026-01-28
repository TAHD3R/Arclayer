from __future__ import annotations

from datetime import UTC, datetime, timedelta

from apps.api.routers.shares.service import is_share_link_active


class _Link:
    def __init__(self, *, expires_at=None, revoked_at=None):
        self.expires_at = expires_at
        self.revoked_at = revoked_at


def test_share_link_active_when_not_expired_and_not_revoked() -> None:
    now = datetime.now(tz=UTC)
    link = _Link(expires_at=now + timedelta(seconds=60), revoked_at=None)
    assert is_share_link_active(link, now=now) is True


def test_share_link_inactive_when_expired() -> None:
    now = datetime.now(tz=UTC)
    link = _Link(expires_at=now - timedelta(seconds=1), revoked_at=None)
    assert is_share_link_active(link, now=now) is False


def test_share_link_inactive_when_revoked() -> None:
    now = datetime.now(tz=UTC)
    link = _Link(expires_at=None, revoked_at=now)
    assert is_share_link_active(link, now=now) is False
