from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID

from src.config import Settings
from src.models.system.plugin_installation import PluginOperationKind, PluginSourceType
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandledInterruption
from src.modules.system.plugins.job_contract import (
    PluginLifecycleJobInput,
    PluginLifecycleJobTarget,
)
from src.modules.system.plugins.job_handler import PluginLifecycleJobHandler
from src.modules.system.plugins.lifecycle_repository import PluginLifecycleRepository


class _Repository:
    def __init__(self) -> None:
        self.progress: list[tuple[str, int, int]] = []
        self.staged: list[PluginLifecycleJobInput] = []

    async def mark_operation_progress(
        self,
        operation_id: object,
        *,
        phase: str,
        completed: int,
        total: int,
    ) -> None:
        self.progress.append((phase, completed, total))

    async def stage_for_restart(self, job_input: PluginLifecycleJobInput) -> Any:
        self.staged.append(job_input)
        return SimpleNamespace(id=job_input.operation_id)


class _Context:
    def __init__(self, job_input: PluginLifecycleJobInput) -> None:
        self.input_reference = job_input
        self.target = PluginLifecycleJobTarget(
            operation_id=job_input.operation_id,
            plugin_name=job_input.plugin_name,
        )
        self.progress: list[object] = []

    async def report_progress(self, update: object) -> None:
        self.progress.append(update)

    async def run_fenced_domain_commit(self, callback):
        return await callback()


async def test_handler_projects_operator_visible_progress_before_restart(monkeypatch, tmp_path) -> None:
    job_input = PluginLifecycleJobInput(
        operation_id=UUID("69203412-1acc-43ce-aeff-30577333cf19"),
        plugin_name="catalog-test",
        kind=PluginOperationKind.INSTALL,
        source_type=PluginSourceType.BUNDLED,
        source_locator="plugins/catalog-test",
        target_version="1.2.3",
        artifact_checksum=f"sha256:{'a' * 64}",
        package_checksum=f"sha256:{'a' * 64}",
        manifest_digest=f"sha256:{'b' * 64}",
        desired_enabled=True,
    )
    repository = _Repository()
    handler = PluginLifecycleJobHandler(
        settings=Settings(app_env="test"),
        project_root=tmp_path,
        repository=cast(PluginLifecycleRepository, repository),
    )
    monkeypatch.setattr(handler, "_verify_package", AsyncMock())
    context = _Context(job_input)

    result = await handler.execute(
        context=cast(JobExecutionContext[PluginLifecycleJobTarget, PluginLifecycleJobInput], context)
    )

    assert isinstance(result, JobHandledInterruption)
    assert result.phase == "waiting_for_restart"
    assert repository.progress == [
        ("verifying_package", 1, 5),
        ("staging", 2, 5),
    ]
    assert repository.staged == [job_input]
    assert [cast(Any, update).phase for update in context.progress] == [
        "verifying_package",
        "staging",
    ]
