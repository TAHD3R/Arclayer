from pathlib import Path

from src.config import ApplicationSettings, EmailSettings, SecuritySettings, StorageSettings


def _norm(p: Path) -> str:
    return str(p).replace("\\", "/")


def test_application_static_dir_resolves_repo_relative_path() -> None:
    settings = ApplicationSettings(static_dir=Path("static"))
    assert settings.static_dir.is_absolute()
    assert _norm(settings.static_dir).endswith("/static")
    assert "/apps/api/static" not in _norm(settings.static_dir)


def test_application_data_dir_resolves_repo_relative_path() -> None:
    settings = ApplicationSettings(data_dir=Path("data"))
    assert settings.data_dir.is_absolute()
    assert _norm(settings.data_dir).endswith("/data")
    assert "/apps/api/data" not in _norm(settings.data_dir)


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
    assert "/apps/data/" not in _norm(settings.master_key_path)


def test_security_signing_key_paths_resolve_repo_relative_path() -> None:
    settings = SecuritySettings(
        signing_private_key_path=Path("data/secrets/signing.ed25519"),
        signing_public_key_path=Path("data/secrets/signing.ed25519.pub"),
    )
    assert settings.signing_private_key_path.is_absolute()
    assert settings.signing_public_key_path.is_absolute()
    assert _norm(settings.signing_private_key_path).endswith("/data/secrets/signing.ed25519")
    assert _norm(settings.signing_public_key_path).endswith("/data/secrets/signing.ed25519.pub")
    assert "/apps/data/" not in _norm(settings.signing_private_key_path)
    assert "/apps/data/" not in _norm(settings.signing_public_key_path)


def test_security_default_secret_paths_resolve_under_repo_root(monkeypatch) -> None:
    monkeypatch.delenv("SECURITY__MASTER_KEY_PATH", raising=False)
    monkeypatch.delenv("SECURITY__SIGNING_PRIVATE_KEY_PATH", raising=False)
    monkeypatch.delenv("SECURITY__SIGNING_PUBLIC_KEY_PATH", raising=False)

    settings = SecuritySettings()

    assert _norm(settings.master_key_path).endswith("/data/secrets/master.key")
    assert _norm(settings.signing_private_key_path).endswith("/data/secrets/signing.ed25519")
    assert _norm(settings.signing_public_key_path).endswith("/data/secrets/signing.ed25519.pub")
    assert "/apps/data/" not in _norm(settings.master_key_path)
    assert "/apps/data/" not in _norm(settings.signing_private_key_path)
    assert "/apps/data/" not in _norm(settings.signing_public_key_path)


def test_security_blank_optional_guard_values_normalize_to_none() -> None:
    settings = SecuritySettings.model_validate({
        "log_request_level": "",
        "custom_log_file": "   ",
        "redis_url": "",
    })
    assert settings.log_request_level is None
    assert settings.custom_log_file is None
    assert settings.redis_url is None
