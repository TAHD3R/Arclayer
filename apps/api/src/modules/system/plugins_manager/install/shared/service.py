from __future__ import annotations

import asyncio
from dataclasses import dataclass

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


@dataclass(frozen=True)
class _InstallLockEntry:
    loop_id: int
    lock: asyncio.Lock


_INSTALL_LOCKS: dict[str, _InstallLockEntry] = {}


def get_install_lock(key: str) -> asyncio.Lock:
    # Keep locking per-event-loop to avoid cross-loop asyncio.Lock reuse in tests.
    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    k = str(key)
    entry = _INSTALL_LOCKS.get(k)
    if entry is None or entry.loop_id != loop_id:
        lock = asyncio.Lock()
        _INSTALL_LOCKS[k] = _InstallLockEntry(loop_id=loop_id, lock=lock)
        return lock
    return entry.lock
