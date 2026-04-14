from __future__ import annotations

from collections.abc import Callable
from typing import Any

from guard_core import SecurityDecorator
from guard_core.models import SecurityConfig

# Route decorators are applied at import time, so they must bind to a shared
# decorator instance that is later wired into the app runtime.
guard_decorator = SecurityDecorator(SecurityConfig())


def guard_rate_limit(requests: int, window: int = 60) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    return guard_decorator.rate_limit(requests=requests, window=window)
