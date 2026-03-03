from pathlib import Path

from apps.api.src.config import LoggingSettings


def test_logging_log_dir_resolves_repo_relative_path() -> None:
    settings = LoggingSettings(log_dir=Path("apps/api/logs"))

    # Goal: avoid duplicated path segments like `apps/api/apps/api`.
    path_str = str(settings.log_dir).replace("\\", "/")
    assert settings.log_dir.is_absolute()
    assert path_str.endswith("apps/api/logs")
    assert "apps/api/apps/api" not in path_str


def test_logging_log_dir_resolves_app_relative_path() -> None:
    settings = LoggingSettings(log_dir=Path("logs"))

    path_str = str(settings.log_dir).replace("\\", "/")
    assert settings.log_dir.is_absolute()
    # Relative paths are resolved against `apps/api`, so this should land under `<repo>/apps/api/logs`.
    assert path_str.endswith("apps/api/logs")
