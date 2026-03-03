from __future__ import annotations

from uuid import UUID, uuid4

try:
    from uuid6 import uuid7 as _uuid7
except ImportError:  # pragma: no cover
    _uuid7 = None


def uuid7() -> UUID:
    if _uuid7 is not None:
        return _uuid7()
    return uuid4()
