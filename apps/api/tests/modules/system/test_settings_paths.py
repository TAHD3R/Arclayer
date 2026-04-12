from pathlib import Path

from apps.api.src.config import ApplicationSettings, EmailSettings, SecuritySettings, StorageSettings


def _norm(p: Path) -> str:
    return str(p).replace("\\", "/")


def test_application_static_dir_resolves_repo_relative_path() -> None:
    settings = ApplicationSettings(static_dir=Path("static"))
    assert settings.static_dir.is_absolute()
    assert _norm(settings.static_dir).endswith("/static")
    assert "/apps/api/static" not in _norm(settings.static_dir)


def test_storage_paths_resolve_repo_relative_path() -> None:
    settings = StorageSettings(local_root_dir=Path("data/uploads"), local_tmp_dir=Path("data/uploads/.tmp"))
    assert settings.local_root_dir.is_absolute()
    assert settings.local_tmp_dir.is_absolute()
    assert _norm(settings.local_root_dir).endswith("/data/uploads")
    assert _norm(settings.local_tmp_dir).endswith("/data/uploads/.tmp")
    assert "/apps/api/data/uploads" not in _norm(settings.local_root_dir)


def test_email_template_dir_resolves_under_static_by_default() -> None:
    settings = EmailSettings(template_dir=Path("templates/emails"))
    assert settings.template_dir is not None
    assert settings.template_dir.is_absolute()
    assert _norm(settings.template_dir).endswith("/static/templates/emails")


def test_security_master_key_path_resolves_repo_relative_path() -> None:
    settings = SecuritySettings(master_key_path=Path("data/secrets/master.key"))
    assert settings.master_key_path.is_absolute()
    assert _norm(settings.master_key_path).endswith("/data/secrets/master.key")
