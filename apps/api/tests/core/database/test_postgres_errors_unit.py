from __future__ import annotations

import pytest
from asyncpg import exceptions as asyncpg_exceptions
from tortoise.exceptions import DBConnectionError, IntegrityError, OperationalError, TransactionManagementError

from src.core.database.errors import is_retryable_postgres_failure

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "error_type",
    [
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
    ],
)
def test_retryable_postgres_failures_use_an_explicit_transport_and_sqlstate_allowlist(
    error_type: type[Exception],
) -> None:
    assert is_retryable_postgres_failure(error_type("simulated transient PostgreSQL failure")) is True


@pytest.mark.parametrize(
    "error",
    [
        DBConnectionError("invalid database configuration"),
        OperationalError("broad ORM operational failure"),
        TransactionManagementError("broad ORM transaction failure"),
        IntegrityError("constraint violation"),
        asyncpg_exceptions.PostgresError("broad PostgreSQL failure"),
        asyncpg_exceptions.PostgresConnectionError("broad PostgreSQL connection failure"),
        asyncpg_exceptions.TransactionRollbackError("broad PostgreSQL rollback failure"),
        asyncpg_exceptions.InvalidPasswordError("invalid password"),
        asyncpg_exceptions.InsufficientPrivilegeError("insufficient privilege"),
        asyncpg_exceptions.InterfaceError("invalid asyncpg API usage"),
        asyncpg_exceptions.DataError("invalid PostgreSQL data"),
        asyncpg_exceptions.UniqueViolationError("unique constraint violation"),
        RuntimeError("application invariant failure"),
        ValueError("invalid application value"),
        OSError("broad operating-system failure"),
        PermissionError("database socket permission denied"),
    ],
)
def test_non_retryable_postgres_failures_are_not_inferred_from_broad_or_permanent_types(
    error: Exception,
) -> None:
    assert is_retryable_postgres_failure(error) is False


def test_retryable_postgres_failure_scans_mixed_cause_and_context_chains() -> None:
    driver_error = asyncpg_exceptions.TransactionTimeoutError("transaction timed out")
    orm_wrapper = TransactionManagementError("transaction failed")
    orm_wrapper.__context__ = driver_error
    application_wrapper = OperationalError("repository operation failed")
    application_wrapper.__cause__ = orm_wrapper

    assert is_retryable_postgres_failure(application_wrapper) is True


def test_explicit_exception_chaining_does_not_treat_shared_cause_and_context_as_a_cycle() -> None:
    try:
        try:
            raise asyncpg_exceptions.ConnectionDoesNotExistError("connection lost")
        except asyncpg_exceptions.ConnectionDoesNotExistError as driver_error:
            raise OperationalError("repository operation failed") from driver_error
    except OperationalError as wrapped_error:
        assert wrapped_error.__cause__ is wrapped_error.__context__
        assert is_retryable_postgres_failure(wrapped_error) is True


def test_application_invariant_with_transient_context_is_not_retryable() -> None:
    driver_error = asyncpg_exceptions.ConnectionDoesNotExistError("connection lost")
    application_invariant = RuntimeError("canonical marker invariant failed")
    application_invariant.__context__ = driver_error

    assert is_retryable_postgres_failure(application_invariant) is False


def test_database_connection_configuration_error_wins_over_nested_os_error() -> None:
    transport_error = ConnectionRefusedError("connection refused")
    configuration_error = DBConnectionError("database configuration rejected")
    configuration_error.__context__ = transport_error

    assert is_retryable_postgres_failure(configuration_error) is False


def test_rollback_transport_error_does_not_override_original_integrity_failure() -> None:
    original_error = IntegrityError("canonical marker constraint failed")
    rollback_error = asyncpg_exceptions.ConnectionDoesNotExistError("connection lost during rollback")
    rollback_error.__context__ = original_error

    assert is_retryable_postgres_failure(rollback_error) is False


def test_rollback_transport_error_does_not_override_original_application_invariant() -> None:
    original_error = RuntimeError("canonical marker invariant failed")
    rollback_error = asyncpg_exceptions.ConnectionDoesNotExistError("connection lost during rollback")
    rollback_error.__context__ = original_error

    assert is_retryable_postgres_failure(rollback_error) is False
