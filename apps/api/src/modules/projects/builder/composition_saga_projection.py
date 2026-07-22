from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import NoReturn

from src.models.builder._enums import BuilderCompositionSagaPhase, BuilderCompositionSagaStatus, BuilderGenerationStatus
from src.models.builder.composition_saga import BuilderCompositionSagaRecord
from src.models.builder.generation import BuilderGenerationRecord
from src.modules.jobs.execution_errors import PermanentJobExecutionError
from src.modules.projects.builder.composition_saga_repository import BuilderCompositionSagaRepository


class BuilderCompositionSagaChildProjector:
    def __init__(
        self,
        *,
        repository_factory: Callable[[], BuilderCompositionSagaRepository],
    ) -> None:
        self._repository_factory = repository_factory

    async def mark_running(self, *, generation: BuilderGenerationRecord) -> None:
        if generation.composition_saga_id is None:
            return
        if BuilderGenerationStatus(str(generation.status)) is not BuilderGenerationStatus.RUNNING:
            _raise_contract_mismatch("Builder Composition Saga child is not running")
        phase = _phase(generation)
        repository, parent = await self._locked_parent(generation)
        expected, target = _running_transition(phase)
        current = BuilderCompositionSagaStatus(str(parent.status))
        if current is target:
            return
        if current is not expected:
            _raise_contract_mismatch("Builder Composition Saga parent cannot enter the child running state")
        await repository.update_saga(
            record=parent,
            values={"status": target, "waiting_reason": None},
            conn=None,
        )

    async def mark_terminal(
        self,
        *,
        generation: BuilderGenerationRecord,
        error_code: str | None = None,
    ) -> None:
        if generation.composition_saga_id is None:
            return
        status = BuilderGenerationStatus(str(generation.status))
        if status not in {
            BuilderGenerationStatus.SUCCEEDED,
            BuilderGenerationStatus.PARTIAL,
            BuilderGenerationStatus.FAILED,
            BuilderGenerationStatus.CANCELLED,
        }:
            _raise_contract_mismatch("Builder Composition Saga child is not terminal")
        phase = _phase(generation)
        repository, parent = await self._locked_parent(generation)
        values = _terminal_values(
            generation=generation,
            phase=phase,
            status=status,
            error_code=error_code,
        )
        target = BuilderCompositionSagaStatus(str(values["status"]))
        current = BuilderCompositionSagaStatus(str(parent.status))
        if current is target:
            return
        if current not in _phase_nonterminal_statuses(phase):
            _raise_contract_mismatch("Builder Composition Saga parent cannot enter the child terminal state")
        await repository.update_saga(record=parent, values=values, conn=None)

    async def _locked_parent(
        self,
        generation: BuilderGenerationRecord,
    ) -> tuple[BuilderCompositionSagaRepository, BuilderCompositionSagaRecord]:
        repository = self._repository_factory()
        parent = await repository.get_saga(
            project_id=generation.project_id,
            saga_id=generation.composition_saga_id,
            conn=None,
            for_update=True,
        )
        if parent is None or parent.project_id != generation.project_id:
            _raise_contract_mismatch("Builder Composition Saga parent is unavailable")
        _require_child_binding(parent=parent, generation=generation)
        return repository, parent


def _phase(generation: BuilderGenerationRecord) -> BuilderCompositionSagaPhase:
    try:
        return BuilderCompositionSagaPhase(str(generation.composition_saga_phase))
    except ValueError:
        _raise_contract_mismatch("Builder Composition Saga child phase is invalid")


def _require_child_binding(
    *,
    parent: BuilderCompositionSagaRecord,
    generation: BuilderGenerationRecord,
) -> None:
    phase = _phase(generation)
    bound_generation_id = (
        parent.planning_generation_id
        if phase is BuilderCompositionSagaPhase.PLANNING
        else parent.composition_generation_id
    )
    if bound_generation_id != generation.id:
        _raise_contract_mismatch("Builder Composition Saga child binding does not match its parent")


def _running_transition(
    phase: BuilderCompositionSagaPhase,
) -> tuple[BuilderCompositionSagaStatus, BuilderCompositionSagaStatus]:
    if phase is BuilderCompositionSagaPhase.PLANNING:
        return (
            BuilderCompositionSagaStatus.PLANNING_QUEUED,
            BuilderCompositionSagaStatus.PLANNING_RUNNING,
        )
    return (
        BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
        BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
    )


def _terminal_values(
    *,
    generation: BuilderGenerationRecord,
    phase: BuilderCompositionSagaPhase,
    status: BuilderGenerationStatus,
    error_code: str | None,
) -> dict[str, object]:
    if status in {BuilderGenerationStatus.SUCCEEDED, BuilderGenerationStatus.PARTIAL}:
        review_status, waiting_reason = _review_transition(phase)
        return {"status": review_status, "waiting_reason": waiting_reason}
    if status is BuilderGenerationStatus.CANCELLED:
        return {
            "status": BuilderCompositionSagaStatus.CANCELLED,
            "waiting_reason": None,
            "terminal_error": None,
            "terminal_at": datetime.now(UTC),
        }
    code = error_code or "BUILDER_GENERATION_FAILED"
    return {
        "status": BuilderCompositionSagaStatus.FAILED,
        "waiting_reason": None,
        "terminal_error": {
            "code": code,
            "messageKey": code,
            "meta": {
                "generationId": str(generation.id),
                "phase": phase.value,
            },
        },
        "terminal_at": datetime.now(UTC),
    }


def _review_transition(
    phase: BuilderCompositionSagaPhase,
) -> tuple[BuilderCompositionSagaStatus, str]:
    if phase is BuilderCompositionSagaPhase.PLANNING:
        return BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING, "planning_review"
    return BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING, "composition_review"


def _phase_nonterminal_statuses(
    phase: BuilderCompositionSagaPhase,
) -> frozenset[BuilderCompositionSagaStatus]:
    if phase is BuilderCompositionSagaPhase.PLANNING:
        return frozenset({
            BuilderCompositionSagaStatus.PLANNING_QUEUED,
            BuilderCompositionSagaStatus.PLANNING_RUNNING,
            BuilderCompositionSagaStatus.PLANNING_REVIEW_PENDING,
        })
    return frozenset({
        BuilderCompositionSagaStatus.COMPOSITION_QUEUED,
        BuilderCompositionSagaStatus.COMPOSITION_RUNNING,
        BuilderCompositionSagaStatus.COMPOSITION_REVIEW_PENDING,
    })


def _raise_contract_mismatch(message: str) -> NoReturn:
    raise PermanentJobExecutionError(
        code="BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH",
        safe_message=message,
    )


__all__ = ["BuilderCompositionSagaChildProjector"]
