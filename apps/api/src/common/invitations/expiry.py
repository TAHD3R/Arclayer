from __future__ import annotations

from datetime import UTC, datetime, timedelta


def build_expires_at(*, expires_in_seconds: int | None) -> datetime | None:
    """
    Build an absolute UTC expiry datetime from a TTL seconds value.

    Notes:
    - None means never expire.
    - Non-positive values are treated as never expire.
    """

    if expires_in_seconds is None:
        return None
    seconds = int(expires_in_seconds)
    if seconds <= 0:
        return None
    return datetime.now(UTC) + timedelta(seconds=seconds)
