from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from src.config import Settings, get_settings
from src.core.exceptions import Conflict
from src.llm.keys import decrypt_virtual_key
from src.models.analytics.audit_event import AuditEvent
from src.models.system.setting import (
    PlatformSystemSettingsCommandReceipt,
    SettingRecord,
)
from src.modules.commerce.platform_operations_schema import ProviderConfigurationWrite
from src.modules.commerce.provider_configuration import (
    PROVIDER_CONFIGURATION_NAMESPACE,
    BillingProviderConfigurationWriter,
)
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


def _settings_with_master_key(tmp_path: Path) -> tuple[Settings, Path]:
    settings = get_settings()
    key_path = tmp_path / "billing-provider.key"
    key_path.write_bytes(Fernet.generate_key())
    return (
        settings.model_copy(
            update={
                "ai": settings.ai.model_copy(update={"master_key_path": str(key_path)}),
                "billing": settings.billing.model_copy(
                    update={
                        "provider": "disabled",
                        "stripe_secret_key": SecretStr(""),
                        "stripe_webhook_secret": SecretStr(""),
                        "simulated_signing_secret": SecretStr(""),
                    }
                ),
            }
        ),
        key_path,
    )


def _request(
    *,
    key: str,
    revision: int,
    secret: str | None = "stripe-secret-1",
    webhook_secret: str | None = "stripe-webhook-1",
    provider: str = "stripe",
    mode: str = "test",
) -> ProviderConfigurationWrite:
    return ProviderConfigurationWrite(
        provider=provider,
        mode=mode,
        expected_revision=revision,
        secret=secret,
        webhook_secret=webhook_secret,
        idempotency_key=key,
    )


async def test_provider_configuration_persists_ciphertext_and_applies_runtime(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    settings, key_path = _settings_with_master_key(tmp_path)
    actor_id = uuid4()
    writer = BillingProviderConfigurationWriter(settings)

    result = await writer.write(request=_request(key="provider-write-1", revision=0), actor_user_id=actor_id)

    assert result.model_dump(mode="json") == {
        "provider": "stripe",
        "mode": "test",
        "revision": 1,
        "configured": True,
    }
    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=PROVIDER_CONFIGURATION_NAMESPACE,
    )
    value = record.value
    assert isinstance(value, dict)
    assert value["secret_enc"] != "stripe-secret-1"
    assert value["webhook_secret_enc"] != "stripe-webhook-1"
    assert decrypt_virtual_key(value["secret_enc"], key_path) == "stripe-secret-1"
    assert decrypt_virtual_key(value["webhook_secret_enc"], key_path) == "stripe-webhook-1"
    assert settings.billing.provider == "stripe"
    assert settings.billing.stripe_secret_key.get_secret_value() == "stripe-secret-1"
    assert settings.billing.stripe_webhook_secret.get_secret_value() == "stripe-webhook-1"
    assert await PlatformSystemSettingsCommandReceipt.all().count() == 1
    assert await AuditEvent.filter(event_name="commerce.provider_configuration.updated").count() == 1
    assert "stripe-secret-1" not in json.dumps(result.model_dump(mode="json"))


async def test_provider_configuration_replays_exactly_and_rejects_conflicts(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    settings, _ = _settings_with_master_key(tmp_path)
    actor_id = uuid4()
    writer = BillingProviderConfigurationWriter(settings)
    request = _request(key="provider-replay-1", revision=0)

    first = await writer.write(request=request, actor_user_id=actor_id)
    replay = await writer.write(request=request, actor_user_id=actor_id)

    assert replay == first
    assert await SettingRecord.all().count() == 1
    assert await PlatformSystemSettingsCommandReceipt.all().count() == 1
    assert await AuditEvent.filter(event_name="commerce.provider_configuration.updated").count() == 1

    with pytest.raises(Conflict, match="BILLING_PROVIDER_IDEMPOTENCY_CONFLICT"):
        await writer.write(
            request=_request(key="provider-replay-1", revision=0, mode="live"),
            actor_user_id=actor_id,
        )

    with pytest.raises(Conflict, match="BILLING_PROVIDER_REVISION_STALE"):
        await writer.write(request=_request(key="provider-stale-1", revision=0), actor_user_id=actor_id)


async def test_provider_configuration_rotates_only_supplied_secret_and_increments_revision(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    settings, key_path = _settings_with_master_key(tmp_path)
    actor_id = uuid4()
    writer = BillingProviderConfigurationWriter(settings)
    await writer.write(request=_request(key="provider-rotate-1", revision=0), actor_user_id=actor_id)

    rotated = await writer.write(
        request=_request(
            key="provider-rotate-2",
            revision=1,
            mode="live",
            secret="stripe-secret-2",
            webhook_secret=None,
        ),
        actor_user_id=actor_id,
    )

    assert rotated.revision == 2
    assert rotated.mode == "live"
    assert settings.billing.stripe_secret_key.get_secret_value() == "stripe-secret-2"
    assert settings.billing.stripe_webhook_secret.get_secret_value() == "stripe-webhook-1"
    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=PROVIDER_CONFIGURATION_NAMESPACE,
    )
    value = record.value
    assert isinstance(value, dict)
    assert decrypt_virtual_key(value["secret_enc"], key_path) == "stripe-secret-2"
    assert decrypt_virtual_key(value["webhook_secret_enc"], key_path) == "stripe-webhook-1"
