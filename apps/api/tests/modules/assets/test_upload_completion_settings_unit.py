from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config import StorageSettings

pytestmark = pytest.mark.unit


def test_upload_completion_timing_allows_two_missed_heartbeat_opportunities() -> None:
    settings = StorageSettings(
        upload_completion_lease_seconds=90,
        upload_completion_heartbeat_seconds=30,
    )

    assert settings.upload_completion_lease_seconds == 90
    assert settings.upload_completion_heartbeat_seconds == 30


def test_upload_completion_timing_rejects_lease_shorter_than_three_heartbeats() -> None:
    with pytest.raises(ValidationError, match="two missed heartbeat opportunities"):
        StorageSettings(
            upload_completion_lease_seconds=89,
            upload_completion_heartbeat_seconds=30,
        )
