from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.config import get_settings
from src.modules.platform_identity.sign_in_settings_schema import (
    PlatformSignInPolicyUpdateRequest,
    PlatformSignInProviderUpdateRequest,
)
from src.modules.platform_identity.sign_in_settings_service import (
    PlatformSignInSettingsRepository,
    PlatformSignInSettingsService,
)
from tests.modules.auth.oauth_connector_test_context import build_official_oauth_connector_registry


class _Repository(PlatformSignInSettingsRepository):
    def __init__(self, value: dict[str, object]) -> None:
        self.record = SimpleNamespace(id=uuid4(), value=value)
        self.saved_value: dict[str, object] | None = None

    async def get_core(self, *, conn=None, for_update: bool = False):
        _ = conn, for_update
        return self.record

    async def save_core(self, *, record, value, actor_user_id, conn):
        _ = actor_user_id, conn
        self.saved_value = value
        record.value = value
        return record


@asynccontextmanager
async def _transaction():
    yield object()


async def _service(monkeypatch: pytest.MonkeyPatch, core: dict[str, object]):
    repository = _Repository(core)
    service = PlatformSignInSettingsService(
        settings=get_settings(),
        connector_registry=await build_official_oauth_connector_registry(),
        repository=repository,
    )
    consume = AsyncMock()
    monkeypatch.setattr(service._step_up, "consume", consume)
    monkeypatch.setattr(service, "tx", _transaction)
    monkeypatch.setattr(
        "src.modules.platform_identity.sign_in_settings_service.write_required_activity_event",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "src.modules.platform_identity.sign_in_settings_service.invalidate_core_settings_cache",
        lambda: None,
    )
    return service, repository, consume


@pytest.mark.asyncio
async def test_settings_output_masks_secrets_and_normalizes_domains(monkeypatch: pytest.MonkeyPatch) -> None:
    service, _repository, _consume = await _service(
        monkeypatch,
        {
            "auth": {
                "configuration_revision": 4,
                "public_register_email_domains_allowlist": [" Example.COM ", "@example.com", ".Team.IO"],
            },
            "oauth_google": {
                "client_id": " google-client ",
                "client_secret": "stored-secret",
                "enabled": True,
            },
        },
    )

    settings = await service.get_settings()

    assert settings.revision == 4
    assert settings.registration.email_domains_allowlist == ("example.com", "team.io")
    google = next(provider for provider in settings.providers if provider.key == "google")
    assert google.client_id == "google-client"
    assert google.has_client_secret is True
    assert "stored-secret" not in settings.model_dump_json()


@pytest.mark.asyncio
async def test_provider_edit_preserves_secret_and_binds_step_up(monkeypatch: pytest.MonkeyPatch) -> None:
    service, repository, consume = await _service(
        monkeypatch,
        {
            "auth": {"configuration_revision": 7},
            "oauth_google": {
                "client_id": "old-client",
                "client_secret": "stored-secret",
                "enabled": True,
            },
        },
    )
    actor_user_id = uuid4()
    actor_session_id = uuid4()
    request = PlatformSignInProviderUpdateRequest(
        expected_revision=7,
        enabled=True,
        client_id=" new-client ",
        client_secret=None,
        clear_client_secret=False,
        idempotency_key="provider-edit",
        correlation_id=uuid4(),
        step_up_proof="proof",
    )

    result = await service.update_provider(
        actor_user_id=actor_user_id,
        actor_session_id=actor_session_id,
        provider_key="google",
        request=request,
    )

    assert repository.saved_value is not None
    assert repository.saved_value["oauth_google"] == {
        "enabled": True,
        "client_id": "new-client",
        "client_secret": "stored-secret",
    }
    assert result.revision == 8
    consume.assert_awaited_once()
    proof_request = consume.await_args.kwargs["request"]
    assert proof_request.expected_revision == 7
    assert proof_request.scope == {"operation": "update_provider", "provider_key": "google"}


def test_policy_rejects_email_rules_without_required_email() -> None:
    with pytest.raises(ValidationError):
        PlatformSignInPolicyUpdateRequest(
            expected_revision=1,
            public_registration_enabled=True,
            require_email=False,
            require_email_verification=True,
            email_domains_allowlist=("example.com",),
            auto_provision_enabled=False,
            auto_accept_email_invites=False,
            idempotency_key="policy-invalid",
            correlation_id=uuid4(),
            step_up_proof="proof",
        )


def test_provider_secret_replace_and_clear_are_mutually_exclusive() -> None:
    with pytest.raises(ValidationError):
        PlatformSignInProviderUpdateRequest(
            expected_revision=1,
            enabled=False,
            client_id="client-id",
            client_secret="replacement",
            clear_client_secret=True,
            idempotency_key="provider-invalid",
            correlation_id=uuid4(),
            step_up_proof="proof",
        )
