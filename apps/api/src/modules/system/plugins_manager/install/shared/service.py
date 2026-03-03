from __future__ import annotations

import asyncio

from pydantic import ValidationError
from tortoise.exceptions import IntegrityError, OperationalError

from apps.api.src.core.i18n import t
from apps.api.src.core.logging import get_logger

logger = get_logger(__name__)

LIFECYCLE_RECOVERY_ERRORS = (IntegrityError, KeyError, OperationalError, OSError, RuntimeError, TypeError, ValueError)
PERSISTENCE_ERRORS = (IntegrityError, OperationalError, TypeError, ValidationError, ValueError)
MENU_SEED_ERRORS = (IntegrityError, OperationalError, OSError, RuntimeError, TypeError, ValidationError, ValueError)
EVENT_PUBLISH_ERRORS = (KeyError, OSError, RuntimeError, TypeError, ValueError)


def _tp(key: str, default: str) -> str:
    return t("plugin", key, default=default)


_INSTALL_LOCKS: dict[str, tuple[int, asyncio.Lock]] = {}


def get_install_lock(key: str) -> asyncio.Lock:
    # Keep locking per-event-loop to avoid cross-loop asyncio.Lock reuse in tests.
    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    k = str(key)
    entry = _INSTALL_LOCKS.get(k)
    if entry is None or entry[0] != loop_id:
        lock = asyncio.Lock()
        _INSTALL_LOCKS[k] = (loop_id, lock)
        return lock
    return entry[1]
