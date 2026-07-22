from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.common.email.connector import EmailConnector
from src.config import get_settings
from src.core.connectors import (
    ConnectorDefinition,
    ConnectorKind,
    ConnectorRegistrationError,
    ConnectorTrustLevel,
)
from src.core.extensions.manager import ExtensionManager, ExtensionRegistrationError
from src.core.extensions.manifest import parse_manifest
from src.core.registries import ConnectorRegistry
from src.modules.commerce.billing_connector import BillingConnector


def _write_invalid_connector_extension(project_root: Path) -> Path:
    extension_dir = project_root / "plugins" / "invalid-connector"
    (extension_dir / "src").mkdir(parents=True)
    (extension_dir / "extension.json").write_text(
        json.dumps({
            "name": "invalid-connector",
            "version": "1.0.0",
            "entry": "src/plugin.py",
            "provides": {"connectors": ["billing.missing"]},
        }),
        encoding="utf-8",
    )
    (extension_dir / "src" / "plugin.py").write_text(
        """
class Plugin:
    def arclayer_register(self, registry):
        pass

def create_plugin():
    return Plugin()
""",
        encoding="utf-8",
    )
    return extension_dir


def _connector_definition(key: str = "billing.test") -> ConnectorDefinition:
    return ConnectorDefinition(
        key=key,
        kind=ConnectorKind.BILLING,
        version="1.0.0",
        trust_level=ConnectorTrustLevel.THIRD_PARTY,
    )


def _write_registered_connector_extension(
    project_root: Path,
    *,
    registered_owner: str,
) -> Path:
    extension_name = "registered-connector"
    connector_key = "billing.registered"
    extension_dir = project_root / "plugins" / extension_name
    (extension_dir / "src").mkdir(parents=True)
    (extension_dir / "extension.json").write_text(
        json.dumps({
            "name": extension_name,
            "version": "1.0.0",
            "entry": "src/plugin.py",
            "provides": {"connectors": [connector_key]},
        }),
        encoding="utf-8",
    )
    (extension_dir / "src" / "plugin.py").write_text(
        f'''from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel

class Plugin:
    def arclayer_register(self, registry):
        registry.connectors.register(
            extension="{registered_owner}",
            definition=ConnectorDefinition(
                key="{connector_key}",
                kind=ConnectorKind.BILLING,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.THIRD_PARTY,
            ),
            factory=object,
        )

def create_plugin():
    return Plugin()
''',
        encoding="utf-8",
    )
    return extension_dir


def test_manifest_parses_declared_connector_capabilities(tmp_path: Path) -> None:
    extension_dir = _write_invalid_connector_extension(tmp_path)

    manifest = parse_manifest(extension_dir / "extension.json")

    assert manifest.provides.connectors == ["billing.missing"]


def test_connector_registry_registers_and_resolves_typed_registration() -> None:
    registry = ConnectorRegistry()
    definition = _connector_definition()

    registry.register(extension="test-connector", definition=definition, factory=object)

    registration = registry.resolve(definition.key)
    assert registration is not None
    assert registration.extension == "test-connector"
    assert registration.definition is definition
    assert registration.factory is object

    with pytest.raises(ValidationError, match="frozen"):
        registration.extension = "other-connector"


def test_connector_definition_rejects_non_json_schemas() -> None:
    with pytest.raises(ValidationError, match="config_schema"):
        ConnectorDefinition.model_validate({
            "key": "billing.invalid-schema",
            "kind": ConnectorKind.BILLING,
            "version": "1.0.0",
            "trust_level": ConnectorTrustLevel.THIRD_PARTY,
            "config_schema": {"factory": object()},
        })


def test_connector_registry_rejects_duplicate_keys() -> None:
    registry = ConnectorRegistry()
    definition = _connector_definition()
    registry.register(extension="test-connector", definition=definition, factory=object)

    with pytest.raises(ConnectorRegistrationError, match="already registered by extension 'test-connector'"):
        registry.register(extension="other-connector", definition=definition, factory=object)


async def test_declared_connector_must_be_registered_by_its_extension(tmp_path: Path) -> None:
    manager = ExtensionManager(tmp_path)
    await manager.load_extension(_write_invalid_connector_extension(tmp_path))

    with pytest.raises(ExtensionRegistrationError, match="billing.missing"):
        await manager.register_all(app=None)


async def test_registered_connector_owner_must_match_declaring_extension(tmp_path: Path) -> None:
    manager = ExtensionManager(tmp_path)
    extension_dir = _write_registered_connector_extension(
        tmp_path,
        registered_owner="other-connector",
    )
    await manager.load_extension(extension_dir)

    with pytest.raises(ExtensionRegistrationError, match="billing.registered"):
        await manager.register_all(app=None)


async def test_declared_connector_registered_by_its_extension_succeeds(tmp_path: Path) -> None:
    manager = ExtensionManager(tmp_path)
    extension_dir = _write_registered_connector_extension(
        tmp_path,
        registered_owner="registered-connector",
    )
    await manager.load_extension(extension_dir)

    await manager.register_all(app=None)

    registration = manager.registry.connectors.resolve("billing.registered")
    assert registration is not None
    assert registration.extension == "registered-connector"


async def test_official_stripe_extension_registers_typed_billing_connector(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BILLING__PROVIDER", "stripe")
    monkeypatch.setenv("BILLING__STRIPE_SECRET_KEY", "sk_test_registry")
    monkeypatch.setenv("BILLING__STRIPE_WEBHOOK_SECRET", "whsec_registry")
    get_settings.cache_clear()

    project_root = Path(__file__).resolve().parents[4]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-stripe")
    await manager.register_all(app=None)

    registration = manager.registry.connectors.resolve("billing.stripe")
    assert registration is not None
    assert registration.extension == "arclayer-stripe"
    assert registration.definition.kind is ConnectorKind.BILLING
    assert registration.definition.trust_level is ConnectorTrustLevel.OFFICIAL
    assert registration.definition.capabilities == (
        "checkout",
        "customer_portal",
        "subscription_webhook",
    )
    assert registration.definition.admin is not None
    assert registration.definition.admin.settings_section == "billing"
    assert isinstance(registration.factory(), BillingConnector)

    get_settings.cache_clear()


async def test_official_oauth_extension_registers_provider_connectors() -> None:
    project_root = Path(__file__).resolve().parents[4]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-oauth")
    await manager.register_all(app=None)

    registrations = manager.registry.connectors.list_registrations()
    assert [item.definition.key for item in registrations] == [
        "oauth.google",
        "oauth.github",
        "oauth.microsoft",
        "oauth.discord",
    ]
    assert all(item.definition.kind is ConnectorKind.OAUTH for item in registrations)
    assert all(item.definition.trust_level is ConnectorTrustLevel.OFFICIAL for item in registrations)
    assert tuple(item.definition.admin.settings_section for item in registrations if item.definition.admin) == (
        "oauth_google",
        "oauth_github",
        "oauth_microsoft",
        "oauth_discord",
    )


async def test_official_email_extension_registers_provider_connectors() -> None:
    project_root = Path(__file__).resolve().parents[4]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-email")
    await manager.register_all(app=None)

    registrations = manager.registry.connectors.list_registrations()
    assert tuple(item.definition.key for item in registrations) == (
        "email.resend",
        "email.cloudflare",
        "email.ses",
    )
    assert all(item.definition.kind is ConnectorKind.EMAIL for item in registrations)
    assert all(item.definition.trust_level is ConnectorTrustLevel.OFFICIAL for item in registrations)
    assert all(isinstance(item.factory(), EmailConnector) for item in registrations)
