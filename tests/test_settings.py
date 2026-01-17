from apps.api.config import get_settings


def test_settings_defaults(monkeypatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("APP_NAME", raising=False)

    settings = get_settings()

    assert settings.app_env == "development"
    assert settings.debug is True
    assert settings.enable_docs is True
    assert settings.application.app_name == "Celestial CMS API"


def test_settings_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_NAME", "Celestial CMS API (Prod)")

    settings = get_settings()

    assert settings.app_env == "production"
    assert settings.debug is False
    assert settings.enable_docs is False
    assert settings.application.app_name == "Celestial CMS API (Prod)"
