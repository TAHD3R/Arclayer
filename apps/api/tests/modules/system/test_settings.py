from apps.api.config import ApplicationSettings, Settings, get_settings


def test_settings_defaults(monkeypatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("APP_NAME", raising=False)

    settings = get_settings()

    assert settings.app_env == "development"
    assert settings.debug is True
    assert settings.enable_docs is True
    assert settings.application.app_name == "Celestial Framework API"


def test_settings_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_NAME", "Celestial Framework API (Prod)")

    settings = get_settings()

    assert settings.app_env == "production"
    assert settings.debug is False
    assert settings.enable_docs is False
    assert settings.application.app_name == "Celestial Framework API (Prod)"


def test_settings_env_overrides_init(monkeypatch) -> None:
    """
    Env vars should take precedence over init kwargs for Settings and nested settings.

    This guarantees deployment overrides always win, even if code passes explicit Settings objects.
    """

    monkeypatch.setenv("APPLICATION__APP_NAME", "FromEnv")
    settings = Settings(application=ApplicationSettings(app_name="FromInit"))
    assert settings.application.app_name == "FromEnv"


def test_settings_dotenv_overrides_init(tmp_path) -> None:
    """
    Dotenv files (passed via _env_file) must also override init kwargs.

    This is important in tests and local dev where `.env.*` is the primary configuration source.
    """

    env_file = tmp_path / ".env.test"
    env_file.write_text("APPLICATION__APP_NAME=FromDotEnv\n", encoding="utf-8")

    settings = Settings(
        _env_file=(str(env_file),),
        _env_file_encoding="utf-8",
        application=ApplicationSettings(app_name="FromInit"),
    )
    assert settings.application.app_name == "FromDotEnv"
