from __future__ import annotations

from pathlib import Path


def test_storage_settings_default_root_dir_is_data_uploads() -> None:
    from apps.api.config import get_settings

    settings = get_settings()
    root = settings.storage.local_root_dir
    assert isinstance(root, Path)
    # The exact absolute path depends on repo location; assert suffix only.
    assert str(root).endswith("/data/uploads")


def test_storage_settings_default_tmp_dir_is_under_data_uploads() -> None:
    from apps.api.config import get_settings

    settings = get_settings()
    tmp_dir = settings.storage.local_tmp_dir
    assert str(tmp_dir).endswith("/data/uploads/.tmp")
