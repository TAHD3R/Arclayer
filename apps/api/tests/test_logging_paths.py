from pathlib import Path

from apps.api.config import LoggingSettings


def test_logging_log_dir_resolves_repo_relative_path() -> None:
    settings = LoggingSettings(log_dir=Path("apps/api/logs"))

    # 目标：不能出现重复的 `apps/api/apps/api` 这种拼接结果
    path_str = str(settings.log_dir).replace("\\", "/")
    assert settings.log_dir.is_absolute()
    assert path_str.endswith("apps/api/logs")
    assert "apps/api/apps/api" not in path_str


def test_logging_log_dir_resolves_app_relative_path() -> None:
    settings = LoggingSettings(log_dir=Path("logs"))

    path_str = str(settings.log_dir).replace("\\", "/")
    assert settings.log_dir.is_absolute()
    # 相对路径默认相对于 `apps/api`，因此应落到 `<repo>/apps/api/logs`
    assert path_str.endswith("apps/api/logs")
