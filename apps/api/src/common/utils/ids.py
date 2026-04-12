from __future__ import annotations

from collections.abc import Callable
from uuid import UUID, uuid4

_uuid7: Callable[[], UUID] | None

try:
    from uuid6 import uuid7 as _uuid7_impl
except ImportError:  # pragma: no cover
    _uuid7 = None
else:
    _uuid7 = _uuid7_impl


def uuid7() -> UUID:
    if _uuid7 is not None:
        return _uuid7()
    return uuid4()
