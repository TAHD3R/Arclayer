from __future__ import annotations


class DurableTaskTransportError(RuntimeError):
    """Visible internal failure from durable Taskiq registration or dispatch."""

    def __init__(self, *, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


class DurableTaskManifestError(DurableTaskTransportError):
    def __init__(self, message: str) -> None:
        super().__init__(code="DURABLE_TASK_MANIFEST_INVALID", message=message)


class DurableTaskRegistrationError(DurableTaskTransportError):
    def __init__(self, message: str) -> None:
        super().__init__(code="DURABLE_TASK_REGISTRATION_INVALID", message=message)


class DurableTaskExecutionOutcomeError(DurableTaskTransportError):
    def __init__(self, message: str) -> None:
        super().__init__(code="DURABLE_TASK_EXECUTION_OUTCOME_INVALID", message=message)


class UnknownDurableTaskError(DurableTaskTransportError):
    def __init__(self, task_name: str) -> None:
        super().__init__(
            code="DURABLE_TASK_UNKNOWN",
            message=f"task {task_name!r} is not present in the validated durable task registry",
        )


class DurableTaskEnvelopeMismatchError(DurableTaskTransportError):
    def __init__(self, *, task_name: str, mismatched_fields: tuple[str, ...]) -> None:
        fields = ", ".join(mismatched_fields)
        super().__init__(
            code="DURABLE_TASK_ENVELOPE_MISMATCH",
            message=f"task {task_name!r} does not match envelope fields: {fields}",
        )
