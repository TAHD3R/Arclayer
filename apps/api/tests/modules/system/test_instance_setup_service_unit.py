from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from src.config import ApplicationSettings, Settings
from src.modules.system.setup.service import InstanceSetupService, InstanceSetupStatus


def _build_settings(*, data_dir: Path) -> Settings:
    return Settings(application=ApplicationSettings(data_dir=data_dir))


class _StubInstanceSetupService(InstanceSetupService):
    def __init__(self, settings: Settings, *, super_admin_count: int) -> None:
        super().__init__(settings)
        self._super_admin_count = super_admin_count

    async def count_super_admins(self) -> int:
        return self._super_admin_count


@pytest.mark.asyncio
async def test_instance_setup_service_reports_uninitialized_without_lock_or_super_admin(tmp_path: Path) -> None:
    settings = _build_settings(data_dir=tmp_path)
    service = _StubInstanceSetupService(settings, super_admin_count=0)

    state = await service.get_state()

    assert state.status == InstanceSetupStatus.UNINITIALIZED
    assert state.install_lock_present is False
    assert state.install_lock_metadata is None
    assert state.super_admin_count == 0
    assert state.repair_reason is None


@pytest.mark.asyncio
async def test_instance_setup_service_reports_ready_with_lock_and_single_super_admin(tmp_path: Path) -> None:
    settings = _build_settings(data_dir=tmp_path)
    service = _StubInstanceSetupService(settings, super_admin_count=1)
    metadata = service.build_install_lock_metadata(initialized_by_user_id=uuid4())
    service.write_install_lock(metadata)

    state = await service.get_state()

    assert state.status == InstanceSetupStatus.READY
    assert state.install_lock_present is True
    assert state.install_lock_metadata == metadata
    assert state.super_admin_count == 1
    assert state.repair_reason is None


@pytest.mark.asyncio
async def test_instance_setup_service_marks_invalid_lock_as_repair_required(tmp_path: Path) -> None:
    settings = _build_settings(data_dir=tmp_path)
    service = _StubInstanceSetupService(settings, super_admin_count=1)
    service.install_lock_path.parent.mkdir(parents=True, exist_ok=True)
    service.install_lock_path.write_text("{not-json", encoding="utf-8")

    state = await service.get_state()

    assert state.status == InstanceSetupStatus.REPAIR_REQUIRED
    assert state.install_lock_present is True
    assert state.install_lock_metadata is None
    assert state.super_admin_count == 1
    assert state.repair_reason == "invalid_install_lock"
