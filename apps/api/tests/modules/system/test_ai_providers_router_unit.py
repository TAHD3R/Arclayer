from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI

from src.config import Settings, get_settings
from src.core.exceptions import BadRequest, Conflict, init_exception_handlers
from src.modules.platform_identity.http import get_current_platform_session
from src.modules.system.ai_providers.router import get_system_ai_provider_service
from src.modules.system.ai_providers.router import router as ai_providers_router
from src.modules.system.ai_providers.schema import SystemAIProviderUpdateRequest
from src.modules.system.ai_providers.service import SystemAIProviderService
from tests.utils.asgi_client import asgi_client


async def test_system_ai_providers_route_returns_empty_list() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(ai_providers_router, prefix="/platform-api/v1/ai")

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    class EmptyProviderService:
        async def list_providers(self):
            return []

    app.dependency_overrides[get_current_platform_session] = _platform_owner
    app.dependency_overrides[get_system_ai_provider_service] = lambda: EmptyProviderService()

    async with asgi_client(app) as client:
        res = await client.get("/platform-api/v1/ai/providers")

    assert res.status_code == 200
    assert res.json()["data"] == {"providers": []}


async def test_system_ai_provider_service_provisions_litellm_model_and_key() -> None:
    settings = Settings()
    settings.ai = settings.ai.model_copy(
        update={
            "litellm_base_url": "http://litellm.internal:4000",
            "litellm_master_key": "master-key",
            "litellm_timeout_seconds": 9.0,
        },
    )
    service = SystemAIProviderService(settings)
    litellm_client = SimpleNamespace(
        register_model=AsyncMock(return_value={"status": "ok"}),
        generate_key=AsyncMock(return_value={"key": "sk-virtual", "key_id": "key-123"}),
    )

    with patch("src.modules.system.ai_providers.service.LiteLLMClient", return_value=litellm_client) as client_cls:
        provisioned = await service._provision_litellm_access(
            provider="deepseek",
            label="DeepSeek",
            compatibility="deepseek",
            provider_api_key="provider-secret",
            base_url="https://api.deepseek.com",
            request_model="deepseek-v4-pro",
        )

    client_cls.assert_called_once_with(base_url="http://litellm.internal:4000", timeout_seconds=9.0)
    litellm_client.register_model.assert_awaited_once_with(
        master_key="master-key",
        model_name="deepseek-v4-pro",
        provider_model="deepseek/deepseek-v4-pro",
        provider_api_key="provider-secret",
        api_base="https://api.deepseek.com",
        metadata={
            "provider": "deepseek",
            "label": "DeepSeek",
            "compatibility": "deepseek",
            "source": "system.ai_providers",
        },
    )
    litellm_client.generate_key.assert_awaited_once_with(
        master_key="master-key",
        models=["deepseek-v4-pro"],
        metadata={
            "provider": "deepseek",
            "label": "DeepSeek",
            "compatibility": "deepseek",
            "source": "system.ai_providers",
        },
    )
    assert provisioned.virtual_key == "sk-virtual"
    assert provisioned.litellm_key_id == "key-123"


async def test_system_ai_provider_service_requires_litellm_master_key() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())

    with pytest.raises(BadRequest) as exc_info:
        await service._provision_litellm_access(
            provider="deepseek",
            label="DeepSeek",
            compatibility="openai_compatible",
            provider_api_key="provider-secret",
            base_url=None,
            request_model="deepseek-chat",
        )

    assert exc_info.value.error == "AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED"


async def test_system_ai_provider_update_rejects_unsafe_credential_rotation() -> None:
    service = SystemAIProviderService(Settings())
    provider_record = SimpleNamespace(
        provider="deepseek",
        metadata_json={"request_model": "deepseek-chat", "base_url": "https://api.deepseek.com"},
    )

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider_record)),
        pytest.raises(Conflict) as exc_info,
    ):
        await service.update_provider(
            uuid4(),
            SystemAIProviderUpdateRequest(request_model="deepseek-reasoner"),
            actor_user_id=uuid4(),
        )

    assert exc_info.value.error == "AI_PROVIDER_CREDENTIAL_REVOCATION_PORT_UNAVAILABLE"
    assert "provider-secret" not in exc_info.value.message


async def test_system_ai_provider_readiness_failure_does_not_disclose_virtual_key() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())
    provider = SimpleNamespace(
        id=uuid4(),
        provider="deepseek",
        virtual_key_enc="encrypted-secret",
        metadata_json={"request_model": "deepseek-v4-pro"},
        save=AsyncMock(),
    )
    litellm_client = SimpleNamespace(chat=AsyncMock(side_effect=httpx.ConnectError("provider-secret")))

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider)),
        patch.object(service, "_decrypt_virtual_key", return_value="sk-virtual-secret"),
        patch("src.modules.system.ai_providers.service.LiteLLMClient", return_value=litellm_client),
    ):
        result = await service.test_readiness(provider_id=provider.id, actor_user_id=uuid4())

    assert result.status == "unhealthy"
    assert result.failure_code == "AI_PROVIDER_READINESS_TEST_FAILED"
    assert "secret" not in result.model_dump_json()
    assert provider.metadata_json["readiness"]["failure_code"] == "AI_PROVIDER_READINESS_TEST_FAILED"
