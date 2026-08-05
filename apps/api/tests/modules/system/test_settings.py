import pytest

from src.config import ApplicationSettings, Settings, get_settings


def test_settings_defaults(monkeypatch) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("APPLICATION__APP_NAME", raising=False)

    settings = get_settings()

    assert settings.app_env == "development"
    assert settings.debug is True
    assert settings.enable_docs is True
    assert settings.application.app_name == "Arclayer API"


def test_settings_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APPLICATION__APP_NAME", "Arclayer API (Prod)")
    monkeypatch.setenv("SEARCH__ENABLED", "1")
    monkeypatch.setenv("SEARCH__BACKEND", "meilisearch")
    monkeypatch.setenv("SEARCH__MEILISEARCH_URL", "http://search.local:7700")
    monkeypatch.setenv("PUBLIC_ID__SECRET", "test-public-id-secret")

    settings = get_settings()

    assert settings.app_env == "production"
    assert settings.debug is False
    assert settings.enable_docs is False
    assert settings.application.app_name == "Arclayer API (Prod)"
    assert settings.search.enabled is True
    assert settings.search.backend == "meilisearch"
    assert settings.search.meilisearch_url == "http://search.local:7700"


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


def test_settings_dotenv_mail_alias_loads_email_settings(tmp_path) -> None:
    env_file = tmp_path / ".env.test"
    env_file.write_text(
        "\n".join([
            "MAIL__ENABLED=true",
            "MAIL__SERVER=127.0.0.1",
            "MAIL__PORT=1025",
            "MAIL__STARTTLS=false",
            "MAIL__USE_CREDENTIALS=false",
        ])
        + "\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=(str(env_file),), _env_file_encoding="utf-8")

    assert settings.email.enabled is True
    assert settings.email.server == "127.0.0.1"
    assert settings.email.port == 1025
    assert settings.email.starttls is False
    assert settings.email.use_credentials is False


@pytest.mark.parametrize("app_env", ("development", "test"))
def test_simulated_billing_provider_is_ready_only_with_its_signing_secret(monkeypatch, app_env: str) -> None:
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("BILLING__PROVIDER", "simulated")
    monkeypatch.setenv("BILLING__SIMULATED_SIGNING_SECRET", "simulated-signing-secret")

    settings = get_settings()

    assert settings.billing.provider == "simulated"
    assert settings.billing.provider_configured is True
    assert settings.billing.webhook_secret_configured is True
    assert settings.billing.webhook_enabled is True


def test_simulated_billing_provider_is_rejected_in_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("PUBLIC_ID__SECRET", "test-public-id-secret")
    monkeypatch.setenv("BILLING__PROVIDER", "simulated")
    monkeypatch.setenv("BILLING__SIMULATED_SIGNING_SECRET", "simulated-signing-secret")

    with pytest.raises(ValueError, match="BILLING__PROVIDER=simulated is not allowed"):
        get_settings()
