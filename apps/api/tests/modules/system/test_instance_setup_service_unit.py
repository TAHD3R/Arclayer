from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from src.config import ApplicationSettings, Settings
from src.modules.system.setup.service import InstanceSetupService, InstanceSetupStatus


def _build_settings(*, data_dir: Path) -> Settings:
    return Settings(application=ApplicationSettings(data_dir=data_dir))


class _StubInstanceSetupService(InstanceSetupService):
    def __init__(self, settings: Settings, *, owner_user_id=None) -> None:
        super().__init__(settings)
        self._owner_user_id = owner_user_id

    async def get_instance_owner_user_id(self):
        return self._owner_user_id


@pytest.mark.asyncio
async def test_instance_setup_service_reports_uninitialized_without_lock_or_instance_owner(tmp_path: Path) -> None:
    settings = _build_settings(data_dir=tmp_path)
    service = _StubInstanceSetupService(settings)

    state = await service.get_state()

    assert state.status == InstanceSetupStatus.UNINITIALIZED
    assert state.install_lock_present is False
    assert state.install_lock_metadata is None
    assert state.owner_user_id is None
    assert state.repair_reason is None


@pytest.mark.asyncio
async def test_instance_setup_service_reports_ready_with_matching_lock_and_instance_owner(tmp_path: Path) -> None:
    settings = _build_settings(data_dir=tmp_path)
    owner_user_id = uuid4()
    service = _StubInstanceSetupService(settings, owner_user_id=owner_user_id)
    metadata = service.build_install_lock_metadata(initialized_by_user_id=owner_user_id)
    service.write_install_lock(metadata)

    state = await service.get_state()

    assert state.status == InstanceSetupStatus.READY
    assert state.install_lock_present is True
    assert state.install_lock_metadata == metadata
    assert state.owner_user_id == owner_user_id
    assert state.repair_reason is None


@pytest.mark.asyncio
async def test_instance_setup_service_marks_invalid_lock_as_repair_required(tmp_path: Path) -> None:
    settings = _build_settings(data_dir=tmp_path)
    service = _StubInstanceSetupService(settings, owner_user_id=uuid4())
    service.install_lock_path.parent.mkdir(parents=True, exist_ok=True)
    service.install_lock_path.write_text("{not-json", encoding="utf-8")

    state = await service.get_state()

    assert state.status == InstanceSetupStatus.REPAIR_REQUIRED
    assert state.install_lock_present is True
    assert state.install_lock_metadata is None
    assert state.owner_user_id is not None
    assert state.repair_reason == "invalid_install_lock"
