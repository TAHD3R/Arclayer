from __future__ import annotations

from typing import Final

from asyncpg import exceptions as asyncpg_exceptions
from tortoise.exceptions import (
    DBConnectionError,
    IntegrityError,
    OperationalError,
    TransactionManagementError,
)

_RETRYABLE_POSTGRES_FAILURES: Final = (
    TimeoutError,
    ConnectionError,
    asyncpg_exceptions.ConnectionDoesNotExistError,
    asyncpg_exceptions.ClientCannotConnectError,
    asyncpg_exceptions.ConnectionFailureError,
    asyncpg_exceptions.TransactionResolutionUnknownError,
    asyncpg_exceptions.SerializationError,
    asyncpg_exceptions.DeadlockDetectedError,
    asyncpg_exceptions.StatementCompletionUnknownError,
    asyncpg_exceptions.LockNotAvailableError,
    asyncpg_exceptions.QueryCanceledError,
    asyncpg_exceptions.TransactionTimeoutError,
    asyncpg_exceptions.IdleInTransactionSessionTimeoutError,
    asyncpg_exceptions.IdleSessionTimeoutError,
    asyncpg_exceptions.TooManyConnectionsError,
    asyncpg_exceptions.AdminShutdownError,
    asyncpg_exceptions.CrashShutdownError,
    asyncpg_exceptions.CannotConnectNowError,
)
_RETRYABLE_POSTGRES_WRAPPERS: Final = (OperationalError, TransactionManagementError)
_NON_RETRYABLE_ORM_FAILURES: Final = (DBConnectionError, IntegrityError)


def is_retryable_postgres_failure(exc: Exception) -> bool:
    """Classify only explicit transient PostgreSQL roots as retryable.

    All causal leaves must be transient so a rollback connection error cannot
    replace the permanent application or integrity failure that triggered it.
    """
    failures, roots = _exception_graph(exc)
    if any(isinstance(failure, _NON_RETRYABLE_ORM_FAILURES) for failure in failures):
        return False
    for failure in failures:
        if _linked_exceptions(failure) and not isinstance(
            failure,
            (*_RETRYABLE_POSTGRES_FAILURES, *_RETRYABLE_POSTGRES_WRAPPERS),
        ):
            return False
    return bool(roots) and all(isinstance(root, _RETRYABLE_POSTGRES_FAILURES) for root in roots)


def _linked_exceptions(failure: BaseException) -> tuple[BaseException, ...]:
    return tuple(nested for nested in (failure.__cause__, failure.__context__) if nested is not None)


def _exception_graph(exc: BaseException) -> tuple[tuple[BaseException, ...], tuple[BaseException, ...]]:
    """Return unique failures and causal leaves, failing closed on cycles."""
    failures: list[BaseException] = []
    roots: list[BaseException] = []
    visiting: set[int] = set()
    visited: set[int] = set()
    cycle_detected = False

    def visit(failure: BaseException) -> None:
        nonlocal cycle_detected
        failure_id = id(failure)
        if failure_id in visiting:
            cycle_detected = True
            return
        if failure_id in visited:
            return
        visiting.add(failure_id)
        failures.append(failure)

        linked = _linked_exceptions(failure)
        if linked:
            for nested in linked:
                visit(nested)
        else:
            roots.append(failure)
        visiting.remove(failure_id)
        visited.add(failure_id)

    visit(exc)
    return tuple(failures), () if cycle_detected else tuple(roots)
